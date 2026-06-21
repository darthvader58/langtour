import { useEffect, useRef, useState } from 'react'

export default function VoiceWaveform({ stream = null, active = true }) {
  const canvasRef  = useRef(null)
  const rafRef     = useRef(null)
  const analyserRef = useRef(null)
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let audioCtx, source

    function setupReal() {
      audioCtx   = new AudioContext()
      source     = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser
    }

    function drawReal() {
      const analyser = analyserRef.current
      const buf = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteTimeDomainData(buf)

      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)

      const rms = Math.sqrt(buf.reduce((s, v) => s + (v - 128) ** 2, 0) / buf.length)
      setSpeaking(rms > 4)

      const t = performance.now() * 0.001
      const energy = rms / 40
      const g = Math.min(1, energy * 2)
      const r = Math.max(0, 1 - energy)
      const color = `rgba(${Math.round(r * 28)}, ${Math.round(g * 204 + 50)}, ${Math.round((1 - g) * 246)}, 0.9)`

      ctx.beginPath()
      const sliceW = W / buf.length
      let x = 0
      buf.forEach((v, i) => {
        const y = ((v / 128.0) - 1) * (H * 0.4) + H / 2
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        x += sliceW
      })
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      ctx.shadowColor = color
      ctx.shadowBlur = 12
      ctx.stroke()
    }

    function drawDemo() {
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)
      const t = performance.now() * 0.001
      const amp = active ? 0.35 + Math.sin(t * 1.4) * 0.1 : 0.05
      const freq = active ? 2.8 : 0.6

      const energy = active ? 0.6 + Math.sin(t * 0.7) * 0.3 : 0.05
      const g = Math.min(1, energy)
      const color = `rgba(${Math.round((1 - g) * 28)}, ${Math.round(g * 204 + 50)}, ${Math.round((1 - g) * 246)}, 0.9)`

      ctx.beginPath()
      const steps = 120
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * W
        const phase = (i / steps) * Math.PI * 2 * freq
        const noise = Math.sin(phase + t * 3.1) * amp
             + Math.sin(phase * 2.3 + t * 2.1) * amp * 0.5
             + Math.sin(phase * 0.7 + t * 4.3) * amp * 0.3
        const y = H / 2 + noise * H * 0.4
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      ctx.shadowColor = color
      ctx.shadowBlur = 16
      ctx.stroke()
    }

    if (stream) {
      setupReal()
    }

    function loop() {
      if (stream && analyserRef.current) drawReal()
      else drawDemo()
      rafRef.current = requestAnimationFrame(loop)
    }
    loop()

    return () => {
      cancelAnimationFrame(rafRef.current)
      audioCtx?.close()
    }
  }, [stream, active])

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-[#0a0e14] border border-[#1F2937]">
      <canvas
        ref={canvasRef}
        width={600}
        height={80}
        className="w-full h-20"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,_rgba(10,14,20,0.6)_0%,_transparent_15%,_transparent_85%,_rgba(10,14,20,0.6)_100%)] pointer-events-none" />
      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${speaking || active ? 'bg-[#58CC02] shadow-[0_0_6px_#58CC02]' : 'bg-gray-700'}`} />
        <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">
          {speaking ? 'Speaking' : 'Listening'}
        </span>
      </div>
    </div>
  )
}
