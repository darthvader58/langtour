import { useEffect, useRef } from 'react';
import { fontSize, theme } from '../../theme';

export default function LiveWaveform({ stream, active = true, elapsed = 0 }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const audioCtxRef = useRef(null);
  const activeRef = useRef(active);
  const levelsRef = useRef([]);
  const smoothedLevelRef = useRef(0);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!stream) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    const audioCtx = new AudioContextCtor();
    audioCtxRef.current = audioCtx;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => { /* ignore */ });
    }
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.35;
    source.connect(analyser);

    const data = new Uint8Array(analyser.fftSize);
    const ctx = canvas.getContext('2d');
    const BAR_WIDTH = 3;
    const BAR_GAP = 1;
    let frame = 0;

    const draw = () => {
      if (!canvas || !ctx) return;
      const cssWidth = canvas.clientWidth || canvas.width;
      const cssHeight = canvas.clientHeight || canvas.height;
      if (cssWidth === 0 || cssHeight === 0) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.floor(cssWidth * dpr) || canvas.height !== Math.floor(cssHeight * dpr)) {
        canvas.width = Math.floor(cssWidth * dpr);
        canvas.height = Math.floor(cssHeight * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const halfHeight = cssHeight / 2;
      const totalBarWidth = BAR_WIDTH + BAR_GAP;
      const barCount = Math.max(1, Math.floor(cssWidth / totalBarWidth));
      const levels = levelsRef.current;
      if (levels.length !== barCount) {
        levelsRef.current = Array.from({ length: barCount }, (_, i) => (
          levels[Math.max(0, levels.length - barCount + i)] ?? 0
        ));
      }

      if (activeRef.current) {
        analyser.getByteTimeDomainData(data);

        let sumSquares = 0;
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
          const centered = (data[i] - 128) / 128;
          const abs = Math.abs(centered);
          sumSquares += centered * centered;
          if (abs > peak) peak = abs;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        const boosted = Math.min(1, Math.max(rms * 4, peak * 1.8));
        smoothedLevelRef.current = smoothedLevelRef.current * 0.72 + boosted * 0.28;

        frame += 1;
        if (frame % 2 === 0) {
          levelsRef.current.push(smoothedLevelRef.current);
          while (levelsRef.current.length > barCount) levelsRef.current.shift();
        }
      }

      // Match the playback waveform's visual language, but keep the live input
      // calm: bars read as "not yet played" and the playhead marks "now".
      const stickWidth = 3;
      const playX = Math.max(0, Math.min(cssWidth, cssWidth - stickWidth / 2));

      for (let i = 0; i < levelsRef.current.length; i++) {
        const level = levelsRef.current[i] ?? 0;
        const barHeight = Math.max(2, level * (halfHeight - 8));
        const x = i * totalBarWidth;
        ctx.fillStyle = theme.border;
        ctx.fillRect(x, halfHeight - barHeight, BAR_WIDTH, barHeight * 2);
      }

      // Playhead stick
      ctx.fillStyle = theme.inkSoft;
      ctx.fillRect(playX - stickWidth / 2, 0, stickWidth, cssHeight);

      // Current-time label above the playhead
      const label = formatTime(elapsed);
      ctx.font = `${fontSize.sm}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      const textMetrics = ctx.measureText(label);
      const paddingX = 6;
      const labelWidth = textMetrics.width + paddingX * 2;
      const labelHeight = 18;
      const labelX = Math.max(4, cssWidth - labelWidth - 4);
      const labelY = 6;

      ctx.fillStyle = 'rgba(21, 21, 28, 0.85)';
      ctx.beginPath();
      ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 4);
      ctx.fill();

      ctx.fillStyle = theme.inkSoft;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, labelX + paddingX, labelY + labelHeight / 2);

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { source.disconnect(); } catch { /* ignore */ }
      try { analyser.disconnect(); } catch { /* ignore */ }
      try { audioCtx.close(); } catch { /* ignore */ }
      levelsRef.current = [];
      smoothedLevelRef.current = 0;
    };
  }, [stream, elapsed]);

  return (
    <div
      data-testid="live-waveform"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 120,
        background: `linear-gradient(180deg, ${theme.panel} 0%, ${theme.bg} 100%)`,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
        aria-label="Live audio waveform"
        role="img"
      />
    </div>
  );
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
