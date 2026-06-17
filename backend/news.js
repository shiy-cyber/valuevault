// ─────────────────────────────────────────────────────────────
// Noticias + sentimiento POR ACCIÓN (Alpha Vantage NEWS_SENTIMENT).
// La app ya tiene sentimiento GLOBAL de mercado; esto lo añade por
// ticker. Bajo demanda (no en /quality): tiene su propio endpoint y
// botón. Cacheado vía avCache con TTL 6h (las noticias cambian).
//
// NEWS_SENTIMENT usa el parámetro `tickers=` (no `symbol=`) → se pasa
// symbolParam. Para el sentimiento específico del ticker se usa el bloque
// `ticker_sentiment` de cada artículo (ponderado por relevancia), no el
// sentimiento global del artículo.
// ─────────────────────────────────────────────────────────────
import { avQuery } from './avCache.js';

// Umbrales de etiqueta de Alpha Vantage (sobre score [-1, 1]).
function labelOf(x) {
  if (x == null) return null;
  if (x <= -0.35) return 'Bajista';
  if (x <= -0.15) return 'Algo bajista';
  if (x < 0.15) return 'Neutral';
  if (x < 0.35) return 'Algo alcista';
  return 'Alcista';
}

// "20250115T123000" → "2025-01-15"
const fmtDate = (s) => (typeof s === 'string' && s.length >= 8)
  ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;

export async function getNewsSentiment(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return null;

  const { data, stale } = await avQuery('NEWS_SENTIMENT', sym, {
    symbolParam: 'tickers', extra: '&limit=25&sort=LATEST',
  });
  const feed = Array.isArray(data?.feed) ? data.feed : [];
  const fnum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

  const articles = [];
  let wSum = 0, wTot = 0;
  for (const it of feed) {
    const ts = (it.ticker_sentiment || []).find(t => String(t.ticker || '').toUpperCase() === sym);
    const score = ts ? fnum(ts.ticker_sentiment_score) : fnum(it.overall_sentiment_score);
    const rel = ts ? (fnum(ts.relevance_score) ?? 0.1) : 0.1;
    if (score != null) { wSum += score * rel; wTot += rel; }
    articles.push({
      title: it.title || '(sin título)',
      url: it.url || null,
      source: it.source || null,
      date: fmtDate(it.time_published),
      score: score == null ? null : +score.toFixed(2),
      label: labelOf(score),
    });
  }
  if (!articles.length) return null;

  const avg = wTot ? +(wSum / wTot).toFixed(2) : null;
  return { avg, label: labelOf(avg), count: articles.length, articles: articles.slice(0, 8), stale: !!stale };
}
