import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fontSize, theme } from '../../theme';
import { computePeaks } from './waveformPeaks';

export default function Waveform({ audioUrl, currentTime, duration, onDuration, onSeek }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [buffer, setBuffer] = useState(null);
  const [decodedDuration, setDecodedDuration] = useState(duration || 0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);

  // Reset for a new audioUrl happens during render (React's blessed pattern for
  // "adjust state when a prop changes") rather than in an effect, so the actual
  // fetch effect below never calls setState synchronously in its own body.
  const [trackedAudioUrl, setTrackedAudioUrl] = useState(audioUrl);
  if (audioUrl !== trackedAudioUrl) {
    setTrackedAudioUrl(audioUrl);
    setLoading(true);
    setError('');
    setBuffer(null);
  }

  const peaks = useMemo(
    () => (buffer && size.width > 0 ? computePeaks(buffer, size.width) : []),
    [buffer, size.width],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver((entries) => {
          const cr = entries[0]?.contentRect;
          setSize({
            width: cr?.width || el.clientWidth,
            height: cr?.height || el.clientHeight,
          });
        })
      : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    if (!audioUrl) return;
    let cancelled = false;

    fetch(audioUrl)
      .then(res => {
        if (!res.ok) throw new Error('failed to fetch audio');
        return res.arrayBuffer();
      })
      .then(arrayBuffer => {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        return ctx.decodeAudioData(arrayBuffer).finally(() => ctx.close());
      })
      .then(decoded => {
        if (cancelled) return;
        setBuffer(decoded);
        setDecodedDuration(decoded.duration);
        if (Number.isFinite(decoded.duration) && decoded.duration > 0) {
          onDuration?.(decoded.duration);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Could not load waveform');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [audioUrl, onDuration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;
    const cssWidth = size.width;
    const cssHeight = size.height;
    if (cssWidth === 0 || cssHeight === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const total = decodedDuration || duration || 1;
    const playPercent = total > 0 ? currentTime / total : 0;
    const playX = Math.max(0, Math.min(cssWidth, playPercent * cssWidth));

    drawBars(ctx, peaks, cssWidth, cssHeight, playX, currentTime);
  }, [peaks, currentTime, decodedDuration, duration, size]);

  const seekFromEvent = useCallback((e) => {
    const target = containerRef.current;
    if (!target || !onSeek) return;
    const rect = target.getBoundingClientRect();
    const cssWidth = rect.width || size.width;
    const x = e.clientX - rect.left;
    const percent = cssWidth > 0 ? Math.max(0, Math.min(1, x / cssWidth)) : 0;
    const total = decodedDuration || duration || 0;
    if (total > 0) onSeek(percent * total);
  }, [onSeek, decodedDuration, duration, size.width]);

  const handleMouseDown = (e) => {
    draggingRef.current = true;
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    seekFromEvent(e);
  };

  const handleMouseMove = (e) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    seekFromEvent(e);
  };

  const handleMouseUp = (e) => {
    draggingRef.current = false;
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      ref={containerRef}
      data-testid="waveform"
      onPointerDown={handleMouseDown}
      onPointerMove={handleMouseMove}
      onPointerUp={handleMouseUp}
      onPointerCancel={handleMouseUp}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 120,
        cursor: dragging ? 'grabbing' : 'pointer',
        background: `linear-gradient(180deg, ${theme.panel} 0%, ${theme.bg} 100%)`,
        userSelect: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
        aria-label="Audio waveform"
        role="img"
      />
      {loading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: theme.inkSoft,
          fontSize: fontSize.sm,
        }}>
          Loading waveform…
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: theme.badInk,
          fontSize: fontSize.sm,
          padding: 16,
          textAlign: 'center',
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

const BAR_WIDTH = 3;
const BAR_GAP = 1;

function drawBars(ctx, peaks, cssWidth, cssHeight, playX, currentTime) {
  if (peaks.length === 0 || cssWidth === 0 || cssHeight === 0) return;
  const halfHeight = cssHeight / 2;
  const totalBarWidth = BAR_WIDTH + BAR_GAP;
  const barCount = Math.max(1, Math.floor(cssWidth / totalBarWidth));

  for (let i = 0; i < barCount; i++) {
    const x = i * totalBarWidth;
    const center = (i + 0.5) / barCount;
    const peakIndex = Math.min(peaks.length - 1, Math.floor(center * peaks.length));
    const peak = peaks[peakIndex] ?? 0;
    const barHeight = Math.max(2, peak * (halfHeight - 8));

    ctx.fillStyle = x + BAR_WIDTH / 2 < playX ? theme.gold : theme.border;
    ctx.fillRect(x, halfHeight - barHeight, BAR_WIDTH, barHeight * 2);
  }

  const stickWidth = 3;
  ctx.fillStyle = theme.inkSoft;
  ctx.fillRect(playX - stickWidth / 2, 0, stickWidth, cssHeight);

  // Current-time label above the stick
  const label = formatTime(currentTime);
  ctx.font = `${fontSize.sm}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const textMetrics = ctx.measureText(label);
  const paddingX = 6;
  const labelWidth = textMetrics.width + paddingX * 2;
  const labelHeight = 18;
  let labelX = playX - labelWidth / 2;
  labelX = Math.max(4, Math.min(cssWidth - labelWidth - 4, labelX));
  const labelY = 6;

  ctx.fillStyle = 'rgba(21, 21, 28, 0.85)';
  ctx.beginPath();
  ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 4);
  ctx.fill();

  ctx.fillStyle = theme.inkSoft;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, labelX + paddingX, labelY + labelHeight / 2);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
