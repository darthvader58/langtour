import { useMemo } from 'react';
import { theme } from '../../theme';

const STAT_META = [
  { key: 'reviews', label: 'Times shown up', hanzi: '复', suffix: '' },
];

export default function HeroStats({ data }) {
  const stats = useMemo(() => {
    const d = data?.deck;
    if (!d) return null;
    const ratings = d.rating_distribution || {};
    const again = ratings[1] || 0;
    const hard  = ratings[2] || 0;
    const good  = ratings[3] || 0;
    const easy  = ratings[4] || 0;
    const totalRatings = again + hard + good + easy;
    const accuracy = totalRatings > 0 ? ((good + easy) / totalRatings) * 100 : 0;
    return {
      reviews:  d.total_reviews ?? 0,
      accuracy: Math.round(accuracy),
    };
  }, [data]);

  if (!stats) return null;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: '0.6rem',
    }}>
      {STAT_META.map((s) => {
        const raw = stats[s.key];
        const value = s.key === 'reviews' ? raw.toLocaleString() : String(raw);
        return (
          <div key={s.key} style={{
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: 4,
            padding: '1rem 1.1rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{
                  fontSize: 10,
                  color: theme.inkSoft,
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                  fontWeight: 700,
                  opacity: 0.7,
                }}>
                  {s.label}
                </div>
                <div style={{
                  fontFamily: "'Cormorant Garamond', 'Noto Serif SC', serif",
                  fontSize: '2.4rem',
                  fontWeight: 600,
                  color: theme.matchaInk,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.02em',
                }}>
                  {value}
                  {s.suffix && (
                    <span style={{ fontSize: '1rem', color: theme.inkSoft, marginLeft: 2, fontWeight: 400 }}>
                      {s.suffix}
                    </span>
                  )}
                </div>
              </div>
              <div style={{
                fontFamily: "'Noto Serif SC', serif",
                fontSize: '1.6rem',
                color: theme.matchaMid,
                opacity: 0.25,
                lineHeight: 1,
                userSelect: 'none',
              }}>
                {s.hanzi}
              </div>
            </div>

          </div>
        );
      })}
    </div>
  );
}
