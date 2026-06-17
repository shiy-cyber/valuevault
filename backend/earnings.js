// ─────────────────────────────────────────────────────────────
// Próximos resultados (Alpha Vantage EARNINGS_CALENDAR). El endpoint
// devuelve CSV: symbol,name,reportDate,fiscalDateEnding,estimate,currency.
// Devolvemos la fecha futura más cercana de publicación de resultados
// (+ estimación de EPS si la trae). Sirve para AUTO-CATALIZADOR: rellenar
// catalyst/catalystDate del activo. Pasa por avCache (cacheado, throttle,
// resiliencia) → coste de cuota solo la 1ª vez por ticker.
//
// Parseo por REGEX (no por índice de columna): reportDate es la PRIMERA
// fecha YYYY-MM-DD de cada línea (antes que fiscalDateEnding), así somos
// inmunes a comas dentro del nombre de la empresa.
// ─────────────────────────────────────────────────────────────
import { avQuery } from './avCache.js';

export async function getNextEarnings(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return null;

  const { data } = await avQuery('EARNINGS_CALENDAR', sym, { extra: '&horizon=3month' });
  const text = typeof data === 'string' ? data : '';
  const today = new Date().toISOString().slice(0, 10);

  let best = null; // { date, estimate }
  for (const line of text.split('\n')) {
    const dates = line.match(/\d{4}-\d{2}-\d{2}/g);
    if (!dates) continue;
    const date = dates[0];        // reportDate (1ª fecha de la fila)
    if (date < today) continue;   // solo futuras
    if (best && date >= best.date) continue;
    // Estimación: primer número tras la 2ª fecha (fiscalDateEnding).
    let estimate = null;
    if (dates[1]) {
      const m = (line.split(dates[1])[1] || '').match(/-?\d+(\.\d+)?/);
      if (m) estimate = parseFloat(m[0]);
    }
    best = { date, estimate };
  }
  return best;
}
