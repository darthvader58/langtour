import { theme } from '../../theme';

export default function RewardStrip({ data }) {
  const rw = data?.rewards;
  const r = data?.recallable;
  if (!rw) return null;

  const tomorrowImproved = r?.tomorrow_improved ?? 0;

  const rewards = [
    {
      label: 'Words secured',
      value: rw.words_secured ?? 0,
      hint: 'pushed above recall threshold',
      color: theme.matchaDeep,
    },
    {
      label: 'New memorized',
      value: rw.new_recallable ?? 0,
      hint: 'crossed the floor today',
      color: theme.matchaDeep,
    },
    {
      label: 'Memory extended',
      value: Math.round(rw.memory_extended ?? 0),
      suffix: ' word-days',
      hint: 'total stability added',
      color: theme.matchaMid,
    },
    {
      label: 'Hard words stabilized',
      value: rw.hard_words_stabilized ?? 0,
      hint: 'lapsed → solid',
      color: theme.matchaMid,
    },
  ];

  const hasAnyReward = rewards.some((r) => r.value > 0);

  return (
    <div style={{
      background: 'rgba(123,160,85,0.04)',
      border: `1px solid rgba(123,160,85,0.18)`,
      borderLeft: `3px solid ${theme.matchaMid}`,
      borderRadius: 4,
      padding: '0.9rem 1.1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      height: '100%',
    }}>
      <div style={{
        fontSize: 10,
        color: theme.matchaDeep,
        textTransform: 'uppercase',
        letterSpacing: '0.15em',
        fontWeight: 700,
        opacity: 0.8,
        marginBottom: '0.65rem',
      }}>
        Today's gains
      </div>

      {!hasAnyReward && (
        <div style={{ paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 13, color: theme.matchaDeep, fontWeight: 600, lineHeight: 1.4 }}>
            One session away from flipping this green.
          </div>
          <div style={{ fontSize: 11, color: theme.inkSoft, lineHeight: 1.5 }}>
            Every word you review today compounds — even protecting what you have counts as a win.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {rewards.map((m, i) => (
          <RewardRow key={m.label} metric={m} last={i === rewards.length - 1 && !tomorrowImproved} />
        ))}
      </div>

      {tomorrowImproved > 0.5 && (
        <div style={{
          marginTop: '0.7rem',
          paddingTop: '0.65rem',
          borderTop: `1px solid rgba(123,160,85,0.2)`,
          fontSize: 12,
          color: theme.matchaDeep,
          lineHeight: 1.5,
          fontWeight: 500,
        }}>
          Tomorrow is{' '}
          <span style={{ fontWeight: 700 }}>
            {Math.round(tomorrowImproved).toLocaleString()} words safer
          </span>{' '}
          because of today's reviews.
        </div>
      )}
    </div>
  );
}

function RewardRow({ metric, last }) {
  const dim = metric.value === 0;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: '0.75rem',
      padding: '0.42rem 0',
      borderBottom: last ? 'none' : `1px solid rgba(123,160,85,0.12)`,
      opacity: dim ? 0.45 : 1,
    }}>
      <div style={{ fontSize: 12, color: theme.inkSoft, flexShrink: 0 }}>{metric.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, textAlign: 'right' }}>
        <span style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: '1.35rem',
          fontWeight: 600,
          color: metric.color,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.01em',
        }}>
          {metric.value.toLocaleString()}
        </span>
        {metric.suffix && (
          <span style={{ fontSize: 10, color: theme.inkSoft, fontWeight: 500 }}>{metric.suffix}</span>
        )}
      </div>
    </div>
  );
}
