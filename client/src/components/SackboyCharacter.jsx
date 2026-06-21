/**
 * SackboyCharacter — chunky little sackcloth spy mascots, one per country.
 *
 * Each is a round, stitched burlap character with big button eyes, stubby
 * arms and legs, and a country-themed disguise. States:
 *   - 'idle'   : gentle bob
 *   - 'wave'   : bob + a friendly arm wave (used when unlocked)
 *   - 'dance'  : a happy little wiggle (used on hover / on selection)
 *   - 'locked' : greyed out, X eyes, slumped and still
 *
 * Pass `hoverDance` to make it break into a dance whenever an ancestor with
 * the `group` class is hovered (used by the country cards).
 */

const PALETTE = {
  China:  { sack: '#b32626', seam: '#7d1414', trim: '#e8c547', sash: '#f2d98a' },
  Japan:  { sack: '#46505f', seam: '#2a313c', trim: '#c9a84c', sash: '#8d99ab' },
  France: { sack: '#27508f', seam: '#173366', trim: '#f5f0e8', sash: '#e3ecff' },
  Mexico: { sack: '#8a3514', seam: '#5d2009', trim: '#e8c547', sash: '#f0b64a' },
  Egypt:  { sack: '#d9caa6', seam: '#b3a079', trim: '#e8c547', sash: '#efe6cd' },
  Brazil: { sack: '#1f9d4d', seam: '#0c5b2c', trim: '#f5d000', sash: '#9be8b6' },
}

const STITCH = { strokeDasharray: '3 3.5', strokeLinecap: 'round' }

/* ── Per-country disguises ──────────────────────────────────────── */

function ChinaKit({ p }) {
  return (
    <>
      {/* silk robe collar */}
      <path d="M44 86 L60 100 L76 86 L76 112 L44 112 Z" fill={p.seam} opacity="0.55" />
      <path d="M44 86 L60 100 L76 86" fill="none" stroke={p.trim} strokeWidth="2.4" strokeLinejoin="round" />
      {/* opera mask face plate */}
      <ellipse cx="60" cy="62" rx="27" ry="24" fill="#f6efe2" />
      <path d="M33 60 Q60 40 87 60" fill="none" stroke={p.sack} strokeWidth="3" opacity="0.5" />
      {/* red opera markings around the eyes */}
      <path d="M40 56 Q47 46 56 54 Q49 62 40 60 Z" fill={p.sack} opacity="0.85" />
      <path d="M80 56 Q73 46 64 54 Q71 62 80 60 Z" fill={p.sack} opacity="0.85" />
      {/* gold forehead motif */}
      <path d="M60 44 l4 7 -4 4 -4 -4 Z" fill={p.trim} />
    </>
  )
}

function JapanKit({ p }) {
  return (
    <>
      {/* shoulder armour plates */}
      <path d="M28 84 q-6 6 -4 16 l14 -2 -2 -16 Z" fill={p.seam} />
      <path d="M92 84 q6 6 4 16 l-14 -2 2 -16 Z" fill={p.seam} />
    </>
  )
}

function FranceKit({ p }) {
  return (
    <>
      {/* breton stripes across the body */}
      {[78, 88, 98].map((y) => (
        <line key={y} x1="30" y1={y} x2="90" y2={y} stroke={p.sash} strokeWidth="3" opacity="0.7" />
      ))}
      {/* little neckerchief */}
      <path d="M50 84 L60 94 L70 84 Z" fill="#b32626" />
    </>
  )
}

function MexicoKit({ p }) {
  return (
    <>
      {/* charro bolero trim */}
      <path d="M46 86 L60 98 L74 86" fill="none" stroke={p.trim} strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="52" cy="96" r="2" fill={p.trim} />
      <circle cx="68" cy="96" r="2" fill={p.trim} />
    </>
  )
}

function EgyptKit({ p }) {
  // mummy wrap lines across the whole body
  return (
    <>
      {[58, 70, 82, 94, 104].map((y, i) => (
        <line
          key={y}
          x1="28" y1={y} x2="92" y2={y - (i % 2 ? 4 : -2)}
          stroke="#f4ecd6" strokeWidth="4" opacity="0.55" strokeLinecap="round"
        />
      ))}
      {[64, 76, 88].map((y) => (
        <line key={'s' + y} x1="30" y1={y} x2="90" y2={y - 3} stroke={p.seam} strokeWidth="0.8" opacity="0.5" />
      ))}
    </>
  )
}

function BrazilKit({ p }) {
  return (
    <>
      {/* sequinned sash */}
      <path d="M30 88 Q60 100 90 84" fill="none" stroke={p.trim} strokeWidth="3" opacity="0.8" />
      {[42, 54, 66, 78].map((x, i) => (
        <circle key={x} cx={x} cy={92 - (i === 1 || i === 2 ? 3 : 0)} r="1.8" fill={p.trim} />
      ))}
    </>
  )
}

/* headgear sits above everything */
function Headgear({ country, p }) {
  switch (country) {
    case 'Japan': // kabuto helmet
      return (
        <g>
          <path d="M34 44 Q60 18 86 44 Q60 36 34 44 Z" fill={p.seam} />
          <path d="M34 44 Q60 30 86 44" fill="none" stroke={p.trim} strokeWidth="2" />
          {/* golden maedate crest */}
          <path d="M52 30 Q60 12 68 30 Q60 26 52 30 Z" fill={p.trim} />
        </g>
      )
    case 'France': // beret
      return (
        <g transform="rotate(-12 60 34)">
          <ellipse cx="60" cy="34" rx="26" ry="11" fill="#1c2533" />
          <ellipse cx="60" cy="31" rx="22" ry="8" fill="#2a3852" />
          <circle cx="60" cy="24" r="2.6" fill="#1c2533" />
        </g>
      )
    case 'Mexico': // sombrero
      return (
        <g>
          <ellipse cx="60" cy="40" rx="46" ry="13" fill="#7a4a1d" />
          <ellipse cx="60" cy="40" rx="46" ry="13" fill="none" stroke={p.trim} strokeWidth="2" />
          <path d="M40 40 Q44 16 60 14 Q76 16 80 40 Z" fill="#8a5523" />
          <path d="M40 40 Q60 32 80 40" fill="none" stroke={p.trim} strokeWidth="2.2" />
        </g>
      )
    case 'Egypt': // nemes headcloth
      return (
        <g>
          <path d="M32 50 Q60 16 88 50 L86 60 Q60 46 34 60 Z" fill="#1f4f8a" />
          {[40, 48, 56, 64, 72, 80].map((x) => (
            <line key={x} x1={x} y1="34" x2={x} y2="58" stroke="#e8c547" strokeWidth="2.4" opacity="0.85" />
          ))}
          {/* cobra brow ornament */}
          <circle cx="60" cy="40" r="4" fill="#e8c547" />
        </g>
      )
    case 'Brazil': // carnival feather headdress
      return (
        <g>
          {[
            { a: -52, c: '#22c55e' }, { a: -32, c: '#facc15' }, { a: -14, c: '#38bdf8' },
            { a: 4, c: '#ef4444' }, { a: 22, c: '#a855f7' }, { a: 42, c: '#f97316' },
          ].map((f, i) => (
            <g key={i} transform={`rotate(${f.a} 60 42)`}>
              <path d="M60 42 q-6 -22 0 -34 q6 12 0 34 Z" fill={f.c} opacity="0.92" />
            </g>
          ))}
          <ellipse cx="60" cy="42" rx="14" ry="6" fill={p.trim} />
        </g>
      )
    case 'China': // opera headdress beads
      return (
        <g>
          <path d="M38 44 Q60 26 82 44" fill="none" stroke={p.trim} strokeWidth="3" />
          <circle cx="38" cy="44" r="3.4" fill={p.trim} />
          <circle cx="82" cy="44" r="3.4" fill={p.trim} />
          <circle cx="60" cy="29" r="3.4" fill={p.trim} />
        </g>
      )
    default:
      return null
  }
}

/* items held in front of the body, in the right hand */
function HeldItem({ country, p }) {
  switch (country) {
    case 'Japan': // tiny katana
      return (
        <g>
          <line x1="96" y1="104" x2="116" y2="70" stroke="#e6edf5" strokeWidth="3" strokeLinecap="round" />
          <line x1="92" y1="106" x2="99" y2="98" stroke="#2a313c" strokeWidth="5" strokeLinecap="round" />
          <circle cx="98" cy="99" r="3" fill={p.trim} />
        </g>
      )
    case 'France': // baguette under the arm
      return (
        <g transform="rotate(28 24 96)">
          <rect x="6" y="88" width="34" height="11" rx="5.5" fill="#d8a657" />
          <rect x="6" y="88" width="34" height="11" rx="5.5" fill="none" stroke="#a9742f" strokeWidth="1.4" />
          {[14, 21, 28].map((x) => (
            <line key={x} x1={x} y1="90" x2={x + 3} y2="97" stroke="#a9742f" strokeWidth="1.2" />
          ))}
        </g>
      )
    case 'Mexico': // mariachi guitar
      return (
        <g transform="rotate(18 98 96)">
          <circle cx="98" cy="100" r="11" fill="#7a3b16" />
          <circle cx="96" cy="92" r="7" fill="#7a3b16" />
          <circle cx="97" cy="98" r="3" fill="#1c1208" />
          <rect x="95" y="70" width="4" height="18" rx="2" fill="#5d2a0e" />
          <circle cx="98" cy="100" r="11" fill="none" stroke={p.trim} strokeWidth="1.2" />
        </g>
      )
    case 'Egypt': // golden ankh staff
      return (
        <g>
          <line x1="100" y1="44" x2="100" y2="118" stroke={p.trim} strokeWidth="4" strokeLinecap="round" />
          <circle cx="100" cy="40" r="7" fill="none" stroke={p.trim} strokeWidth="4" />
          <line x1="92" y1="50" x2="108" y2="50" stroke={p.trim} strokeWidth="4" strokeLinecap="round" />
        </g>
      )
    default:
      return null
  }
}

const KITS = {
  China: ChinaKit, Japan: JapanKit, France: FranceKit,
  Mexico: MexicoKit, Egypt: EgyptKit, Brazil: BrazilKit,
}

export default function SackboyCharacter({
  country = 'China',
  state = 'idle',           // idle | wave | dance | locked
  size = 72,
  hoverDance = false,
  className = '',
}) {
  const p = PALETTE[country] ?? PALETTE.China
  const Kit = KITS[country] ?? ChinaKit
  const locked = state === 'locked'
  const waving = state === 'wave' && !locked
  const dancing = state === 'dance' && !locked

  const wrapAnim = locked
    ? ''
    : dancing
      ? 'sackboy-dance'
      : 'sackboy-bob'

  return (
    <div
      className={`sackboy ${wrapAnim} ${hoverDance && !locked ? 'sackboy-hover' : ''} ${className}`}
      style={{ width: size, height: size * (140 / 120), filter: locked ? 'grayscale(1) brightness(0.55)' : 'none' }}
    >
      <svg viewBox="0 0 120 140" width="100%" height="100%" style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id={`body-${country}`} cx="42%" cy="34%" r="72%">
            <stop offset="0%" stopColor={p.sack} stopOpacity="1" />
            <stop offset="100%" stopColor={p.seam} stopOpacity="1" />
          </radialGradient>
        </defs>

        {/* soft ground shadow */}
        <ellipse cx="60" cy="130" rx="30" ry="6" fill="#000" opacity={locked ? 0.18 : 0.28} />

        {/* legs */}
        <rect x="44" y="104" width="12" height="24" rx="6" fill={p.seam} />
        <rect x="64" y="104" width="12" height="24" rx="6" fill={p.seam} />
        <ellipse cx="50" cy="128" rx="8" ry="4" fill={p.seam} />
        <ellipse cx="70" cy="128" rx="8" ry="4" fill={p.seam} />

        {/* left (static) arm */}
        <g style={{ transform: locked ? 'rotate(6deg)' : 'none', transformBox: 'view-box', transformOrigin: '30px 78px' }}>
          <rect x="14" y="76" width="14" height="26" rx="7" fill={p.seam} />
          <circle cx="21" cy="102" r="7.5" fill={p.sack} />
        </g>

        {/* body */}
        <rect x="24" y="40" width="72" height="74" rx="34" fill={`url(#body-${country})`} />
        {/* stitched seam down the middle */}
        <line x1="60" y1="46" x2="60" y2="108" stroke={p.seam} strokeWidth="1.4" {...STITCH} opacity="0.7" />
        {/* burlap patch stitches */}
        <path d="M30 58 q4 -4 8 0" fill="none" stroke={p.seam} strokeWidth="1.2" {...STITCH} opacity="0.6" />
        <path d="M82 96 q4 4 8 0" fill="none" stroke={p.seam} strokeWidth="1.2" {...STITCH} opacity="0.6" />

        {/* country disguise on the body */}
        <Kit p={p} />

        {/* face */}
        {locked ? (
          <>
            {/* X eyes */}
            <g stroke="#2c2218" strokeWidth="3.2" strokeLinecap="round">
              <line x1="42" y1="60" x2="52" y2="70" />
              <line x1="52" y1="60" x2="42" y2="70" />
              <line x1="68" y1="60" x2="78" y2="70" />
              <line x1="78" y1="60" x2="68" y2="70" />
            </g>
            {/* flat sad mouth */}
            <path d="M50 84 Q60 80 70 84" fill="none" stroke="#2c2218" strokeWidth="2.6" strokeLinecap="round" />
          </>
        ) : (
          <>
            {/* button eyes */}
            <circle cx="47" cy="64" r="9.5" fill="#fbf6ea" />
            <circle cx="73" cy="64" r="9.5" fill="#fbf6ea" />
            <circle cx="48" cy="65" r="4.6" fill="#2c2218" />
            <circle cx="74" cy="65" r="4.6" fill="#2c2218" />
            <circle cx="46" cy="62" r="1.6" fill="#fff" />
            <circle cx="72" cy="62" r="1.6" fill="#fff" />
            {/* stitched button crosses */}
            <g stroke="#b9b09a" strokeWidth="0.9" opacity="0.7">
              <line x1="44" y1="64" x2="50" y2="64" />
              <line x1="70" y1="64" x2="76" y2="64" />
            </g>
            {/* happy stitched smile */}
            <path d="M48 82 Q60 94 72 82" fill="none" stroke="#2c2218" strokeWidth="2.8" strokeLinecap="round" {...STITCH} />
          </>
        )}

        {/* right arm — the waving one */}
        <g
          className={waving ? 'sackboy-arm-wave' : ''}
          style={{ transformBox: 'view-box', transformOrigin: '92px 80px' }}
        >
          <g style={{ transform: locked ? 'rotate(-6deg)' : waving ? 'none' : 'rotate(-4deg)', transformBox: 'view-box', transformOrigin: '92px 80px' }}>
            <rect x="92" y="76" width="14" height="26" rx="7" fill={p.seam} />
            <circle cx="99" cy="102" r="7.5" fill={p.sack} />
          </g>
        </g>

        {/* headgear + held item on top */}
        <Headgear country={country} p={p} />
        <HeldItem country={country} p={p} />
      </svg>
    </div>
  )
}
