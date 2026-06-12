// ─────────────────────────────────────────────────────────────
// Revisiones de estimaciones de EPS + consenso de analistas (Yahoo
// quoteSummary). Es "momentum fundamental": ¿los analistas suben o bajan
// sus previsiones? El módulo earningsTrend exige cookie + crumb. Crumb
// cacheado 30 min. No gasta cuota de Alpha Vantage.
// ─────────────────────────────────────────────────────────────
import { yahooSymbol } from './sectors.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

let crumbCache = { val: null, cookie: null, ts: 0 };
const CRUMB_TTL = 30 * 60 * 1000;

async function ensureCrumb() {
  if (crumbCache.val && Date.now() - crumbCache.ts < CRUMB_TTL) return crumbCache;
  // 1) cookie de sesión (fc.yahoo.com responde 404 pero envía Set-Cookie)
  const r1 = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA } });
  const list = typeof r1.headers.getSetCookie === 'function'
    ? r1.headers.getSetCookie()
    : [r1.headers.get('set-cookie')].filter(Boolean);
  const cookie = list.map(c => c.split(';')[0]).join('; ');
  // 2) crumb asociado a esa cookie
  const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, 'Cookie': cookie } });
  const val = (await r2.text()).trim();
  if (!val || val.length > 32) throw new Error('No se pudo obtener crumb de Yahoo');
  crumbCache = { val, cookie, ts: Date.now() };
  return crumbCache;
}

export async function getEstimates(symbol) {
  const sym = yahooSymbol(symbol);
  const { val, cookie } = await ensureCrumb();
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=earningsTrend,financialData&crumb=${encodeURIComponent(val)}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Cookie': cookie } });
  if (!r.ok) throw new Error(`Yahoo estimates HTTP ${r.status}`);
  const j = await r.json();
  const res = j?.quoteSummary?.result?.[0];
  if (!res) throw new Error('Sin datos de estimaciones');

  const fd = res.financialData || {};
  const trend = res.earningsTrend?.trend || [];
  // Estimación del próximo año fiscal (+1y); si no, año en curso (0y)
  const pick = trend.find(t => t.period === '+1y') || trend.find(t => t.period === '0y') || {};
  const et = pick.epsTrend || {}, er = pick.epsRevisions || {};
  const cur = et.current?.raw, ago = et['30daysAgo']?.raw;
  const epsRev = (cur != null && ago != null && ago !== 0) ? +(((cur - ago) / Math.abs(ago)) * 100).toFixed(2) : null;

  const price = fd.currentPrice?.raw, target = fd.targetMeanPrice?.raw;
  const targetUpside = (price && target) ? +(((target / price) - 1) * 100).toFixed(1) : null;

  return {
    epsRev,                                   // % revisión EPS +1y en 30 días
    up30: er.upLast30days?.raw ?? null,
    down30: er.downLast30days?.raw ?? null,
    targetMean: target ?? null,
    targetUpside,                             // % potencial vs precio actual
    recommendation: fd.recommendationKey ?? null,
    numAnalysts: fd.numberOfAnalystOpinions?.raw ?? null,
  };
}
