import ToyIcon from '../ToyIcon'

/* eslint-disable react-refresh/only-export-components */

function SvgIcon({ children, size = 24, fill = 'currentColor', spin = false }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} className={spin ? 'animate-spin' : ''} fill={fill} aria-hidden="true">{children}</svg>
}

export const Icon = {
  Mic: ({ size = 24, fill = 'currentColor' }) => <ToyIcon name="microphone" size={size} style={{ color: fill }} />,
  Play: ({ size = 24, fill = 'currentColor' }) => <SvgIcon size={size} fill={fill}><path d="m8 5 11 7-11 7V5Z" /></SvgIcon>,
  Pause: ({ size = 24, fill = 'currentColor' }) => <SvgIcon size={size} fill={fill}><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></SvgIcon>,
  Stop: ({ size = 24, fill = 'currentColor' }) => <SvgIcon size={size} fill={fill}><rect x="6" y="6" width="12" height="12" rx="2" /></SvgIcon>,
  SkipBack: ({ size = 24, fill = 'currentColor' }) => <SvgIcon size={size} fill={fill}><path d="M6 5h2v14H6zm12 1v12l-9-6 9-6Z" /></SvgIcon>,
  SkipForward: ({ size = 24, fill = 'currentColor' }) => <SvgIcon size={size} fill={fill}><path d="M16 5h2v14h-2zM6 6v12l9-6-9-6Z" /></SvgIcon>,
  Spinner: ({ size = 24, fill = 'currentColor' }) => <SvgIcon size={size} fill={fill} spin><path d="M12 3a9 9 0 1 0 9 9h-3a6 6 0 1 1-6-6V3Z" /></SvgIcon>,
  Close: ({ size = 24, fill = 'currentColor' }) => <ToyIcon name="close" size={size} style={{ color: fill }} />,
  Plus: ({ size = 24, fill = 'currentColor' }) => <ToyIcon name="plus" size={size} style={{ color: fill }} />,
}
