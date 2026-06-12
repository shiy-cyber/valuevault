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

// Inflación vía BLS y tipo Fed vía NY Fed — APIs públicas programáticas,
// sin clave y accesibles desde datacenter (a diferencia de FRED/Akamai,
// que filtra la IP de Netlify). PCE queda fuera (es de BEA, requiere clave).
const BLS_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const NYFED_EFFR = 'https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json';
const BLS_CORE_CPI = 'CUUR0000SA0L1E'; // IPC subyacente (sin energía ni alimentos)
const BLS_CPI = 'CUUR0000SA0';         // IPC general

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const curveStatus = (v) => v == null ? '—' : v < -0.005 ? 'Invertida' : v < 0.25 ? 'Plana' : 'Normal';

// Corta cualquier promesa colgada para que una fuente lenta no tumbe la función
// (Netlify mata a ~10s; sin esto, un fetch sin respuesta colgaba todo el endpoint).
const withTimeout = (p, ms, label) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms)),
]);

// ─── Curva de tipos (Yahoo) ─────────────────────────────────
async function getCurve() {
  const series = {};
  const curve = await Promise.all(CURVE.map(async (c) => {
    try {
      const { points, meta } = await withTimeout(fetchChart(c.symbol, '2y', '1d'), 7000, c.symbol);
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

// ─── Inflación (BLS) + tipo Fed (NY Fed) ────────────────────
// Variación interanual de una serie BLS (datos newest-first, mensual)
function blsYoY(data) {
  if (!data || data.length < 13) return null;
  const latest = data[0];
  const prior = data.find(d => Number(d.year) === Number(latest.year) - 1 && d.period === latest.period) || data[12];
  if (!prior) return null;
  return {
    value: +(((Number(latest.value) / Number(prior.value)) - 1) * 100).toFixed(2),
    date: `${latest.year}-${latest.period.slice(1)}-01`,
  };
}

async function getInflation() {
  const year = new Date().getFullYear();
  const body = JSON.stringify({ seriesid: [BLS_CORE_CPI, BLS_CPI], startyear: String(year - 1), endyear: String(year) });
  const r = await fetch(BLS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error(`BLS HTTP ${r.status}`);
  const j = await r.json();
  const byId = {};
  for (const s of (j.Results?.series || [])) byId[s.seriesID] = s.data;
  return { coreCPI: blsYoY(byId[BLS_CORE_CPI]), cpi: blsYoY(byId[BLS_CPI]) };
}

async function getFedRate() {
  const r = await fetch(NYFED_EFFR, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error(`NYFed HTTP ${r.status}`);
  const j = await r.json();
  const ref = j.refRates?.[0];
  return ref ? { value: Number(ref.percentRate), date: ref.effectiveDate } : null;
}

let cache = { ts: 0, data: null };
const TTL = 30 * 60 * 1000;

export async function getMacro(force = false) {
  if (!force && cache.data && Date.now() - cache.ts < TTL) return cache.data;

  const [curve, infl, fed] = await Promise.allSettled([
    withTimeout(getCurve(), 8000, 'curve'),
    withTimeout(getInflation(), 7500, 'bls'),
    withTimeout(getFedRate(), 7500, 'nyfed'),
  ]);
  const inflation = {
    coreCPI: infl.status === 'fulfilled' ? infl.value.coreCPI : null,
    cpi: infl.status === 'fulfilled' ? infl.value.cpi : null,
    fedFunds: fed.status === 'fulfilled' ? fed.value : null,
  };
  const data = {
    curve: curve.status === 'fulfilled' ? curve.value : null,
    inflation,
    at: new Date().toISOString(),
    errors: {
      curve: curve.status === 'rejected' ? String(curve.reason?.message || curve.reason) : null,
      bls: infl.status === 'rejected' ? String(infl.reason?.message || infl.reason) : null,
      nyfed: fed.status === 'rejected' ? String(fed.reason?.message || fed.reason) : null,
    },
  };
  cache = { ts: Date.now(), data };
  return data;
}
