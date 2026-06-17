// ─────────────────────────────────────────────────────────────
// Autocompletado de símbolos (búsqueda de ticker por nombre/keywords).
// Usa el endpoint GRATUITO de Yahoo (v1/finance/search, sin crumb) en
// lugar de Alpha Vantage SYMBOL_SEARCH: AV cobraría 1 llamada POR
// PULSACIÓN de tecla y agotaría la cuota de 25/día al instante. Yahoo es
// gratis e ilimitado para esto. No gasta cuota de Alpha Vantage.
// ─────────────────────────────────────────────────────────────
import { UA } from './yahooCrumb.js';

const OK_TYPES = new Set(['EQUITY', 'ETF', 'INDEX', 'MUTUALFUND', 'CRYPTOCURRENCY', 'CURRENCY']);

export async function searchSymbols(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&enableFuzzyQuery=false`;
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error(`Yahoo search HTTP ${r.status}`);
  const j = await r.json();
  const quotes = Array.isArray(j?.quotes) ? j.quotes : [];

  return quotes
    .filter(it => it.symbol && OK_TYPES.has(it.quoteType))
    .map(it => ({
      symbol: it.symbol,
      name: it.shortname || it.longname || it.symbol,
      exchange: it.exchDisp || it.exchange || null,
      type: it.quoteType || null,
    }))
    .slice(0, 8);
}
