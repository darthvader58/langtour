import { useState } from 'react';
import { theme } from '../../theme';
import { Icon } from '../ui/Icon';

const WEEK_DAYS = 7;
const DAY_MS = 86400000;
const VIEWPORT_WEEKS = 52;
const STEP_WEEKS = 26;

function getIntensity(count) {
  if (count === 0) return 0;
  if (count <= 5) return 1;
  if (count <= 15) return 2;
  if (count <= 30) return 3;
  return 4;
}

// Contribution-style green ramp — empty → faint → bright, like GitHub. Green is
// the language of activity/growth here, matching the rest of the dashboard.
const INTENSITY_COLORS = [
  'transparent',
  theme.goodSoft,   // faint green wash
  '#2c6b52',        // mid green
  theme.good,       // bright green
  theme.goodInk,    // brightest green
];

function formatDateShort(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMonthYear(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export default function StreakHeatmap({ data }) {
  const [offset, setOffset] = useState(0);
  const [hover, setHover] = useState(null);

  const heatmap = data?.heatmap || [];
  const streak = data?.streak || { current: 0, best: 0 };
  const countMap = new Map(heatmap.map((h) => [h.day, h.count]));

  // Compute viewport date range
  const today = new Date();
  const viewportEnd = new Date(today.getTime() - offset * WEEK_DAYS * DAY_MS);
  const viewportStart = new Date(viewportEnd.getTime() - (VIEWPORT_WEEKS * WEEK_DAYS - 1) * DAY_MS);

  // Build visible grid
  const grid = [];
  const monthLabels = [];
  let currentMonth = -1;

  for (let week = 0; week < VIEWPORT_WEEKS; week++) {
    const col = [];
    for (let day = 0; day < WEEK_DAYS; day++) {
      const date = new Date(viewportStart.getTime() + (week * WEEK_DAYS + day) * DAY_MS);
      const iso = date.toISOString().slice(0, 10);
      const count = countMap.get(iso) || 0;
      col.push({ iso, count, intensity: getIntensity(count) });

      if (day === 0) {
        const m = date.getMonth();
        const y = date.getFullYear();
        const key = y * 12 + m;
        if (key !== currentMonth) {
          currentMonth = key;
          monthLabels.push({ week, label: date.toLocaleDateString(undefined, { month: 'short' }) });
        }
      }
    }
    grid.push(col);
  }

  const canGoRight = offset > 0;
  const rangeLabel = `${formatMonthYear(viewportStart.toISOString().slice(0, 10))} – ${formatMonthYear(viewportEnd.toISOString().slice(0, 10))}`;

  return (
    <div style={{ background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '1.25rem 1.25rem 1.1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.9rem' }}>
        <div>
          <div style={{
            fontSize: 10,
            color: theme.inkSoft,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            fontWeight: 600,
            marginBottom: 4,
          }}>
            Study Streaks
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.55rem' }}>
            <span style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: '1.5rem',
              fontWeight: 600,
              color: theme.gold,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {streak.current ?? 0}
            </span>
            <span style={{ fontSize: 12, color: theme.inkSoft }}>
              day{streak.current === 1 ? '' : 's'} current
              {streak.best ? ` · best ${streak.best}` : ''}
            </span>
          </div>
          <div style={{ fontSize: 11, color: theme.inkSoft, marginTop: 4 }}>{rangeLabel}</div>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            onClick={() => setOffset((o) => o + STEP_WEEKS)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              border: `1px solid ${theme.border}`,
              background: theme.panel,
              color: theme.ink,
              fontSize: 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
            title="Older"
          >
            <Icon.ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setOffset((o) => Math.max(0, o - STEP_WEEKS))}
            disabled={!canGoRight}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              border: `1px solid ${theme.border}`,
              background: canGoRight ? theme.panel : theme.bg,
              color: canGoRight ? theme.ink : theme.border,
              fontSize: 16,
              cursor: canGoRight ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
            title="Newer"
          >
            <Icon.ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Month labels */}
      <div style={{ display: 'grid', gridTemplateColumns: `20px repeat(${VIEWPORT_WEEKS}, 1fr)`, gap: 3, marginBottom: 3 }}>
        <div />
        {Array.from({ length: VIEWPORT_WEEKS }, (_, i) => {
          const label = monthLabels.find((m) => m.week === i);
          return (
            <div key={i} style={{ fontSize: 10, color: theme.inkSoft, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label ? label.label : ''}
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: `20px repeat(${VIEWPORT_WEEKS}, 1fr)`, gap: 3 }}>
        {/* Weekday labels */}
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={`label-${i}`} style={{ gridColumn: 1, gridRow: i + 1, fontSize: 9, color: theme.inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {i % 2 === 1 ? '' : d}
          </div>
        ))}

        {/* Cells */}
        {grid.map((col, weekIdx) =>
          col.map((cell, dayIdx) => {
            const isToday = cell.iso === new Date().toISOString().slice(0, 10);
            return (
              <div
                key={`${weekIdx}-${dayIdx}`}
                onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, ...cell })}
                onMouseMove={(e) => setHover((h) => h && h.iso === cell.iso ? { ...h, x: e.clientX, y: e.clientY } : h)}
                onMouseLeave={() => setHover(null)}
                style={{
                  gridColumn: weekIdx + 2,
                  gridRow: dayIdx + 1,
                  width: '100%',
                  aspectRatio: '1 / 1',
                  borderRadius: 2,
                  background: INTENSITY_COLORS[cell.intensity],
                  // Only TODAY gets a marker — a subtle light ring, no loud amber.
                  // Streak days already read through the green intensity ramp.
                  border: isToday
                    ? `1.5px solid ${theme.ink}`
                    : `1px solid ${cell.intensity === 0 ? theme.border : 'transparent'}`,
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                  opacity: new Date(cell.iso) > today ? 0.3 : 1,
                }}
              />
            );
          })
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 10, color: theme.inkSoft }}>Less</span>
        {INTENSITY_COLORS.map((c, i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c, border: i === 0 ? `1px solid ${theme.border}` : 'none' }} />
        ))}
        <span style={{ fontSize: 10, color: theme.inkSoft }}>More</span>
      </div>

      {hover && (
        <div style={{
          position: 'fixed',
          left: hover.x + 12,
          top: hover.y - 36,
          background: theme.panel,
          border: `1px solid ${theme.border}`,
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 12,
          color: theme.ink,
          pointerEvents: 'none',
          zIndex: 100,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
          <div style={{ fontWeight: 600 }}>{formatDateShort(hover.iso)}</div>
          <div>{hover.count} review{hover.count === 1 ? '' : 's'}</div>
        </div>
      )}
    </div>
  );
}
