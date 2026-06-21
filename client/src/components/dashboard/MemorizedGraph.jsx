import { useMemo, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { theme } from '../../theme';

const CHART_MARGIN = { top: 5, right: 10, left: 0, bottom: 0 };

// Phase-boundary shadow style. Both fix the old bug where the seam collapsed to a
// vertical line (it diffused along the surface normal, which is vertical on flat
// stretches). Both instead blend across a HORIZONTAL band so the transition is
// always soft, never a laser line.
//   'diagonal' — a clean cross-fade sheared to lean along the curve's slope.
//   'organic'  — same band, feathered by value-noise so the terminator wanders
//                like a real cast shadow's penumbra.
const SHADOW_MODE = 'diagonal'; // 'diagonal' | 'organic'

// Deterministic 2D value noise in [-1, 1] (hash + smooth bilinear). No deps; used
// only by the 'organic' shadow mode to make the seam edge irregular.
function hash2(ix, iy) {
  let h = (ix * 374761393 + iy * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295; // [0,1]
}
function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  const top = a + (b - a) * ux, bot = c + (d - c) * ux;
  return (top + (bot - top) * uy) * 2 - 1; // [-1,1]
}

// Words-memorized is a growth metric → green line. Accuracy keeps its own green.
const METRICS = {
  recallable: { key: 'recallable', label: 'Words',    tooltip: 'Memorized', decimals: false, suffix: '',  color: theme.good },
  accuracy:   { key: 'accuracy',   label: 'Accuracy', tooltip: 'Accuracy',  decimals: true,  suffix: '%', color: theme.good },
  reviews:    { key: 'reviews',    label: 'Reviews',  tooltip: 'Reviews',   decimals: false, suffix: '',  color: theme.matchaMid },
};

function ChartTooltip({ active, payload, label, dragResult, metric, unit = 'words' }) {
  if (dragResult) {
    return (
      <div style={{
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 4,
        padding: '8px 12px',
        fontSize: 12,
        color: theme.ink,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}>
        <div style={{ color: theme.inkSoft, marginBottom: 3 }}>
          {dragResult.startDay} → {dragResult.endDay}
        </div>
        <div>
          <span style={{ fontWeight: 600, color: dragResult.delta >= 0 ? theme.good : theme.bad }}>
            {dragResult.delta >= 0 ? '+' : ''}{dragResult.delta.toLocaleString()} {unit}
          </span>
          <span style={{ color: theme.border, margin: '0 4px' }}>·</span>
          <span style={{ color: theme.inkSoft }}>
            {dragResult.startValue.toLocaleString()} → {dragResult.endValue.toLocaleString()}
          </span>
        </div>
      </div>
    );
  }
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 4,
        padding: '8px 12px',
        fontSize: 12,
        color: theme.ink,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}>
        <div style={{ color: theme.inkSoft, marginBottom: 3 }}>{label}</div>
        {payload.length > 1 ? (
          payload.map((entry, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, lineHeight: 1.6 }}>
              <span style={{ color: entry.color }}>{entry.name}</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{entry.value}</span>
            </div>
          ))
        ) : (
          <div>{metric?.tooltip ?? 'Value'}: {payload[0].value.toLocaleString()}{metric?.suffix ?? ''}</div>
        )}
      </div>
    );
  }
  return null;
}

export default function MemorizedGraph({
  data,
  trendDays,
  options,
  onChangeTrendDays,
  desiredRetention = 0.9,
  trendLoading = false,
  // Optional context overrides (default to the vocabulary "Memory portfolio").
  // Reused by the grammar Properties modal to show a single structure's
  // retention without changing the dashboard's copy.
  eyebrow,
  unit = 'words',
  metricsOverride = null,
  showMetricTabs = true,
  hint = 'Click and drag on the chart to measure growth between two dates',
  // When true, X-axis labels keep the year (YYYY-MM-DD) instead of MM-DD. Used by
  // the single-word retention pane, whose window can span multiple years.
  showYear = false,
}) {
  const metrics = metricsOverride || METRICS;
  const [activeMetricKey, setActiveMetricKey] = useState('recallable');
  const metric = metrics[activeMetricKey] || Object.values(metrics)[0];

  const chartData = useMemo(() => {
    const trend = data?.recallable_trend;
    if (!trend?.length) return [];
    return trend.map((d) => {
      const r = d.reviews || {};
      return {
        day: showYear ? d.day : d.day.slice(5),
        fullDay: d.day,
        value: activeMetricKey === 'accuracy' ? d.accuracy : activeMetricKey === 'reviews' ? (r.again || 0) + (r.hard || 0) + (r.good || 0) + (r.easy || 0) : d.recallable,
        future: !!d.future,
        again: r.again || 0,
        hard: r.hard || 0,
        good: r.good || 0,
        easy: r.easy || 0,
      };
    });
  }, [data, activeMetricKey, showYear]);

  // Auto-scale the y-axis to the data's actual range (with ~12% padding) so volatility is
  // visible even when the values sit in a narrow band — e.g. network-lit % hovering near
  // 5–10% would otherwise hug the floor on a fixed 0–100 axis. Clamp the % metric to [0,100].
  const yDomain = useMemo(() => {
    if (!chartData.length) return undefined;
    let lo = Infinity, hi = -Infinity;
    for (const d of chartData) { if (d.value < lo) lo = d.value; if (d.value > hi) hi = d.value; }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return undefined;
    const span = hi - lo || Math.abs(hi) || 1;
    const pad = span * 0.12;
    let min = lo - pad;
    let max = hi + pad;
    if (metric.suffix === '%') { min = Math.max(0, min); max = Math.min(100, max); }
    else { min = Math.max(0, min); } // count metrics never go below 0
    return [Number(min.toFixed(2)), Number(max.toFixed(2))];
  }, [chartData, metric.suffix]);

  const current = activeMetricKey === 'recallable' ? (data?.recallable?.now ?? 0) : (chartData[chartData.length - 1]?.value ?? 0);
  const actualDays = data?.meta?.trend_days ?? trendDays;
  const first = chartData[0]?.value ?? current;
  const delta = current - first;
  const deltaPct = first > 0 ? (delta / first) * 100 : 0;
  const deltaUp = delta >= 0;

  // Slope-colored gradient: GREEN where the TREND is rising, RED where falling.
  // Crucially this is driven by a SMOOTHED trend, not raw day-to-day deltas —
  // otherwise the line flickers red/green on every tiny wiggle and looks noisy.
  // We compute an EMA of the values, then color each point by the sign of the
  // EMA's slope over a small lookback window, with a deadband so flat stretches
  // don't flip colors. Recharts interpolates between adjacent stops so direction
  // changes fade smoothly. The accuracy metric keeps its flat semantic color.
  const slopeStops = useMemo(() => {
    if (activeMetricKey !== 'recallable' || chartData.length < 5) return null;
    const vals = chartData.map((d) => d.value).filter((v) => v != null);
    if (vals.length < 5) return null;
    const n = chartData.length;
    const valAt = (i) => chartData[Math.max(0, Math.min(n - 1, i))].value ?? 0;

    // Three-state phase coloring: GREEN growing, YELLOW stagnant/plateau, RED
    // declining. The goal is the LOW-FREQUENCY shape a human reads — one long
    // climb, a broad top plateau, one long slide — not medium swings or per-day
    // jitter. That requires aggressive smoothing (windows on the order of MONTHS
    // for a year of data, not days). Validated against real trends to produce
    // ~3 macro phases rather than a fragmented rainbow. So:
    //   1. Heavily smooth with a wide centered moving average (~15% of span).
    //   2. Measure smoothed slope over a wide window (~18% of span), normalized
    //      to fraction-of-range so thresholds are scale-free.
    //   3. Band it: |slope| under `flat` → yellow; above → green/red by sign.
    //   4. Hysteresis so a phase commits and holds instead of toggling.
    const half = Math.max(3, Math.round(n * 0.15));
    const smooth = new Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = i - half; k <= i + half; k++) { s += valAt(k); c++; }
      smooth[i] = s / c;
    }

    const range = Math.max(...vals) - Math.min(...vals) || 1;
    const win = Math.max(3, Math.round(n * 0.18));
    // slope expressed as fraction of total range across the window
    const slopeFrac = (i) => (smooth[Math.min(n - 1, i + win)] - smooth[Math.max(0, i - win)]) / range;

    const RISE = 0.05;   // growth band
    const FALL = -0.05;  // decline band; |slope| in between is provisionally flat

    // Pass 1 — provisional band per point.
    const band = new Array(n);
    for (let i = 0; i < n; i++) {
      const sl = slopeFrac(i);
      band[i] = sl >= RISE ? 'grow' : sl <= FALL ? 'decline' : 'flat';
    }

    // Pass 2 — BOTTOM-UP MERGE so only the GENERAL sections survive. The user
    // reads a few macro-phases (one long climb, a broad plateau, one long slide);
    // the raw banding fragments into many short runs on noisy data. We repeatedly
    // take the SHORTEST run and dissolve it into its cheaper-to-merge neighbour
    // until every surviving run is at least `minSeg` points long. A grow↔decline
    // turn separated only by a sub-threshold flat is split at its midpoint into
    // the two real directions, instead of leaving a gold sliver at every turn.
    const toRuns = () => {
      const r = []; let cur = null;
      for (let i = 0; i < n; i++) {
        if (!cur || cur.s !== band[i]) { cur = { s: band[i], a: i, b: i }; r.push(cur); }
        else cur.b = i;
      }
      return r;
    };
    const writeBand = (a, b, s) => { for (let i = a; i <= b; i++) band[i] = s; };
    const minSeg = Math.max(7, Math.round(n * 0.12));
    // Mean smoothed value of a run — used to decide which neighbour a flat belongs
    // with (merge toward the side whose level it is closest to).
    const runMean = (r) => { let s = 0; for (let i = r.a; i <= r.b; i++) s += smooth[i]; return s / (r.b - r.a + 1); };

    let runs = toRuns();
    let guard = 0;
    while (runs.length > 1 && guard++ < 500) {
      // shortest run
      let si = 0, sLen = Infinity;
      for (let k = 0; k < runs.length; k++) {
        const len = runs[k].b - runs[k].a + 1;
        if (len < sLen) { sLen = len; si = k; }
      }
      if (sLen >= minSeg) break; // every run is now a real macro-phase
      const r = runs[si], prev = runs[si - 1], next = runs[si + 1];

      if (prev && next && prev.s !== next.s && r.s !== prev.s && r.s !== next.s) {
        // A genuine turn buried under a short transitional run (e.g. a flat between
        // a climb and a slide): split it at the midpoint into the two directions.
        const mid = Math.floor((r.a + r.b) / 2);
        writeBand(r.a, mid, prev.s);
        writeBand(mid + 1, r.b, next.s);
      } else {
        // Dissolve into the better neighbour: prefer one that shares this run's
        // sign; otherwise the one whose level is closest (for flats), else the
        // longer neighbour.
        let tgt;
        if (prev && prev.s === r.s) tgt = prev.s;
        else if (next && next.s === r.s) tgt = next.s;
        else if (prev && next) {
          const m = runMean(r);
          tgt = Math.abs(m - runMean(prev)) <= Math.abs(m - runMean(next)) ? prev.s : next.s;
        } else tgt = (prev || next).s;
        writeBand(r.a, r.b, tgt);
      }
      runs = toRuns(); // recompute; merges may have joined same-sign neighbours
    }

    const colorFor = { grow: theme.good, flat: theme.gold, decline: theme.bad };

    // Per-point phase band → the canvas overlay draws the line + two-color fill in
    // a single pass from this, so line and fill colours can never disagree. Each
    // boundary is the midpoint INDEX between the last point of one phase run and
    // the first of the next; the canvas places the noisy seam there.
    const bands = chartData.map((d, i) => ({ value: d.value, band: band[i], color: colorFor[band[i]], future: !!d.future }));
    const boundaries = [];
    for (let i = 1; i < n; i++) {
      if (band[i] !== band[i - 1]) boundaries.push({ index: i - 0.5, fromBand: band[i - 1], toBand: band[i] });
    }

    return { bands, boundaries, colorFor };
  }, [chartData, activeMetricKey]);
  const useSlope = false; // plain recharts — canvas overlay disabled

  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const [selection, setSelection] = useState(null);
  const [result, setResult] = useState(null);

  // Canvas overlay: draw the line + two-colour fill ourselves in ONE pass, so the
  // line colour and the fill (shadow) boundary come from the same geometry and can
  // never misalign. We piggy-back on recharts ONLY for the axes/grid/tooltip; its
  // own line/fill are rendered transparent. We read the plot box and the per-point
  // pixel positions straight from recharts' rendered SVG so the canvas matches the
  // axes exactly (same scaling, y-domain, margins).
  useLayoutEffect(() => {
    if (!useSlope || !slopeStops) return;
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    let raf = 0;
    let retries = 0;
    const MAX_RETRIES = 10;
    const draw = () => {
      const svg = wrapper.querySelector('.recharts-surface');
      const areaPath = wrapper.querySelector('.recharts-area-area');
      if (!svg || !areaPath) {
        if (++retries < MAX_RETRIES) { raf = requestAnimationFrame(draw); }
        return;
      }
      const wrapRect = wrapper.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const bbox = areaPath.getBBox();            // plot area in SVG user units
      if (!bbox || bbox.width === 0 || bbox.height === 0) {
        if (++retries < MAX_RETRIES) { raf = requestAnimationFrame(draw); }
        return;
      }
      const svgVB = svg.viewBox?.baseVal;
      const sx = svgVB && svgVB.width ? svgRect.width / svgVB.width : 1;
      const sy = svgVB && svgVB.height ? svgRect.height / svgVB.height : 1;
      // plot box in wrapper-local CSS px
      const plotL = (svgRect.left - wrapRect.left) + bbox.x * sx;
      const plotW = bbox.width * sx;
      const plotT = (svgRect.top - wrapRect.top) + bbox.y * sy;
      const plotH = bbox.height * sy;
      const baselineY = plotT + plotH;            // bottom of the area (baseline)

      const dpr = window.devicePixelRatio || 1;
      const cssW = wrapRect.width, cssH = wrapRect.height;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const pts = slopeStops.bands;
      const n = pts.length;
      if (n < 2) return;
      const vals = pts.map((p) => p.value);
      const vmin = Math.min(...vals), vmax = Math.max(...vals);
      const vspan = (vmax - vmin) || 1;
      // recharts y-domain has ~12% pad (see yDomain). Use the area bbox directly:
      // top of bbox = max value, bottom = baseline. Map value→y proportionally to
      // the rendered area so the canvas line sits exactly on recharts' curve.
      const xAt = (i) => plotL + (i / (n - 1)) * plotW;
      const yAt = (v) => plotT + (1 - (v - vmin) / vspan) * plotH;

      // ---- diffuse phase-boundary shadow (fill & line) -----------------------
      // The base colour is the grow/flat/decline phase. At each boundary the two
      // phase colours CROSS-FADE over a HORIZONTAL band centred on the seam x.
      // Blending horizontally (not along the surface normal, as the old code did)
      // is the fix for the seam collapsing to a vertical line on flat stretches.
      //   'diagonal' — the band is sheared by the local curve slope, so it leans
      //                along the curve instead of standing straight up.
      //   'organic'  — the same band, its edge perturbed by value-noise so the
      //                terminator wanders like a real penumbra.
      const colorFor = slopeStops.colorFor;
      const boundaries = slopeStops.boundaries;

      // Smooth values for a stable per-x slope estimate (used to shear the band).
      const smoothVals = new Array(n);
      const win = 3; // 7-point centred moving average
      for (let i = 0; i < n; i++) {
        let sum = 0, count = 0;
        for (let j = -win; j <= win; j++) {
          const idx = Math.max(0, Math.min(n - 1, i + j));
          sum += pts[idx].value;
          count++;
        }
        smoothVals[i] = sum / count;
      }
      // Half-width of the cross-fade band, in CSS px. Independent of curvature
      // (the old curvature term is what blew up to a wide vertical band on flats).
      const HALF_W = Math.max(18, Math.min(70, plotW * 0.05));
      const SHEAR = 0.6;       // how strongly the band leans with the curve slope
      const NOISE_AMP = HALF_W * 0.9;  // organic edge wander, in px
      const NOISE_FREQ = 0.045;        // organic noise spatial frequency

      // MACRO slope of the smoothed curve at the seam, measured over a WIDE window
      // (~the band width) so a tall single-day spike at the boundary can't tilt the
      // shadow. A local 3-point slope blows up at spikes and produces a hard
      // fan-shaped seam under them; the wide window reflects the trend, not the
      // spike.
      const slopePxAt = (fi) => {
        const w = Math.max(2, Math.round((HALF_W / plotW) * (n - 1)));
        const a = Math.max(0, Math.min(n - 1, Math.round(fi) - w));
        const b = Math.max(0, Math.min(n - 1, Math.round(fi) + w));
        if (b === a) return 0;
        return (yAt(smoothVals[b]) - yAt(smoothVals[a])) / ((b - a) * (plotW / (n - 1)));
      };

      const boundaryData = boundaries.map((b) => ({
        ...b,
        x: xAt(b.index),
        slope: slopePxAt(b.index),
      }));

      const smoothstep = (edge0, edge1, x) => {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      };

      const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
      const colorCache = { grow: hex2rgb(colorFor.grow), flat: hex2rgb(colorFor.flat), decline: hex2rgb(colorFor.decline) };
      const phaseAtX = (x) => {
        const fi = ((x - plotL) / plotW) * (n - 1);
        return pts[Math.max(0, Math.min(n - 1, Math.round(fi)))].band;
      };

      // RGB at (x, y): find the nearest boundary in x; if (x,y) falls inside its
      // horizontal cross-fade band, blend fromBand→toBand by a smoothstep of the
      // band coordinate `u`. `u` is sheared by the curve slope ('diagonal') and,
      // in 'organic' mode, perturbed by value-noise so the seam edge is irregular.
      const rgbAtPoint = (x, y, yCurve) => {
        let best = null, bestDist = Infinity;
        for (const b of boundaryData) {
          const d = Math.abs(x - b.x);
          if (d < bestDist) { bestDist = d; best = b; }
        }
        if (best && bestDist <= HALF_W * 2) {
          // Horizontal offset from the seam, sheared so the band leans with the
          // curve (so a sloped section gets a slanted, not vertical, terminator).
          // The shear is CLAMPED to ±HALF_W so deep below the curve — or at a steep
          // boundary — the band can lean but never fold back into a hard seam.
          const shear = Math.max(-HALF_W, Math.min(HALF_W, SHEAR * best.slope * (y - yCurve)));
          let u = (x - best.x) - shear;
          if (SHADOW_MODE === 'organic') {
            u += NOISE_AMP * valueNoise(x * NOISE_FREQ, y * NOISE_FREQ);
          }
          const t = smoothstep(-HALF_W, HALF_W, u);
          const [ar, ag, ab] = colorCache[best.fromBand];
          const [br, bg, bb] = colorCache[best.toBand];
          return [ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t];
        }
        return colorCache[phaseAtX(x)];
      };
      const colorAtPoint = (x, y, yCurve, alpha = 1) => {
        const [r, g, b] = rgbAtPoint(x, y, yCurve);
        return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
      };

      // FILL: a PER-PIXEL image, so colour varies continuously in both x and y with
      // no strip seams (the old per-column fillRect loop left a faint corduroy
      // pattern). We paint an ImageData at device resolution covering the plot box,
      // computing the shadow colour and a top→baseline alpha falloff at every pixel,
      // then blit it once under a clip to the curve+baseline polygon.
      const x0 = Math.max(0, Math.floor(plotL));
      const x1 = Math.min(cssW, Math.ceil(plotL + plotW));
      const y0 = Math.max(0, Math.floor(plotT - 4));
      const y1 = Math.min(cssH, Math.ceil(baselineY + 4));
      const bw = Math.max(1, Math.round((x1 - x0) * dpr));
      const bh = Math.max(1, Math.round((y1 - y0) * dpr));
      const off = document.createElement('canvas');
      off.width = bw; off.height = bh;
      const octx = off.getContext('2d');
      const img = octx.createImageData(bw, bh);
      const buf = img.data;
      // The fill needs TWO curve references:
      //   yClipAtX  — the TRUE curve, used only to decide where the fill starts
      //               (so it still hugs each spike's real outline under the clip).
      //   yShadeAtX — a SMOOTHED envelope, used for the top→baseline alpha falloff
      //               and the shear reference. Driving the vertical shading off the
      //               raw curve made `yCurve` jump column-to-column at a spike, which
      //               printed a thin vertical seam from the spike tip to the
      //               baseline. Smoothing the shading reference removes that seam
      //               without softening the visible spike outline.
      const interpY = (arr, x) => {
        const fi = ((x - plotL) / plotW) * (n - 1);
        const ia = Math.max(0, Math.min(n - 1, Math.floor(fi)));
        const ib = Math.max(0, Math.min(n - 1, Math.ceil(fi)));
        const f = fi - ia;
        return yAt(arr[ia] + (arr[ib] - arr[ia]) * f);
      };
      const rawVals = pts.map((p) => p.value);
      // A wider envelope than smoothVals (which still rides spikes) so the vertical
      // shading gradient is seam-free even under a tall single-day spike.
      const shadeVals = new Array(n);
      const sw = Math.max(4, Math.round(n * 0.04));
      for (let i = 0; i < n; i++) {
        let sum = 0, c = 0;
        for (let j = -sw; j <= sw; j++) { sum += rawVals[Math.max(0, Math.min(n - 1, i + j))]; c++; }
        shadeVals[i] = sum / c;
      }
      const yClipAtX = (x) => interpY(rawVals, x);
      const yShadeAtX = (x) => interpY(shadeVals, x);
      for (let py = 0; py < bh; py++) {
        const cssY = y0 + py / dpr;
        for (let px = 0; px < bw; px++) {
          const cssX = x0 + px / dpr;
          const yClip = yClipAtX(cssX);
          if (cssY < yClip - 0.5) continue; // above the real curve → nothing to paint
          const yShade = yShadeAtX(cssX);
          // Alpha: 0.40 near the (smoothed) curve → 0.08 at the baseline.
          const denom = (baselineY - yShade) || 1;
          const f = Math.max(0, Math.min(1, (cssY - yShade) / denom));
          const alpha = 0.40 + (0.08 - 0.40) * f;
          if (alpha <= 0) continue;
          const [r, g, b] = rgbAtPoint(cssX, cssY, yShade);
          const o = (py * bw + px) * 4;
          buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = Math.round(alpha * 255);
        }
      }
      octx.putImageData(img, 0, 0);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(xAt(0), yAt(pts[0].value));
      for (let i = 0; i < n; i++) ctx.lineTo(xAt(i), yAt(pts[i].value));
      ctx.lineTo(plotL + plotW, baselineY);
      ctx.lineTo(plotL, baselineY);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(off, x0, y0, x1 - x0, y1 - y0);
      ctx.restore();

      // LINE: per-segment stroke coloured by the midpoint on the curve. Segments
      // past the latest review (forecast decay) are drawn dashed; observed-so-far
      // segments are solid. A point is "future" only after the latest review, so
      // the seam falls exactly on the now-boundary.
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (let i = 1; i < n; i++) {
        const xMid = (xAt(i - 1) + xAt(i)) / 2;
        const yMid = (yAt(pts[i - 1].value) + yAt(pts[i].value)) / 2;
        ctx.strokeStyle = colorAtPoint(xMid, yMid, yMid);
        ctx.setLineDash(pts[i].future ? [4, 4] : []);
        ctx.beginPath();
        ctx.moveTo(xAt(i - 1), yAt(pts[i - 1].value));
        ctx.lineTo(xAt(i), yAt(pts[i].value));
        ctx.stroke();
      }
      ctx.setLineDash([]);
    };

    raf = requestAnimationFrame(draw);
    // Recharts ResponsiveContainer defers SVG layout by a frame or two.
    // If the area path has zero bbox on the first draw, re-schedule once.
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); });
    ro.observe(wrapper);
    // Fallback: schedule a second draw attempt ~200ms later in case the ResizeObserver
    // never fires (e.g. the SVG was already present at observer attach time and never
    // resizes). This catches the timing gap on initial mount.
    const fallbackTimer = setTimeout(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    }, 200);
    return () => { cancelAnimationFrame(raf); clearTimeout(fallbackTimer); ro.disconnect(); };
  }, [useSlope, slopeStops, chartData, yDomain]);

  const getIndexFromX = useCallback((x) => {
    if (!wrapperRef.current || chartData.length < 2) return 0;
    const rect = wrapperRef.current.getBoundingClientRect();
    const width = rect.width;
    const plotWidth = width - CHART_MARGIN.left - CHART_MARGIN.right;
    const clampedX = Math.max(CHART_MARGIN.left, Math.min(x, width - CHART_MARGIN.right));
    const relativeX = clampedX - CHART_MARGIN.left;
    const interval = plotWidth / (chartData.length - 1);
    return Math.max(0, Math.min(chartData.length - 1, Math.round(relativeX / interval)));
  }, [chartData.length]);

  const computeResult = useCallback((startX, endX) => {
    const i1 = getIndexFromX(Math.min(startX, endX));
    const i2 = getIndexFromX(Math.max(startX, endX));
    if (i1 === i2) return null;
    const start = chartData[i1];
    const end = chartData[i2];
    const delta = end.value - start.value;
    return {
      startDay: start.fullDay,
      endDay: end.fullDay,
      startValue: start.value,
      endValue: end.value,
      delta,
    };
  }, [chartData, getIndexFromX]);

  const handleMouseDown = useCallback((e) => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    setSelection({ startX, endX: startX, selecting: true });

    const onMove = (ev) => {
      const r = wrapperRef.current?.getBoundingClientRect();
      if (!r) return;
      const mx = Math.max(0, Math.min(ev.clientX - r.left, r.width));
      setSelection({ startX, endX: mx, selecting: true });
      setResult(computeResult(startX, mx));
    };

    const onUp = () => {
      setSelection(null);
      setResult(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [computeResult]);

  const selectionLeft = selection ? Math.min(selection.startX, selection.endX) : 0;
  const selectionWidth = selection ? Math.abs(selection.endX - selection.startX) : 0;

  if (!chartData.length) {
    return (
      <div style={{ background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 6, padding: '1.5rem' }}>
        <div style={{ color: theme.inkSoft, fontSize: 13 }}>Not enough data yet. Start reviewing to see your progress!</div>
      </div>
    );
  }

  return (
    <div style={{ background: theme.paper, border: `1px solid ${theme.border}`, borderRadius: 14, padding: '1.4rem 1.5rem 0.9rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <div>
          <div style={{
            fontSize: 10,
            color: theme.inkFaint,
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            fontWeight: 600,
            marginBottom: 6,
          }}>
            {eyebrow || `Memory portfolio · last ${actualDays} days`}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.55rem', flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: '1.7rem',
              fontWeight: 600,
              color: deltaUp ? theme.good : theme.bad,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.01em',
            }}>
              {deltaUp ? '+' : ''}{Math.round(delta).toLocaleString()}{metric.suffix}
            </span>
            <span style={{
              fontSize: 12,
              fontWeight: 700,
              color: deltaUp ? theme.goodInk : theme.badInk,
              background: deltaUp ? theme.goodSoft : theme.badSoft,
              border: `1px solid ${deltaUp ? theme.good : theme.bad}44`,
              borderRadius: 999,
              padding: '1px 8px',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {deltaUp ? '↑' : '↓'} {Math.abs(deltaPct).toFixed(1)}%
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Metric tabs */}
          {showMetricTabs && (
          <div style={{ display: 'flex', gap: '0.2rem' }}>
            {Object.values(metrics).map((m) => (
              <button
                key={m.key}
                onClick={() => setActiveMetricKey(m.key)}
                style={{
                  padding: '0.25rem 0.7rem',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  background: activeMetricKey === m.key ? theme.matchaInk : 'transparent',
                  color: activeMetricKey === m.key ? theme.matchaSoft : theme.inkSoft,
                  border: `1px solid ${activeMetricKey === m.key ? theme.matchaInk : theme.border}`,
                  cursor: 'pointer',
                  borderRadius: 999,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          )}
          {/* Time range */}
          <div style={{ display: 'flex', gap: '0.2rem', opacity: trendLoading ? 0.6 : 1, transition: 'opacity 150ms' }}>
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onChangeTrendDays(opt.value)}
                disabled={trendLoading}
                style={{
                  padding: '0.25rem 0.7rem',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  background: trendDays === opt.value ? theme.matchaInk : 'transparent',
                  color: trendDays === opt.value ? theme.matchaSoft : theme.inkSoft,
                  border: `1px solid ${trendDays === opt.value ? theme.matchaInk : theme.border}`,
                  cursor: trendLoading ? 'wait' : 'pointer',
                  borderRadius: 999,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeMetricKey === 'accuracy' ? (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="2 4" stroke={theme.border} opacity={0.5} vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: theme.inkSoft }}
              interval="preserveStartEnd"
              minTickGap={40}
              axisLine={{ stroke: theme.border }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: theme.inkSoft }}
              axisLine={false}
              tickLine={false}
              width={36}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              content={<ChartTooltip dragResult={null} metric={metric} unit={unit} />}
              wrapperStyle={{ outline: 'none', zIndex: 20 }}
              cursor={{ fill: 'rgba(79,191,134,0.08)' }}
            />
            <ReferenceLine
              y={desiredRetention * 100}
              stroke={theme.matchaMid}
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{ value: `${Math.round(desiredRetention * 100)}% target`, position: 'insideTopRight', fontSize: 10, fill: theme.inkSoft }}
            />
            <Bar dataKey="value" radius={[2, 2, 0, 0]} opacity={0.85}>
              {chartData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.value === null ? 'transparent' : entry.value >= desiredRetention * 100 ? theme.good : theme.bad}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : activeMetricKey === 'reviews' ? (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="2 4" stroke={theme.border} opacity={0.5} vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: theme.inkSoft }}
              interval="preserveStartEnd"
              minTickGap={40}
              axisLine={{ stroke: theme.border }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: theme.inkSoft }}
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              width={36}
              domain={yDomain || undefined}
            />
            <Tooltip
              content={<ChartTooltip dragResult={null} metric={metric} unit={unit} />}
              wrapperStyle={{ outline: 'none', zIndex: 20 }}
              cursor={{ fill: 'rgba(79,191,134,0.08)' }}
            />
            {/* FSRS rating palette (RdYlGn diverging): Again→Easy. Deliberately
                distinct from the slope/accuracy good/bad greens elsewhere. */}
            <Bar dataKey="again" name="Again" stackId="reviews" fill="#A50026" />
            <Bar dataKey="hard" name="Hard" stackId="reviews" fill="#FDBE70" />
            <Bar dataKey="good" name="Good" stackId="reviews" fill="#B6E076" />
            <Bar dataKey="easy" name="Easy" stackId="reviews" fill="#006837" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div
          ref={wrapperRef}
          onMouseDown={handleMouseDown}
          style={{ position: 'relative', userSelect: 'none', cursor: 'crosshair' }}
        >
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={chartData} margin={CHART_MARGIN}>
              <defs>
                {/* Flat fill/stroke for the accuracy metric. */}
                <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={metric.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={metric.color} stopOpacity={0.02} />
                </linearGradient>

                {/* Slope metric: the line + two-colour fill are drawn on a <canvas>
                    overlay (see the useLayoutEffect), so the line colour and the
                    fill seam come from one geometry and can't misalign. recharts
                    here only renders the axes/grid/tooltip; its Area is transparent
                    but kept so the canvas can read the plot bbox from it. */}
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke={theme.border} opacity={0.5} vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10, fill: theme.inkSoft }}
                interval="preserveStartEnd"
                minTickGap={showYear ? 64 : 40}
                axisLine={{ stroke: theme.border }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: theme.inkSoft }}
                allowDecimals={metric.decimals}
                axisLine={false}
                tickLine={false}
                width={36}
                domain={yDomain || undefined}
                tickFormatter={metric.suffix ? (v) => `${Math.round(v)}${metric.suffix}` : undefined}
              />
              <Tooltip
                content={<ChartTooltip dragResult={result} metric={metric} unit={unit} />}
                wrapperStyle={{ outline: 'none', zIndex: 20 }}
                cursor={{ stroke: theme.matchaMid, strokeWidth: 1, strokeDasharray: '3 3' }}
              />
              {/* The Area. For the accuracy metric it paints its flat fill+stroke.
                  For the slope metric it's transparent (canvas overlay draws it) but
                  still present so recharts lays out the area path the canvas reads. */}
              <Area
                type="monotone"
                dataKey="value"
                stroke={useSlope ? 'transparent' : metric.color}
                strokeWidth={useSlope ? 0 : 2.2}
                fill={useSlope ? 'transparent' : 'url(#areaFill)'}
                fillOpacity={1}
                isAnimationActive={false}
                dot={false}
                connectNulls={false}
                activeDot={useSlope ? false : { r: 4, fill: theme.ink, stroke: theme.panel, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Canvas overlay: line + two-colour fill with the soft noise seam. */}
          {useSlope && (
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 5,
              }}
            />
          )}

          {/* Selection highlight */}
          {selection && selectionWidth > 2 && (
            <div style={{
              position: 'absolute',
              top: 0,
              bottom: 30,
              left: selectionLeft,
              width: selectionWidth,
              background: 'rgba(125, 140, 240, 0.18)',
              pointerEvents: 'none',
              zIndex: 10,
            }} />
          )}
        </div>
      )}

      {hint && (
        <div style={{ fontSize: 11, color: theme.inkSoft, marginTop: 6, textAlign: 'center' }}>
          {hint}
        </div>
      )}
    </div>
  );
}
