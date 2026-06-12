// ─────────────────────────────────────────────────────────────
// Dashboard macro. Combina:
//   · Curva de tipos del Tesoro USA (Yahoo, % directo) → 3M..30A,
//     spreads 10Y-2Y y 10Y-3M con señal de inversión + histórico.
//   · Inflación subyacente (Core PCE / Core CPI, YoY) y tipo Fed
//     vía FRED (CSV público sin clave). Tolerante a fallos.
// Cache 30 min (los datos macro cambian a diario/mensual).
// ─────────────────────────────────────────────────────────────
import { fetchChart } from './sectors.js';

// Tramos de la curva (rendimiento en % directo desde Yahoo)
const CURVE = [
  { key: '3M',  symbol: '^IRX',  label: '3M',  months: 3 },
  { key: '2Y',  symbol: '2YY=F', label: '2A',  months: 24 },
  { key: '5Y',  symbol: '^FVX',  label: '5A',  months: 60 },
  { key: '10Y', symbol: '^TNX',  label: '10A', months: 120 },
  { key: '30Y', symbol: '^TYX',  label: '30A', months: 360 },
];

const FRED = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=';
const FRED_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; ValueVault/1.0)' };

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const curveStatus = (v) => v == null ? '—' : v < -0.005 ? 'Invertida' : v < 0.25 ? 'Plana' : 'Normal';

// ─── Curva de tipos (Yahoo) ─────────────────────────────────
async function getCurve() {
  const series = {};
  const curve = await Promise.all(CURVE.map(async (c) => {
    try {
      const { points, meta } = await fetchChart(c.symbol, '2y', '1d');
      const value = meta.regularMarketPrice ?? points[points.length - 1]?.close ?? null;
      series[c.key] = points;
      return { key: c.key, label: c.label, months: c.months, value: value != null ? +Number(value).toFixed(3) : null };
    } catch {
      return { key: c.key, label: c.label, months: c.months, value: null };
    }
  }));

  const val = (k) => curve.find(c => c.key === k)?.value ?? null;
  const sp = (a, b) => (val(a) != null && val(b) != null) ? +(val(a) - val(b)).toFixed(3) : null;

  // Histórico del spread 10Y-2Y alineando por fecha (downsample ~60 pts)
  let history = [];
  if (series['10Y']?.length && series['2Y']?.length) {
    const twoMap = new Map(series['2Y'].map(p => [isoDay(p.t), p.close]));
    const raw = [];
    for (const p of series['10Y']) {
      const d = isoDay(p.t);
      if (twoMap.has(d)) raw.push({ t: p.t, spread: +(p.close - twoMap.get(d)).toFixed(3) });
    }
    const step = Math.max(1, Math.floor(raw.length / 60));
    history = raw.filter((_, i) => i % step === 0);
  }

  const s102 = sp('10Y', '2Y');
  const s103 = sp('10Y', '3M');
  return {
    points: curve,
    spread10_2: { value: s102, status: curveStatus(s102), history },
    spread10_3m: { value: s103, status: curveStatus(s103) },
  };
}

// ─── FRED: inflación subyacente + tipo Fed ──────────────────
async function fredSeries(id, cosd = '2022-01-01') {
  const r = await fetch(`${FRED}${id}&cosd=${cosd}`, { headers: FRED_HEADERS });
  if (!r.ok) throw new Error(`FRED ${id} HTTP ${r.status}`);
  const txt = await r.text();
  return txt.trim().split('\n').slice(1)
    .map(l => l.split(','))
    .filter(c => c[1] && c[1].trim() !== '.' && !Number.isNaN(Number(c[1])))
    .map(c => ({ date: c[0], value: Number(c[1]) }));
}

// Variación interanual de un índice mensual (último vs 12 meses antes)
function yoy(rows) {
  if (rows.length < 13) return null;
  const last = rows[rows.length - 1];
  const prior = rows[rows.length - 13];
  return { value: +(((last.value / prior.value) - 1) * 100).toFixed(2), date: last.date };
}

async function getFred() {
  const [cpi, pce, ff] = await Promise.allSettled([
    fredSeries('CPILFESL'),  // Core CPI (índice)
    fredSeries('PCEPILFE'),  // Core PCE (índice)
    fredSeries('FEDFUNDS'),  // Tipo efectivo Fed (%)
  ]);
  const lastVal = (s) => s.status === 'fulfilled' && s.value.length
    ? { value: s.value[s.value.length - 1].value, date: s.value[s.value.length - 1].date } : null;
  return {
    coreCPI: cpi.status === 'fulfilled' ? yoy(cpi.value) : null,
    corePCE: pce.status === 'fulfilled' ? yoy(pce.value) : null,
    fedFunds: lastVal(ff),
  };
}

let cache = { ts: 0, data: null };
const TTL = 30 * 60 * 1000;

export async function getMacro(force = false) {
  if (!force && cache.data && Date.now() - cache.ts < TTL) return cache.data;

  const [curve, fred] = await Promise.allSettled([getCurve(), getFred()]);
  const data = {
    curve: curve.status === 'fulfilled' ? curve.value : null,
    inflation: fred.status === 'fulfilled' ? fred.value : null,
    at: new Date().toISOString(),
    errors: {
      curve: curve.status === 'rejected' ? String(curve.reason?.message || curve.reason) : null,
      fred: fred.status === 'rejected' ? String(fred.reason?.message || fred.reason) : null,
    },
  };
  cache = { ts: Date.now(), data };
  return data;
}
