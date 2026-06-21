import { useState } from 'react';
import { theme, radius, space, font, fontSize, shadow } from '../../theme';
import { Icon } from '../ui/Icon';

// The dashboard's primary call-to-action row. "Start Session" is the hero action
// (review due cards); Grammar and Stats are secondary jumps. Icons come from the
// shared lucide wrapper; the big primary tile carries a soft purple glow so the
// eye lands on it first.
const ACTIONS = [
  { key: 'session', label: 'Start Session', hint: 'Review your due cards', icon: Icon.Zap, primary: true },
  { key: 'grammar', label: 'Grammar',       hint: 'Structures & drills',   icon: Icon.Grammar },
];

function navigate(key) {
  window.location.hash = key;
}

function ActionTile({ action }) {
  const [hover, setHover] = useState(false);
  const { primary, icon: IconEl } = action;

  const base = {
    display: 'flex',
    alignItems: 'center',
    gap: space.md,
    padding: primary ? `${space.lg}px ${space.xl}px` : `${space.md}px ${space.lg}px`,
    borderRadius: radius.lg,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 160ms ease, border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease',
    transform: hover ? 'translateY(-2px)' : 'none',
  };

  const skin = primary
    ? {
        background: hover
          ? `linear-gradient(135deg, ${theme.matchaMid}, ${theme.matchaDeep})`
          : `linear-gradient(135deg, ${theme.matchaDeep}, ${theme.matchaDeep})`,
        border: `1px solid ${theme.matchaMid}`,
        color: '#fff',
        boxShadow: hover ? shadow.glow : '0 4px 18px rgba(139,118,224,0.28)',
      }
    : {
        background: hover ? theme.elevated : theme.paper,
        border: `1px solid ${hover ? theme.matchaMid : theme.border}`,
        color: theme.ink,
        boxShadow: hover ? shadow.md : 'none',
      };

  return (
    <button
      onClick={() => navigate(action.key)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...base, ...skin }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: primary ? 44 : 38, height: primary ? 44 : 38, flexShrink: 0,
        borderRadius: radius.md,
        background: primary ? 'rgba(255,255,255,0.16)' : theme.matchaSoft,
        color: primary ? '#fff' : theme.matchaInk,
      }}>
        <IconEl size={primary ? 22 : 19} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: primary ? fontSize.lg : fontSize.base, fontWeight: 600, lineHeight: 1.1 }}>
          {action.label}
        </span>
        <span style={{
          fontSize: fontSize.sm,
          fontWeight: 400,
          opacity: primary ? 0.8 : 0.6,
          color: primary ? '#fff' : theme.inkSoft,
        }}>
          {action.hint}
        </span>
      </span>
      {primary && (
        <span style={{ marginLeft: 'auto', opacity: hover ? 1 : 0.7, transition: 'opacity 160ms ease, transform 160ms ease', transform: hover ? 'translateX(2px)' : 'none' }}>
          <Icon.ArrowRight size={20} />
        </span>
      )}
    </button>
  );
}

export default function QuickActions() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1.7fr 1fr',
      gap: space.md,
      fontFamily: font.ui,
    }}>
      {ACTIONS.map((a) => <ActionTile key={a.key} action={a} />)}
    </div>
  );
}
