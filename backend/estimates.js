// ─────────────────────────────────────────────────────────────
// Revisiones de estimaciones de EPS + consenso de analistas (Yahoo
// quoteSummary). Es "momentum fundamental": ¿los analistas suben o bajan
// sus previsiones? El módulo earningsTrend exige cookie + crumb. Crumb
// cacheado 30 min. No gasta cuota de Alpha Vantage.
// ─────────────────────────────────────────────────────────────
import { yahooSymbol } from './sectors.js';
import { UA, ensureCrumb } from './yahooCrumb.js';

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
