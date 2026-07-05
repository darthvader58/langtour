import { useState, useEffect, useRef } from 'react';
import AudioTranscriptPlayer from '../components/voice/AudioTranscriptPlayer';
import { API } from '../api';

function wsBase() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result.replace('data:', '').replace(/^.+,/, '');
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export default function VoiceTestPage() {
  const [projectId, setProjectId] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [liveText, setLiveText] = useState('');
  const [status, setStatus] = useState('draft');
  const [recording, setRecording] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [localAudioUrl, setLocalAudioUrl] = useState('');
  const [liveStream, setLiveStream] = useState(null);
  const [projectsList, setProjectsList] = useState([]);
  const [sourceLang, setSourceLang] = useState('zh');

  const mediaStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const liveWsRef = useRef(null);
  const timerRef = useRef(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    return () => {
      window.clearInterval(timerRef.current);
      if (liveWsRef.current) liveWsRef.current.close();
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const fetchProjectsList = async () => {
    try {
      const response = await fetch(`${API}/api/voice/projects?limit=50`);
      const data = await response.json();
      const extractProjects = (nodes) => {
        let p = [];
        for (const n of nodes) {
           if (n.type === 'project') p.push(n);
           if (n.children) p = p.concat(extractProjects(n.children));
        }
        return p;
      };
      setProjectsList(extractProjects(data.tree?.children || []));
    } catch (e) {
      console.error('Failed to fetch projects', e);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/api/voice/projects?limit=50`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        const extractProjects = (nodes) => {
          let p = [];
          for (const n of nodes) {
            if (n.type === 'project') p.push(n);
            if (n.children) p = p.concat(extractProjects(n.children));
          }
          return p;
        };
        setProjectsList(extractProjects(data.tree?.children || []));
      })
      .catch((e) => console.error('Failed to fetch projects', e));
    return () => { cancelled = true; };
  }, []);

  const startRecording = async () => {
    try {
      const response = await fetch(`${API}/api/voice/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Recording ' + new Date().toISOString(), sourceLang }),
      });
      const data = await response.json();
      const pid = data.project.id;
      setProjectId(pid);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
      mediaStreamRef.current = stream;
      setLiveStream(stream);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
      recorderRef.current = recorder;
      chunksRef.current = [];

      setRecording(true);
      setPaused(false);
      pausedRef.current = false;
      setElapsed(0);
      setLiveText('');
      setTranscript([]);
      setStatus('recording');

      timerRef.current = window.setInterval(() => {
        if (!pausedRef.current) setElapsed(e => e + 1);
      }, 1000);

      const wsUrl = wsBase() + `/api/voice/projects/${encodeURIComponent(pid)}/live-ws`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      liveWsRef.current = ws;

      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        chunksRef.current.push(event.data);
        if (ws.readyState === WebSocket.OPEN) {
          event.data.arrayBuffer().then(buf => {
            if (ws.readyState === WebSocket.OPEN) ws.send(buf);
          });
        }
      };

      ws.onmessage = (event) => {
        let msg = JSON.parse(event.data);
        if (msg.type === 'ready') {
          if (recorder.state === 'inactive') recorder.start(100);
        } else if (msg.type === 'delta') {
          setLiveText(msg.text || '');
        } else if (msg.type === 'words') {
          setTranscript(msg.segments || []);
          setLiveText('');
        } else if (msg.type === 'refining') {
          setStatus('transcribing');
        } else if (msg.type === 'final') {
          setTranscript(msg.segments || []);
          setLiveText('');
          setStatus('completed');
          setHasAudio(true);
          ws.close();
        }
      };

    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  };

  const stopRecording = async () => {
    window.clearInterval(timerRef.current);
    setRecording(false);
    setStatus('transcribing');
    const recorder = recorderRef.current;
    const ws = liveWsRef.current;

    const finish = async () => {
      const fullBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
      chunksRef.current = [];
      setLocalAudioUrl(URL.createObjectURL(fullBlob));
      const base64 = await blobToBase64(fullBlob);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop', audio_b64: base64 }));
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
      fetchProjectsList(); // Refresh list to show new recording
    };

    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = finish;
      recorder.stop();
    } else {
      await finish();
    }
  };

  const loadProject = async (id) => {
    try {
      const res = await fetch(`${API}/api/voice/projects/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!data.project) return;
      setProjectId(data.project.id);
      setSourceLang(data.project.sourceLang || 'zh');
      setTranscript(data.project.transcript || []);
      setStatus(data.project.status);
      setHasAudio(data.project.has_audio);
      setLocalAudioUrl('');
      setRecording(false);
      setPaused(false);
      setLiveText('');
    } catch (e) {
      console.error(e);
    }
  };

  const deleteProject = async (id, e) => {
    e.stopPropagation();
    try {
      await fetch(`${API}/api/voice/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (projectId === id) {
        startNewRecording();
      }
      fetchProjectsList();
    } catch (err) {
      console.error('Failed to delete project', err);
    }
  };

  const startNewRecording = () => {
    setProjectId(null);
    setTranscript([]);
    setLiveText('');
    setStatus('draft');
    setHasAudio(false);
    setLocalAudioUrl('');
    setRecording(false);
    setPaused(false);
    setSourceLang('zh');
  };

  const projectAudioUrl = projectId && hasAudio ? `${API}/api/voice/projects/${encodeURIComponent(projectId)}/audio` : '';
  const audioUrl = localAudioUrl || projectAudioUrl;

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: '100vh' }}>
      {/* Sidebar */}
      <div style={{ width: 260, borderRight: '1px solid #333', overflowY: 'auto', backgroundColor: '#1e1e1e', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottom: '1px solid #333' }}>
          <h3 style={{ margin: 0 }}>Recordings</h3>
          <button 
            onClick={startNewRecording}
            style={{ padding: '4px 8px', fontSize: 12, backgroundColor: '#4caf50', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            + New
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {projectsList.map(p => (
            <div 
              key={p.projectId} 
              onClick={() => loadProject(p.projectId)}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                borderBottom: '1px solid #333',
                backgroundColor: projectId === p.projectId ? '#2c2c2c' : 'transparent',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: '500' }}>{p.name}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                  {new Date(p.created_at).toLocaleString()}
                </div>
              </div>
              <button
                onClick={(e) => deleteProject(p.projectId, e)}
                style={{ background: 'transparent', border: 'none', color: '#f44336', cursor: 'pointer', padding: 4, fontSize: 16 }}
                title="Delete recording"
              >
                ✕
              </button>
            </div>
          ))}
          {projectsList.length === 0 && (
            <div style={{ padding: 16, color: '#888', fontSize: 13 }}>No recordings yet.</div>
          )}
        </div>
      </div>
      
      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <h1 style={{ margin: 0 }}>Deepgram STT Test Page</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 14 }}>Translation:</span>
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              disabled={!!projectId}
              style={{ padding: '6px 12px', borderRadius: 4, background: '#333', color: '#fff', border: 'none', cursor: projectId ? 'not-allowed' : 'pointer' }}
            >
              <option value="zh">Chinese ➞ English</option>
              <option value="en">English ➞ Chinese</option>
            </select>
          </div>
        </div>
        <AudioTranscriptPlayer
          audioUrl={audioUrl}
          transcript={transcript}
          liveStream={liveStream}
          liveText={liveText}
          provisional={recording || (status === 'transcribing')}
          isRecording={recording}
          isPaused={paused}
          elapsed={elapsed}
          status={status}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          onResumeRecording={() => { setPaused(false); pausedRef.current = false; recorderRef.current.resume(); }}
          onPauseRecording={() => { setPaused(true); pausedRef.current = true; recorderRef.current.pause(); }}
        />
      </div>
    </div>
  );
}
