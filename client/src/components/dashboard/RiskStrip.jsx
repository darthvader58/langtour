import { theme } from '../../theme';

export default function RiskStrip({ data }) {
  const r = data?.recallable;
  if (!r) return null;

  const atRisk = r.words_at_risk ?? 0;
  const protectVal = r.protect_if_reviewed ?? 0;
  const tomorrow = r.tomorrow ?? 0;
  const now = r.now ?? 0;
  const tomorrowDelta = tomorrow - now;
  const tomorrowDown = tomorrowDelta < 0;
  const holdingStrong = Math.max(0, Math.round(now - atRisk));

  // best from trend
  const trend = data?.recallable_trend;
  const wordBest = trend?.length ? Math.max(...trend.map(p => p.recallable ?? 0)) : now;
  const tomorrowVsBest = Math.round(tomorrow - wordBest);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', height: '100%' }}>
      <RiskCard
        accent={atRisk > 0 ? theme.rose : theme.matchaMid}
        eyebrow={atRisk > 0 ? '⚠ slipping away today' : 'At risk'}
        primary={atRisk.toLocaleString()}
        primarySuffix="words at risk"
        body={
          atRisk > 0
            ? `Reviewing them now could recover ~${Math.round(protectVal).toLocaleString()} word${Math.round(protectVal) !== 1 ? 's' : ''} of recall. The other ${holdingStrong.toLocaleString()} are holding strong.`
            : 'Nothing slipping today. Your memory is solid.'
        }
        urgent={atRisk > 0}
      />
      <RiskCard
        accent={tomorrowDown ? theme.rose : theme.matchaDeep}
        eyebrow="Tomorrow's forecast · if you stop now"
        primary={Math.round(tomorrow).toLocaleString()}
        primarySuffix="words"
        body={
          tomorrowDown
            ? `${Math.abs(Math.round(tomorrowDelta)).toLocaleString()} behind today${tomorrowVsBest < 0 ? ` · ${Math.abs(tomorrowVsBest).toLocaleString()} from your best` : ''}.`
            : `On track — review today to stay ahead.`
        }
        urgent={tomorrowDown}
      />
    </div>
  );
}

function RiskCard({ accent, eyebrow, primary, primarySuffix, body, urgent }) {
  return (
    <div style={{
      flex: 1,
      background: urgent ? `rgba(184,66,94,0.04)` : theme.panel,
      border: `1px solid ${urgent ? 'rgba(184,66,94,0.18)' : theme.border}`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 4,
      padding: '0.9rem 1.1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{
        fontSize: 10,
        color: urgent ? theme.rose : theme.inkSoft,
        textTransform: 'uppercase',
        letterSpacing: '0.15em',
        fontWeight: 700,
        opacity: urgent ? 0.9 : 0.7,
      }}>
        {eyebrow}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 5,
      }}>
        <span style={{
          fontFamily: "'Cormorant Garamond', 'Noto Serif SC', serif",
          fontSize: '2.2rem',
          fontWeight: 600,
          color: accent,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
        }}>
          {primary}
        </span>
        <span style={{
          fontSize: '0.8rem',
          color: theme.inkSoft,
          fontWeight: 500,
        }}>
          {primarySuffix}
        </span>
      </div>
      <div style={{
        fontSize: 12,
        color: urgent ? theme.ink : theme.inkSoft,
        lineHeight: 1.5,
      }}>
        {body}
      </div>
    </div>
  );
}
