import { useState, useEffect, useRef } from 'react';
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

export default function MicrophoneRecorder({ onRecordingComplete, disabled, langCode = 'zh' }) {
  const [isRecording, setIsRecording] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [status, setStatus] = useState('idle');

  const mediaStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const liveWsRef = useRef(null);
  const projectIdRef = useRef(null);

  useEffect(() => {
    return () => {
      if (liveWsRef.current) liveWsRef.current.close();
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const deleteTempProject = async (pid) => {
    try {
      await fetch(`${API}/api/voice/projects/${encodeURIComponent(pid)}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Failed to cleanup temp project', e);
    }
  };

  const startRecording = async () => {
    if (disabled) return;
    setStatus('initializing');
    setLiveText('');
    
    try {
      const response = await fetch(`${API}/api/voice/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Temp Gameplay ' + new Date().getTime(), sourceLang: langCode }),
      });
      const data = await response.json();
      const pid = data.project.id;
      projectIdRef.current = pid;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
      mediaStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
      recorderRef.current = recorder;
      chunksRef.current = [];

      setIsRecording(true);
      setStatus('recording');

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
        } else if (msg.type === 'words' || msg.type === 'final') {
          setLiveText('');
          const fullText = (msg.segments || []).map(s => s.text).join(' ');
          if (msg.type === 'final') {
            setIsRecording(false);
            setStatus('idle');
            onRecordingComplete(fullText);
            deleteTempProject(pid);
          }
        }
      };
      
      ws.onerror = () => setStatus('error');
    } catch (e) {
      console.error(e);
      setStatus('error');
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (!isRecording) return;
    setStatus('transcribing');
    const recorder = recorderRef.current;
    const ws = liveWsRef.current;

    const finish = async () => {
      const fullBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
      chunksRef.current = [];
      const base64 = await blobToBase64(fullBlob);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop', audio_b64: base64 }));
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };

    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = finish;
      recorder.stop();
    } else {
      await finish();
    }
  };

  return (
    <div className="mt-1 flex w-full flex-col items-center gap-1 rounded-[1.4rem] border border-white/10 bg-[#0b1727]/90 px-4 py-3 shadow-[0_18px_55px_rgba(0,0,0,.3)] sm:mt-2 sm:gap-3 sm:rounded-[1.75rem] sm:px-6 sm:py-5 [@media(max-height:650px)]:py-2">
      <div className="flex h-7 w-full items-end justify-center overflow-hidden px-2 sm:h-10 sm:px-4">
        {status === 'recording' && (
          <span className="truncate font-display text-xl font-bold text-[var(--accent-soft)] animate-pulse">
            {liveText || "Listening..."}
          </span>
        )}
        {status === 'transcribing' && (
          <span className="text-gray-400 font-display font-bold text-lg truncate animate-pulse">
            Transcribing...
          </span>
        )}
        {status === 'initializing' && (
          <span className="text-gray-400 font-display font-bold text-lg truncate animate-pulse">
            Connecting...
          </span>
        )}
      </div>

      <div className="relative flex h-24 w-24 items-center justify-center sm:h-32 sm:w-32 [@media(max-height:650px)]:h-20 [@media(max-height:650px)]:w-20">
        {isRecording && (
          <>
            <div className="absolute inset-0 rounded-[2.4rem] bg-[var(--accent)] animate-ping opacity-20"></div>
            <div className="absolute inset-3 rounded-[2rem] bg-[var(--accent)] animate-ping opacity-25" style={{ animationDelay: '0.2s' }}></div>
          </>
        )}
        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onMouseLeave={stopRecording}
          onTouchStart={() => startRecording()}
          onTouchEnd={() => stopRecording()}
          disabled={disabled || status === 'transcribing' || status === 'initializing'}
          className={`relative flex h-20 w-20 touch-none items-center justify-center rounded-[1.6rem] border transition-all sm:h-24 sm:w-24 sm:rounded-[2rem] [@media(max-height:650px)]:h-16 [@media(max-height:650px)]:w-16 ${
            disabled ? 'bg-[#37464F] opacity-50 cursor-not-allowed' :
            isRecording 
              ? 'border-[var(--accent-55)] bg-[var(--accent)] scale-105'
              : 'border-[var(--accent-30)] bg-[#07101d] shadow-inner hover:bg-[#102239] active:translate-y-0.5'
          }`}
        >
          <svg className={`w-9 h-9 ${isRecording ? 'text-[var(--accent-ink)]' : 'text-[var(--accent-soft)]'}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      <span className="mt-1 font-display text-[10px] font-extrabold uppercase tracking-[.25em] text-slate-500">
        {isRecording ? 'Release to Send' : 'Hold to Speak'}
      </span>
    </div>
  );
}
