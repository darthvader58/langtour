// Shared UI primitives for the dark design system.

import { useState } from 'react';
import { theme, space, radius, shadow, font, fontSize, labelStyle } from '../../theme';
import { Icon } from './Icon';

export function Card({ children, interactive = false, padded = true, glow = false, style, as = 'div', ...rest }) {
  const [hover, setHover] = useState(false);
  const El = as;
  return (
    <El
      onMouseEnter={interactive ? () => setHover(true) : undefined}
      onMouseLeave={interactive ? () => setHover(false) : undefined}
      style={{
        background: hover && interactive ? theme.elevated : theme.paper,
        border: `1px solid ${hover && interactive ? theme.matchaMid : theme.border}`,
        borderRadius: radius.lg,
        padding: padded ? `${space.lg}px ${space.xl}px` : 0,
        boxShadow: glow ? shadow.glow : (hover && interactive ? shadow.md : 'none'),
        transition: 'background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease',
        transform: hover && interactive ? 'translateY(-1px)' : 'none',
        cursor: interactive ? 'pointer' : 'default',
        textAlign: 'left',
        color: theme.ink,
        ...style,
      }}
      {...rest}
    >
      {children}
    </El>
  );
}

export function Panel({ children, style, ...rest }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: `1px solid ${theme.borderSoft}`,
        borderRadius: radius.md,
        padding: `${space.md}px ${space.lg}px`,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children, icon: IconEl, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space.xs, marginBottom: space.sm, ...labelStyle, opacity: 0.7, ...style }}>
      {IconEl && <IconEl size={12} />}
      {children}
    </div>
  );
}

const BTN_PAD = { sm: '0.35rem 0.7rem', md: '0.5rem 0.95rem', lg: '0.7rem 1.25rem' };
const BTN_FS = { sm: fontSize.sm, md: fontSize.md, lg: fontSize.base };

export function Button({ children, variant = 'primary', size = 'md', icon: IconEl, iconRight: IconRight, as = 'button', style, ...rest }) {
  const [hover, setHover] = useState(false);
  const El = as;
  const palettes = {
    primary: {
      bg: theme.matchaDeep, bgHover: theme.matchaMid, color: '#fff',
      border: theme.matchaDeep, borderHover: theme.matchaMid,
    },
    ghost: {
      bg: theme.paper, bgHover: theme.matchaSoft, color: theme.matchaInk,
      border: theme.border, borderHover: theme.matchaMid,
    },
    subtle: {
      bg: 'transparent', bgHover: 'rgba(255,255,255,0.05)', color: theme.inkSoft,
      border: theme.border, borderHover: theme.inkSoft,
    },
    danger: {
      bg: 'transparent', bgHover: 'rgba(232,114,140,0.14)', color: theme.bad,
      border: theme.border, borderHover: theme.bad,
    },
  };
  const p = palettes[variant] || palettes.primary;
  return (
    <El
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: space.sm,
        padding: BTN_PAD[size], fontSize: BTN_FS[size], fontWeight: 600,
        background: hover ? p.bgHover : p.bg, color: p.color,
        border: `1px solid ${hover ? p.borderHover : p.border}`,
        borderRadius: radius.md, cursor: 'pointer',
        transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease',
        ...style,
      }}
      {...rest}
    >
      {IconEl && <IconEl size={BTN_FS[size] + 2} />}
      {children}
      {IconRight && <IconRight size={BTN_FS[size] + 2} />}
    </El>
  );
}

export function IconButton({ icon: IconEl, label, active = false, round = false, size = 34, style, ...rest }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      aria-label={label}
      title={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size, height: size, padding: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: active ? theme.matchaMid : (hover ? theme.matchaSoft : 'transparent'),
        color: active ? '#fff' : (hover ? theme.matchaInk : theme.inkSoft),
        border: `1px solid ${active ? theme.matchaDeep : (hover ? theme.matchaMid : theme.border)}`,
        borderRadius: round ? radius.pill : radius.md,
        cursor: 'pointer', flexShrink: 0,
        transition: 'background 140ms ease, color 140ms ease, border-color 140ms ease',
        ...style,
      }}
      {...rest}
    >
      {IconEl && <IconEl size={Math.round(size * 0.5)} />}
    </button>
  );
}

export function Badge({ children, tone = 'accent', icon: IconEl, style }) {
  const tones = {
    accent:  { bg: theme.matchaSoft, color: theme.matchaInk, border: 'rgba(125,140,240,0.35)' },
    neutral: { bg: 'rgba(255,255,255,0.05)', color: theme.inkSoft, border: theme.border },
    good:    { bg: 'rgba(143,207,122,0.14)', color: theme.goodInk, border: 'rgba(143,207,122,0.3)' },
    warn:    { bg: 'rgba(224,164,74,0.14)', color: theme.oolongInk, border: 'rgba(224,164,74,0.3)' },
    bad:     { bg: 'rgba(232,114,140,0.14)', color: theme.badInk, border: 'rgba(232,114,140,0.3)' },
  };
  const t = tones[tone] || tones.accent;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: fontSize.xs, fontWeight: 600, letterSpacing: '0.02em',
      padding: '2px 9px', borderRadius: radius.pill,
      background: t.bg, color: t.color, border: `1px solid ${t.border}`,
      fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
      ...style,
    }}>
      {IconEl && <IconEl size={11} />}
      {children}
    </span>
  );
}

export function Stat({ label, value, hint, tone, icon: IconEl, size = '2xl', align = 'left' }) {
  const valueColor = tone || theme.ink;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
      <div style={{ ...labelStyle, opacity: 0.7, display: 'flex', alignItems: 'center', gap: 5 }}>
        {IconEl && <IconEl size={12} />} {label}
      </div>
      <div style={{
        fontFamily: font.serif, fontWeight: 600, lineHeight: 0.95,
        fontSize: fontSize[size] ?? fontSize['2xl'], color: valueColor,
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
      }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: fontSize.sm, color: theme.inkSoft, opacity: 0.7 }}>{hint}</div>}
    </div>
  );
}

export function Spinner({ size = 18, color = theme.matchaMid, style }) {
  return (
    <Icon.Spinner size={size} color={color} style={{ animation: 'spin 0.8s linear infinite', ...style }} />
  );
}

export function Divider({ style }) {
  return <div style={{ height: 1, background: theme.borderSoft, margin: `${space.md}px 0`, ...style }} />;
}

export function SegmentedControl({ options, value, onChange, size = 'md', style }) {
  const pad = size === 'sm' ? '0.28rem 0.6rem' : '0.4rem 0.8rem';
  const fs = size === 'sm' ? fontSize.sm : fontSize.md;
  return (
    <div style={{
      display: 'inline-flex', gap: 2, padding: 3,
      background: 'rgba(255,255,255,0.04)', border: `1px solid ${theme.border}`,
      borderRadius: radius.pill, ...style,
    }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            style={{
              padding: pad, fontSize: fs, fontWeight: active ? 600 : 500,
              borderRadius: radius.pill, border: 'none',
              background: active ? theme.matchaMid : 'transparent',
              color: active ? '#fff' : theme.inkSoft,
              cursor: 'pointer', transition: 'background 140ms ease, color 140ms ease',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
