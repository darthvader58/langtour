import { useState, lazy, Suspense } from 'react';
import { theme } from '../theme';
import { useSettings } from '../utils/settings';
import { useApiQuery } from '../lib/apiCache';
import RecallableHero from '../components/dashboard/RecallableHero';

import StreakHeatmap from '../components/dashboard/StreakHeatmap';

// MemorizedGraph pulls in recharts (~350kB). The dashboard is the eager first
// paint, so lazy-loading the chart keeps recharts off the critical path — the
// page shell renders immediately and the chart streams in just below the fold.
const MemorizedGraph = lazy(() => import('../components/dashboard/MemorizedGraph'));

const TREND_OPTIONS = [
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '180d', value: 180 },
  { label: '365d', value: 365 },
];

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: theme.inkSoft,
      opacity: 0.6,
      marginBottom: '0.6rem',
      paddingLeft: 2,
    }}>
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div style={{
      height: 1,
      background: `linear-gradient(90deg, ${theme.border} 0%, transparent 100%)`,
      margin: '0.25rem 0',
      opacity: 0.6,
    }} />
  );
}

export default function Dashboard() {
  const settings = useSettings();
  const [trendDays, setTrendDays] = useState(90);
  const desiredRetention = settings.desiredRetention;

  // Full dashboard payload — cached by URL, so revisiting the page paints from
  // cache instantly and revalidates in the background. The heatmap (104 weeks)
  // only depends on desiredRetention, so it stays on this key regardless of
  // trendDays; the trend window rides its own lighter key below.
  const fullKey = `/api/dashboard?trend_days=90&heatmap_weeks=104&desired_retention=${encodeURIComponent(desiredRetention)}`;
  const full = useApiQuery(fullKey);

  // Trend-only query: when the user changes the window, fetch just the trend
  // (heatmap_weeks=1) under its own cached key. Skip while trendDays is the
  // default 90 — the full payload already carries that window.
  const trendKey = trendDays === 90
    ? null
    : `/api/dashboard?trend_days=${trendDays}&heatmap_weeks=1&desired_retention=${encodeURIComponent(desiredRetention)}`;
  const trend = useApiQuery(trendKey);

  const loading = full.loading;
  const trendLoading = trend.loading;
  const err = full.error ? (full.data?.error || full.error.message) : (full.data?.error || null);
  // Merge the active trend window over the full payload when present.
  const data = full.data
    ? (trend.data?.recallable_trend ? { ...full.data, recallable_trend: trend.data.recallable_trend } : full.data)
    : null;

  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>

      {err && (
        <div style={{ color: '#c00', marginBottom: '0.75rem', fontSize: 13, padding: '0.6rem', background: theme.paper, border: '1px solid #fcc', borderRadius: 6 }}>
          {err}
        </div>
      )}

      {loading && (
        <div style={{ color: theme.inkSoft, fontSize: 13, padding: '2rem 0' }}>Loading dashboard…</div>
      )}

      {!loading && !err && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* ── Row 1: Hero ── */}
          <RecallableHero data={data} desiredRetention={desiredRetention} />

          {/* ── Row 2: Graph ── */}
          <Suspense fallback={<div style={{ minHeight: 280 }} />}>
            <MemorizedGraph
              data={data}
              trendDays={trendDays}
              options={TREND_OPTIONS}
              onChangeTrendDays={setTrendDays}
              desiredRetention={desiredRetention}
              trendLoading={trendLoading}
            />
          </Suspense>

          {/* ── Row 4: Heatmap ── */}
          <StreakHeatmap data={data} />


        </div>
      )}
    </div>
  );
}


