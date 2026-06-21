import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { font, fontSize, motion, radius, shadow, space, theme } from '../../theme';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/primitives';
import SegmentedText from '../SegmentedText';
import Waveform from './Waveform';
import LiveWaveform from './LiveWaveform';

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const Segment = memo(function Segment({
  seg,
  index,
  isActive,
  isHovered,
  speakerColor,
  activeRanges,
  playSegment,
  setHoveredIndex,
  registerRef,
  onWordClick,
}) {
  const setRef = useCallback((el) => { registerRef(index, el); }, [registerRef, index]);
  const handleClick = useCallback(() => { playSegment(seg); }, [playSegment, seg]);
  const handleMouseEnter = useCallback(() => { setHoveredIndex(index); }, [setHoveredIndex, index]);
  const handleMouseLeave = useCallback(() => { setHoveredIndex(-1); }, [setHoveredIndex]);
  // Calm transcript line (Apple Podcasts / Notes transcription): no heavy bar,
  // no filled slab. A small speaker dot carries the color; active/hover gets only
  // a quiet wash. The text is the content and it leads.
  const bg = isActive ? 'rgba(125,140,240,0.10)' : (isHovered ? 'rgba(255,255,255,0.035)' : 'transparent');

  return (
    <button
      data-testid="transcript-segment"
      ref={setRef}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-current={isActive ? 'true' : undefined}
      style={{
        textAlign: 'left',
        border: 0,
        padding: `${space.md}px ${space.lg}px`,
        borderRadius: radius.md,
        background: bg,
        opacity: 1,
        cursor: 'pointer',
        transition: 'background 120ms ease',
      }}
    >
      <span style={{
        display: 'flex',
        alignItems: 'center',
        gap: space.sm,
        marginBottom: 6,
      }}>
        <span aria-hidden style={{
          width: 7, height: 7, borderRadius: 999,
          background: speakerColor || theme.inkFaint,
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: fontSize.xs,
          fontWeight: 700,
          color: theme.inkSoft,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          {seg.speaker || 'Unknown'}
        </span>
        <span style={{
          fontSize: fontSize.xs,
          color: theme.inkFaint,
          fontFamily: font.mono,
          marginLeft: 'auto',
        }}>
          {formatTime(seg.start)}
        </span>
      </span>
      <span style={{
        display: 'block',
        margin: 0,
        paddingLeft: 15,
        fontSize: fontSize.lg,
        lineHeight: 1.7,
        color: theme.ink,
      }}>
        <SegmentedText
          text={seg.text || ''}
          activeRanges={activeRanges}
          inline
          onWordClick={onWordClick}
          style={{ display: 'inline' }}
        />
        {/* Translation Subtitle */}
        {seg.translation && (
          <div style={{
            fontSize: 14,
            color: '#888',
            marginTop: 4,
            lineHeight: 1.4,
          }}>
            {seg.translation}
          </div>
        )}
      </span>
    </button>
  );
});

export default function AudioTranscriptPlayer({
  audioUrl,
  transcript = [],
  speakerColors = [],
  liveStream,
  liveText = '',
  provisional = false,
  isRecording = false,
  isPaused = false,
  elapsed = 0,
  status = '',
  isCompact = false,
  onStartRecording,
  onStopRecording,
  onPauseRecording,
  onResumeRecording,
}) {
  const audioRef = useRef(null);
  const scrollRef = useRef(null);
  const segmentRefs = useRef([]);
  const rafRef = useRef(null);
  const pendingSeekRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [decodedDuration, setDecodedDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(-1);

  const speakerMap = useMemo(() => {
    const speakers = [...new Set(transcript.map(s => s.speaker).filter(Boolean))];
    return Object.fromEntries(
      speakers.map((s, i) => [s, speakerColors.length ? i % speakerColors.length : 0])
    );
  }, [transcript, speakerColors]);

  const activeIndex = useMemo(() => {
    if (!transcript.length) return -1;
    const idx = transcript.findIndex(seg => seg.start <= currentTime && currentTime < seg.end);
    return idx;
  }, [transcript, currentTime]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (typeof audio.load === 'function') audio.load();
  }, [audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const applyPendingSeek = () => {
      const pending = pendingSeekRef.current;
      if (!Number.isFinite(pending)) return;
      pendingSeekRef.current = null;
      seekAudioElement(audio, pending);
      setCurrentTime(pending);
    };
    const onLoaded = () => {
      setDuration(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);
      setLoaded(true);
      setError('');
      applyPendingSeek();
    };
    const onDuration = () => {
      setDuration(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);
      applyPendingSeek();
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      audio.currentTime = 0;
      setCurrentTime(0);
    };
    const onTime = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setCurrentTime(audio.currentTime || 0);
      });
    };
    const onError = () => {
      setError('Could not load audio');
      setLoaded(false);
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('canplay', applyPendingSeek);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('canplay', applyPendingSeek);
      audio.removeEventListener('durationchange', onDuration);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('error', onError);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    segmentRefs.current = [];
  }, [transcript]);

  useEffect(() => {
    if (!audioUrl) {
      setPlaying(false);
      setDuration(0);
      setDecodedDuration(0);
      setLoaded(false);
      setError('');
      setCurrentTime(0);
      setHoveredIndex(-1);
    }
  }, [audioUrl]);

  useEffect(() => {
    if (activeIndex < 0) return;
    const el = segmentRefs.current[activeIndex];
    const container = scrollRef.current;
    if (!el || !container) return;

    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const isFullyVisible = elRect.top >= containerRect.top && elRect.bottom <= containerRect.bottom;
    if (!isFullyVisible) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex]);

  const transcriptDuration = useMemo(() => {
    if (!transcript.length) return 0;
    return Math.max(...transcript.map(seg => seg.end ?? 0));
  }, [transcript]);

  const effectiveDuration = audioUrl
    ? (decodedDuration || duration || transcriptDuration)
    : 0;

  const handleDecodedDuration = useCallback((value) => {
    if (Number.isFinite(value) && value > 0) setDecodedDuration(value);
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => setError('Playback failed'));
    else audio.pause();
  };

  const seekToTime = (time) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(time)) return;
    const mediaDuration = (Number.isFinite(audio.duration) && audio.duration > 0)
      ? audio.duration
      : effectiveDuration;
    const clamped = mediaDuration > 0
      ? Math.max(0, Math.min(mediaDuration, time))
      : Math.max(0, time);
    if (audio.readyState === 0) pendingSeekRef.current = clamped;
    seekAudioElement(audio, clamped);
    setCurrentTime(clamped);
  };

  const skip = (delta) => {
    const audio = audioRef.current;
    if (!audio) return;
    const mediaDuration = (Number.isFinite(audio.duration) && audio.duration > 0)
      ? audio.duration
      : effectiveDuration;
    const clamped = Math.max(0, Math.min(mediaDuration, audio.currentTime + delta));
    seekAudioElement(audio, clamped);
    setCurrentTime(clamped);
  };

  const skipBack = () => skip(-3);
  const skipForward = () => skip(3);

  const changeSpeed = (value) => {
    const audio = audioRef.current;
    if (!audio) return;
    const rate = Number(value);
    audio.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const playSegment = useCallback((seg) => {
    const audio = audioRef.current;
    if (!audio) return;
    seekAudioElement(audio, seg.start);
    setCurrentTime(seg.start);
    audio.play().catch(() => setError('Playback failed'));
  }, []);

  const playSegmentAt = useCallback((time) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(time)) return;
    seekAudioElement(audio, time);
    setCurrentTime(time);
    audio.play().catch(() => setError('Playback failed'));
  }, []);

  const registerSegmentRef = useCallback((index, el) => {
    segmentRefs.current[index] = el;
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', height: '100%' }}>
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          style={{
            position: 'absolute',
            width: 0,
            height: 0,
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      )}

      {error && (
        <div style={{
          margin: `${space.md}px ${space.lg}px`,
          padding: `${space.sm}px ${space.md}px`,
          border: `1px solid ${theme.bad}`,
          borderRadius: radius.md,
          background: theme.badSoft,
          color: theme.badInk,
          fontSize: fontSize.sm,
        }}>
          {error}
        </div>
      )}

      {/* The "deck": waveform + transport live together as one block, so the
          play controls sit with the thing they control instead of stranded at
          the bottom of the page. The transcript below gets the rest of the height. */}
      <div style={{
        flexShrink: 0,
        background: theme.panel,
        borderBottom: `1px solid ${theme.borderSoft}`,
      }}>
        <div style={{ height: 160, position: 'relative' }}>
          {isRecording ? (
            <LiveWaveform stream={liveStream} active={!isPaused} elapsed={elapsed} />
          ) : audioUrl ? (
            <Waveform
              audioUrl={audioUrl}
              currentTime={currentTime}
              duration={effectiveDuration}
              onDuration={handleDecodedDuration}
              onSeek={seekToTime}
            />
          ) : status === 'transcribing' ? (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: space.sm, color: theme.inkSoft, fontSize: fontSize.sm,
            }}>
              <Icon.Spinner size={20} />
              Refining transcript…
            </div>
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: space.sm, color: theme.inkFaint,
            }}>
              <Icon.Mic size={32} />
              <span style={{ fontSize: fontSize.sm, color: theme.inkSoft }}>Ready to record</span>
            </div>
          )}
        </div>

        <div style={{
          position: 'relative',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.lg,
          padding: `0 ${space.lg}px`,
        }}>
          {isRecording ? (
            <>
              <span style={{
                position: 'absolute', left: space.lg,
                fontSize: fontSize.sm, color: theme.inkSoft, fontFamily: font.mono,
                fontVariantNumeric: 'tabular-nums',
                display: 'flex', alignItems: 'center', gap: space.sm,
              }}>
                <span style={{
                  width: 7, height: 7, borderRadius: 999,
                  background: isPaused ? theme.inkFaint : theme.bad,
                  animation: isPaused ? 'none' : 'pulse 1s infinite',
                }} />
                {isCompact
                  ? formatTime(elapsed)
                  : `${isPaused ? 'Paused' : 'Recording'} · ${formatTime(elapsed)}`}
              </span>
              <button
                onClick={isPaused ? onResumeRecording : onPauseRecording}
                aria-label={isPaused ? 'Resume' : 'Pause'}
                style={{
                  width: 40, height: 40, borderRadius: 999, border: 0,
                  background: 'transparent', color: theme.inkSoft,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  transition: `background ${motion.fast}, color ${motion.fast}`,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = theme.ink }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = theme.inkSoft }}
              >
                {isPaused ? <Icon.Play size={18} fill="currentColor" /> : <Icon.Pause size={18} />}
              </button>
              <button
                onClick={onStopRecording}
                aria-label="Stop recording"
                style={{
                  width: 52, height: 52, borderRadius: 999, border: 0,
                  background: theme.bad, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: shadow.md,
                  transition: `transform ${motion.fast}`,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)' }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
              >
                <Icon.Stop size={22} fill="currentColor" />
              </button>
              <button
                aria-hidden
                tabIndex={-1}
                disabled
                style={{
                  width: 40, height: 40, borderRadius: 999, border: 0,
                  background: 'transparent', color: theme.inkSoft,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: 0,
                  cursor: 'default',
                }}
              >
                <Icon.SkipForward size={18} />
              </button>
              <span style={{
                position: 'absolute', right: space.lg,
                fontSize: fontSize.xs, fontWeight: 700,
                color: theme.bad, letterSpacing: '0.08em',
                padding: '3px 7px',
                border: `1px solid ${theme.bad}`,
                borderRadius: radius.sm,
              }}>
                LIVE
              </span>
            </>
          ) : audioUrl ? (
            <>
              <span style={{
                position: 'absolute', left: space.lg,
                fontSize: fontSize.sm, color: theme.inkSoft, fontFamily: font.mono,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {formatTime(currentTime)} / {formatTime(effectiveDuration)}
              </span>
              <button
                onClick={skipBack}
                disabled={!loaded}
                aria-label="Skip back 3 seconds"
                style={{
                  width: 40, height: 40, borderRadius: 999, border: 0,
                  background: 'transparent', color: theme.inkSoft,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: loaded ? 'pointer' : 'default', opacity: loaded ? 1 : 0.4,
                  transition: `background ${motion.fast}, color ${motion.fast}`,
                }}
                onMouseEnter={(e) => { if (loaded) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = theme.ink } }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = theme.inkSoft }}
              >
                <Icon.SkipBack size={18} />
              </button>
              <button
                onClick={togglePlay}
                disabled={!loaded}
                aria-label={playing ? 'Pause' : 'Play'}
                style={{
                  width: 52, height: 52, borderRadius: 999, border: 0,
                  background: theme.matchaMid, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: loaded ? 'pointer' : 'default', opacity: loaded ? 1 : 0.5,
                  boxShadow: shadow.md,
                  transition: `transform ${motion.fast}`,
                }}
                onMouseEnter={(e) => { if (loaded) e.currentTarget.style.transform = 'scale(1.05)' }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
              >
                {playing ? <Icon.Pause size={22} /> : <Icon.Play size={22} fill="currentColor" />}
              </button>
              <button
                onClick={skipForward}
                disabled={!loaded}
                aria-label="Skip forward 3 seconds"
                style={{
                  width: 40, height: 40, borderRadius: 999, border: 0,
                  background: 'transparent', color: theme.inkSoft,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: loaded ? 'pointer' : 'default', opacity: loaded ? 1 : 0.4,
                  transition: `background ${motion.fast}, color ${motion.fast}`,
                }}
                onMouseEnter={(e) => { if (loaded) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = theme.ink } }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = theme.inkSoft }}
              >
                <Icon.SkipForward size={18} />
              </button>
              <select
                value={playbackRate}
                onChange={(e) => changeSpeed(e.target.value)}
                aria-label="Playback speed"
                style={{
                  position: 'absolute', right: space.lg,
                  background: 'transparent', color: theme.inkSoft,
                  border: 0, borderRadius: radius.md,
                  padding: '5px 6px', fontSize: fontSize.sm, fontWeight: 600,
                  cursor: 'pointer',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {SPEED_OPTIONS.map(s => (
                  <option key={s} value={s}>{s === 1 ? '1×' : `${s}×`}</option>
                ))}
              </select>
            </>
          ) : (
            <>
              <span style={{
                position: 'absolute', left: space.lg,
                fontSize: fontSize.sm, color: theme.inkSoft, fontFamily: font.mono,
                fontVariantNumeric: 'tabular-nums',
              }}>
                0:00
              </span>
              {onStartRecording && (
                <Button variant="primary" onClick={onStartRecording}>
                  <Icon.Mic size={16} /> Start recording
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div ref={scrollRef} style={{
        flex: 1,
        overflowY: 'auto',
        padding: `${space.lg}px ${space.xl}px`,
      }}>
        {transcript.length === 0 && !liveText ? (
          <div style={{ color: theme.inkFaint, fontSize: fontSize.md, textAlign: 'center', paddingTop: space.xl }}>
            {isRecording ? 'Listening… transcript will appear here.' : status === 'transcribing' ? 'Refining transcript...' : 'No transcript segments available.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
            {provisional && (
              <div style={{
                fontSize: fontSize.xs,
                color: theme.inkFaint,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: 700,
              }}>
                Live preview
              </div>
            )}
            {liveText && transcript.length === 0 && (
              <div style={{
                padding: `${space.md}px ${space.lg}px`,
                borderRadius: radius.md,
                background: theme.panel,
                color: theme.ink,
                fontSize: fontSize.md,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}>
                {liveText}
              </div>
            )}
            {transcript.map((seg, i) => {
              const colorIdx = speakerMap[seg.speaker] ?? 0;
              return (
                <Segment
                  key={`${i}-${seg.speaker}-${seg.start}-${seg.text.slice(0, 20)}`}
                  seg={seg}
                  index={i}
                  isActive={i === activeIndex}
                  isHovered={i === hoveredIndex}
                  activeRanges={i === activeIndex ? activeRangesForSegment(seg, currentTime) : []}
                  speakerColor={speakerColors[colorIdx] || theme.border}
                  playSegment={playSegment}
                  setHoveredIndex={setHoveredIndex}
                  registerRef={registerSegmentRef}
                  onWordClick={(offset) => {
                    const t = timeForOffset(seg, offset);
                    playSegmentAt(t);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function seekAudioElement(audio, time) {
  try {
    audio.currentTime = time;
  } catch {
    try { audio.fastSeek?.(time); } catch { /* ignore */ }
  }
}

function activeRangesForSegment(seg, currentTime) {
  if (!seg?.words?.length || !Number.isFinite(currentTime)) return [];
  const text = seg.text || '';
  if (!text) return [];
  const ranges = wordRangesForSegment(seg);
  return ranges.filter(({ word }) => (
    Number.isFinite(word.start) &&
    Number.isFinite(word.end) &&
    word.start <= currentTime &&
    currentTime < word.end
  )).map(({ start, end }) => ({ start, end }));
}

function wordRangesForSegment(seg) {
  const text = seg.text || '';
  const lowerText = text.toLowerCase();
  let cursor = 0;
  return (seg.words || []).map((word) => {
    const raw = String(word.word || '');
    const lowerRaw = raw.toLowerCase();
    let start = raw ? text.indexOf(raw, cursor) : -1;
    if (start < 0 && lowerRaw) start = lowerText.indexOf(lowerRaw, cursor);
    if (start < 0) start = cursor;
    const end = Math.max(start, Math.min(text.length, start + raw.length));
    cursor = end;
    return { word, start, end };
  });
}

function timeForOffset(seg, offset) {
  if (!seg?.words?.length || !Number.isFinite(offset)) return seg?.start ?? 0;
  const ranges = wordRangesForSegment(seg);
  const match = ranges.find(({ start, end }) => start <= offset && offset < end);
  if (match && Number.isFinite(match.word.start)) return match.word.start;
  return seg?.start ?? 0;
}
