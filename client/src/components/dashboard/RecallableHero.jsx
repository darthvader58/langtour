import { useEffect, useRef, useState, useMemo } from 'react';
import { theme } from '../../theme';
import { Icon } from '../ui/Icon';

function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      setValue(from + (target - from) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}

function fmt(n) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}


export default function RecallableHero({ data, desiredRetention = 0.9 }) {
  const r = data?.recallable;
  const trend = data?.recallable_trend;
  const now = r?.now ?? 0;
  const display = useCountUp(now);

  // Streak loss-aversion copy
  const streak = data?.streak?.current ?? 0;
  const streakBest = data?.streak?.best ?? 0;

  // Net change since end of previous day
  const net = r?.net ?? 0;
  const netUp = net >= 0;

  const { isNewRecord } = useMemo(() => {
    if (!trend || trend.length < 2) return { isNewRecord: false };
    const vals = trend.map((p) => p.recallable ?? 0);
    const last = vals[vals.length - 1];
    const allTimeBest = Math.max(...vals);
    return { isNewRecord: last >= allTimeBest && allTimeBest > 0 };
  }, [trend]);

  // Accuracy: all-time from rating_distribution, recent from recent_reviews
  const accuracyRecent = useMemo(() => {
    const recent = data?.recent_reviews ?? [];
    if (!recent.length) return null;
    const good = recent.filter(r => r.rating >= 3).length;
    return Math.round((good / recent.length) * 100);
  }, [data]);

  if (!r) return null;

  return (
    <div style={{
      background: isNewRecord
        ? `linear-gradient(135deg, ${theme.paper} 55%, ${theme.goldSoft} 100%)`
        : theme.paper,
      border: `1px solid ${theme.border}`,
      borderRadius: 12,
      padding: '2rem 2.25rem',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: '1.5rem',
      flexWrap: 'wrap',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: isNewRecord ? `0 0 0 1.5px ${theme.gold}, 0 4px 24px rgba(232,176,75,0.18)` : 'none',
      transition: 'box-shadow 400ms ease',
    }}>
      {/* Background watermark */}
      <div style={{
        position: 'absolute',
        right: -12,
        bottom: -40,
        fontFamily: "'Noto Serif SC', serif",
        fontSize: '9rem',
        color: '#ffffff',
        opacity: 0.04,
        userSelect: 'none',
        lineHeight: 1,
        pointerEvents: 'none',
        letterSpacing: '-0.04em',
      }}>
        记得
      </div>

      {/* Left: near-miss framing — distance to next milestone is the hero number */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            fontSize: 10,
            color: theme.inkSoft,
            opacity: 0.7,
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            fontWeight: 600,
          }}>
            Words memorized
          </div>
          {isNewRecord && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: theme.bg,
              background: theme.gold,
              borderRadius: 999,
              padding: '1px 8px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>
              ★ New record
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: '5rem',
            fontWeight: 600,
            color: '#f8f4ec',
            lineHeight: 0.9,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.03em',
          }}>
            {fmt(display)}
          </span>
          <span style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: '1.6rem',
            color: theme.inkSoft,
            opacity: 0.7,
            fontWeight: 400,
            marginLeft: 4,
          }}>
            words
          </span>
        </div>

        {/* vs personal best */}
        {!isNewRecord && (
          <BestComparison
            current={now}
            best={data?.recallable_trend ? Math.max(...(data.recallable_trend.map(p => p.recallable ?? 0))) : now}
            label="word best"
            light
          />
        )}


        {/* Net change since end of previous day */}
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          fontSize: 13,
          fontVariantNumeric: 'tabular-nums',
          marginTop: 2,
        }}>
          <span style={{
            color: netUp ? theme.good : theme.bad,
            fontWeight: 700,
            fontSize: 14,
          }}>
            {netUp ? '+' : '−'}{fmt(Math.abs(net))}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
            words since yesterday
          </span>
        </div>
      </div>

      {/* Right: streak (loss-aversion) + sparkline (trend direction) */}
      <div style={{
        zIndex: 1,
        textAlign: 'right',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 10,
        paddingBottom: 2,
      }}>
        {/* Streak */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: '5rem',
              fontWeight: 600,
              color: streak > 0 ? theme.gold : 'rgba(255,255,255,0.25)',
              lineHeight: 0.9,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.03em',
            }}>
              {streak}
            </span>
            {streakBest > 0 && streak < streakBest && (
              <span style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: '2rem',
                color: theme.gold,
                opacity: 0.35,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}>
                / {streakBest}
              </span>
            )}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5,
            fontSize: 13,
            color: theme.gold,
            opacity: streak > 0 ? 0.7 : 0.4,
            fontWeight: 500,
            letterSpacing: '0.04em',
          }}>
            {streak > 0 && <Icon.Streak size={13} />}
            {streak === streakBest && streak > 0 ? 'matching your best' : 'day streak'}
          </div>
        </div>

        {/* Accuracy vs desired retention */}
        {accuracyRecent !== null && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <div style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: '2.4rem',
              fontWeight: 600,
              color: accuracyRecent >= desiredRetention * 100 ? theme.good : theme.bad,
              lineHeight: 0.9,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
            }}>
              {accuracyRecent}%
            </div>
            <div style={{ fontSize: 13, color: theme.inkSoft, opacity: 0.5, fontWeight: 500 }}>
              {accuracyRecent >= desiredRetention * 100
                ? `↑ above ${Math.round(desiredRetention * 100)}% accuracy target`
                : `↓ below ${Math.round(desiredRetention * 100)}% accuracy target`}
            </div>
          </div>
        )}

        {/* Date */}
        <div style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: '0.95rem',
          color: theme.inkSoft,
          opacity: 0.35,
          fontWeight: 400,
          letterSpacing: '0.02em',
        }}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      </div>
    </div>
  );
}


// Shows "X behind your best of Y" or "▲ at your best"
function BestComparison({ current, best, label, light = false }) {
  if (!best || best <= 0) return null;
  const gap = Math.round(best - current);
  const textColor = light ? 'rgba(255,255,255,0.35)' : theme.inkSoft;
  const accentColor = light ? theme.good : theme.good;
  if (gap <= 0) return null;
  const pct = Math.round((gap / best) * 100);
  return (
    <div style={{ fontSize: 11, color: textColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1.4 }}>
      <span style={{ color: accentColor, fontWeight: 600 }}>{gap.toLocaleString()}</span>
      {' '}behind your {label} of{' '}
      <span style={{ fontWeight: 600 }}>{Math.round(best).toLocaleString()}</span>
      <span style={{ opacity: 0.6 }}> ({pct}%)</span>
    </div>
  );
}

function LedgerChip({ sign, value, color, label, bold }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3 }}>
      <span style={{ color, fontWeight: bold ? 700 : 600, fontSize: bold ? 14 : 13 }}>
        {sign}{fmt(value)}
      </span>
      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>{label}</span>
    </span>
  );
}
