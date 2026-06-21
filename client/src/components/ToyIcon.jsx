const ICON_KIND = {
  cn: 'lantern', china: 'lantern',
  in: 'film', india: 'film',
  fr: 'palette', france: 'palette',
  mx: 'compass', mexico: 'compass',
  eg: 'pyramid', egypt: 'pyramid',
  br: 'press', brazil: 'press',
}

function resolveKind(name = '') {
  const value = name.toLowerCase()
  if (ICON_KIND[value]) return ICON_KIND[value]
  if (/market|shop|bazaar/.test(value)) return 'store'
  if (/restaurant|cafe|food|taco|croissant|baguette|cheese|spice|wine|pub/.test(value)) return 'food'
  if (/train|metro|station/.test(value)) return 'train'
  if (/taxi|rickshaw|ride/.test(value)) return 'car'
  if (/hotel|checkin/.test(value)) return 'key'
  if (/newspaper|press|news/.test(value)) return 'press'
  if (/business|meeting|tech|computer/.test(value)) return 'briefcase'
  if (/politic|speech|microphone|mic/.test(value)) return 'microphone'
  if (/film|movie|bollywood/.test(value)) return 'film'
  if (/yoga|meditat/.test(value)) return 'lotus'
  if (/festival|carnival|celebr/.test(value)) return 'spark'
  if (/beach|ocean|wave/.test(value)) return 'wave'
  if (/art|museum|gallery|painting/.test(value)) return 'palette'
  if (/fashion|dress/.test(value)) return 'shirt'
  if (/music|guitar|mariachi/.test(value)) return 'music'
  if (/ruin|temple|pyramid|archae/.test(value)) return 'pyramid'
  if (/wrestl|sport/.test(value)) return 'shield'
  if (/real-life|crown|special/.test(value)) return 'crown'
  if (/coin|token|reward/.test(value)) return 'coin'
  if (/npc|person|agent|user/.test(value)) return 'person'
  if (/trophy|complete|master/.test(value)) return 'trophy'
  if (/close/.test(value)) return 'close'
  if (/plus/.test(value)) return 'plus'
  return 'globe'
}

function Glyph({ kind }) {
  switch (kind) {
    case 'lantern': return <><path d="M8 5h8l2 4-2 7H8L6 9l2-4Z" fill="currentColor" opacity=".25"/><path d="M8 5h8l2 4-2 7H8L6 9l2-4ZM9 2h6M9 19h6M12 16v5"/><path d="M7 9h10"/></>
    case 'film': return <><rect x="4" y="7" width="16" height="12" rx="2" fill="currentColor" opacity=".2"/><path d="m5 7 3-4h4L9 7m3 0 3-4h4l-3 4M4 7h16v12H4z"/><path d="m10 11 5 2.5-5 2.5v-5Z" fill="currentColor"/></>
    case 'palette': return <><path d="M12 3a9 9 0 1 0 0 18h1.4a2 2 0 0 0 1.4-3.4 1.8 1.8 0 0 1 1.3-3h1.4A3.5 3.5 0 0 0 21 11.1 8.2 8.2 0 0 0 12 3Z" fill="currentColor" opacity=".2"/><path d="M12 3a9 9 0 1 0 0 18h1.4a2 2 0 0 0 1.4-3.4 1.8 1.8 0 0 1 1.3-3h1.4A3.5 3.5 0 0 0 21 11.1 8.2 8.2 0 0 0 12 3Z"/><circle cx="7.5" cy="11" r="1" fill="currentColor"/><circle cx="10" cy="7" r="1" fill="currentColor"/><circle cx="15" cy="7.5" r="1" fill="currentColor"/></>
    case 'compass': return <><circle cx="12" cy="12" r="9" fill="currentColor" opacity=".16"/><circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.1 5.5-5.5 2.1 2.1-5.5 5.5-2.1Z" fill="currentColor" opacity=".55"/></>
    case 'pyramid': return <><path d="m12 3 9 17H3L12 3Z" fill="currentColor" opacity=".2"/><path d="m12 3 9 17H3L12 3Zm0 0v17m-9 0h18"/><path d="m12 10-4 7h8l-4-7Z"/></>
    case 'press': return <><rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" opacity=".18"/><path d="M4 4h16v16H4zM8 8h4v4H8zm7 0h2m-2 4h2M8 16h9"/></>
    case 'store': return <><path d="M5 9v11h14V9" fill="currentColor" opacity=".18"/><path d="M4 4h16l-1 5a3 3 0 0 1-4 1 3 3 0 0 1-6 0 3 3 0 0 1-4-1L4 4Zm1 6v10h14V10M9 20v-6h6v6"/></>
    case 'food': return <><path d="M5 4v7m3-7v7M5 8h3m-1.5 3v9M15 4v16m0-16c4 2 4 8 0 9"/></>
    case 'train': return <><rect x="5" y="3" width="14" height="15" rx="4" fill="currentColor" opacity=".18"/><path d="M8 21l2-3m6 3-2-3M5 7h14M8 14h.01M16 14h.01M5 18h14V7a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v11Z"/></>
    case 'car': return <><path d="m5 11 2-5h10l2 5v7H5v-7Z" fill="currentColor" opacity=".18"/><path d="m5 11 2-5h10l2 5M3 12h18M5 18h14v-6H5v6Zm1 0v2m12-2v2M8 15h.01M16 15h.01"/></>
    case 'key': return <><circle cx="8" cy="12" r="4" fill="currentColor" opacity=".18"/><circle cx="8" cy="12" r="4"/><path d="m12 12 8-8m-3 3 3 3m-6 0 2 2"/></>
    case 'briefcase': return <><rect x="3" y="7" width="18" height="13" rx="2" fill="currentColor" opacity=".18"/><path d="M9 7V4h6v3M3 12h18M3 7h18v13H3zM10 12v2h4v-2"/></>
    case 'microphone': return <><rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor" opacity=".2"/><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8"/></>
    case 'lotus': return <><path d="M12 20c-4-2-6-5-5-9 3 1 5 3 5 6 0-4 2-7 5-9 1 4 0 7-5 12Z" fill="currentColor" opacity=".2"/><path d="M12 20c-4-2-6-5-5-9 3 1 5 3 5 6 0-4 2-7 5-9 1 4 0 7-5 12Zm0-3c0-4-2-7-5-9-1 4 0 7 5 12m-8-4c2 3 4 4 8 4m8-4c-2 3-4 4-8 4"/></>
    case 'spark': return <><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" fill="currentColor" opacity=".3"/><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Zm7 15 .7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17Z"/></>
    case 'wave': return <><path d="M3 15c3-4 6-4 9 0s6 4 9 0v4H3v-4Z" fill="currentColor" opacity=".2"/><path d="M3 15c3-4 6-4 9 0s6 4 9 0M3 19c3-4 6-4 9 0s6 4 9 0M12 5c2 0 4 2 4 4-2-1-4-1-6 0 0-2 0-3 2-4Z"/></>
    case 'shirt': return <><path d="m8 4-5 3 2 5 3-2v10h8V10l3 2 2-5-5-3c-1 2-7 2-8 0Z" fill="currentColor" opacity=".18"/><path d="m8 4-5 3 2 5 3-2v10h8V10l3 2 2-5-5-3c-1 2-7 2-8 0Z"/></>
    case 'music': return <><path d="M9 18V6l10-2v12M9 9l10-2"/><circle cx="6" cy="18" r="3" fill="currentColor" opacity=".25"/><circle cx="16" cy="16" r="3" fill="currentColor" opacity=".25"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></>
    case 'shield': return <><path d="M12 3 20 6v6c0 5-3 8-8 10-5-2-8-5-8-10V6l8-3Z" fill="currentColor" opacity=".2"/><path d="M12 3 20 6v6c0 5-3 8-8 10-5-2-8-5-8-10V6l8-3Zm-4 9 3 3 5-6"/></>
    case 'crown': return <><path d="m3 7 5 4 4-7 4 7 5-4-2 12H5L3 7Z" fill="currentColor" opacity=".25"/><path d="m3 7 5 4 4-7 4 7 5-4-2 12H5L3 7Zm2 12h14"/></>
    case 'coin': return <><circle cx="12" cy="12" r="9" fill="currentColor" opacity=".2"/><circle cx="12" cy="12" r="9"/><path d="M14.5 8.5c-.5-.5-1.3-.8-2.5-.8-1.7 0-3 .8-3 2s1 1.8 3 2.3 3 1.2 3 2.5-1.3 2.3-3 2.3c-1.2 0-2.2-.3-3-.9M12 6v12"/></>
    case 'person': return <><circle cx="12" cy="8" r="4" fill="currentColor" opacity=".25"/><path d="M5 21a7 7 0 0 1 14 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/></>
    case 'trophy': return <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" fill="currentColor" opacity=".25"/><path d="M8 4h8v5a4 4 0 0 1-8 0V4Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 1v4m-4 0h8"/></>
    case 'close': return <path d="m6 6 12 12M18 6 6 18"/>
    case 'plus': return <path d="M12 5v14M5 12h14"/>
    default: return <><circle cx="12" cy="12" r="9" fill="currentColor" opacity=".15"/><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></>
  }
}

export default function ToyIcon({ name, size = 28, className = '', style }) {
  const kind = resolveKind(name)
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <Glyph kind={kind} />
    </svg>
  )
}
