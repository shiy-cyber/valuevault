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
//
// Respaldo Financial Modeling Prep (SOLO si AV falla/no cubre el ticker):
// un único endpoint 'earnings' trae en la misma llamada tanto el próximo
// resultado (filas futuras, epsActual null) como el histórico ya reportado
// (filas pasadas, epsActual real) — cubre el respaldo de las dos funciones
// de este archivo.
// ─────────────────────────────────────────────────────────────
import { avQuery } from './avCache.js';
import { fmpQuery } from './fmp.js';

async function fetchEarningsFMP(sym) {
  // Plan gratis de FMP: límite 5 (comprobado en vivo, igual que el resto de
  // endpoints salvo analyst-estimates). Con 5 registros ya cubre 1 futuro +
  // ~4 trimestres pasados, que es justo lo que necesitan las dos funciones.
  return fmpQuery('earnings', { symbol: sym, limit: 5 });
}

export async function getNextEarnings(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return null;
  const today = new Date().toISOString().slice(0, 10);

  let best = null; // { date, estimate }
  try {
    const { data } = await avQuery('EARNINGS_CALENDAR', sym, { extra: '&horizon=3month' });
    const text = typeof data === 'string' ? data : '';
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
  } catch { /* AV caído/cuota agotada → se intenta el respaldo FMP */ }
  if (best) return best;

  const rows = await fetchEarningsFMP(sym);
  const future = (rows || []).filter(r => r.date && r.date >= today).sort((a, b) => a.date < b.date ? -1 : 1);
  return future[0] ? { date: future[0].date, estimate: future[0].epsEstimated ?? null } : null;
}

// Sorpresas de resultados (Alpha Vantage EARNINGS, JSON). Momentum fundamental:
// ¿la empresa bate o falla las estimaciones de EPS? Devuelve los últimos 4
// trimestres (para la tira de badges) + un histórico largo (hasta 10 años)
// del MISMO array ya descargado — sin llamada extra — con EPS estimado vs
// real por trimestre, para el gráfico de consenso a largo plazo. Cacheado
// vía avCache (TTL 7d).
export async function getEarningsSurprises(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return null;
  const fnum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const mapRow = (r) => {
    const sp = fnum(r.surprisePercentage);
    return {
      date: r.fiscalDateEnding,
      reportedEPS: fnum(r.reportedEPS),
      estimatedEPS: fnum(r.estimatedEPS),
      surprisePct: sp == null ? null : +sp.toFixed(1),
      beat: sp == null ? null : sp >= 0,
    };
  };

  let full = [];
  try {
    const { data } = await avQuery('EARNINGS', sym);
    const q = Array.isArray(data?.quarterlyEarnings) ? data.quarterlyEarnings : [];
    full = q.map(mapRow).filter(r => r.reportedEPS != null);
  } catch { /* AV caído/cuota agotada → se intenta el respaldo FMP */ }

  if (!full.length) {
    // Respaldo FMP: solo 5 registros de cuota gratis → sin fondo suficiente
    // para el histórico largo, pero sirve igual para la tira de 4 trimestres.
    const rows = await fetchEarningsFMP(sym);
    const reported = (rows || []).filter(r => r.epsActual != null).sort((a, b) => a.date < b.date ? 1 : -1);
    full = reported.map(r => {
      const est = r.epsEstimated;
      const sp = (est != null && est !== 0) ? ((r.epsActual - est) / Math.abs(est)) * 100 : null;
      return {
        date: r.date,
        reportedEPS: r.epsActual,
        estimatedEPS: est ?? null,
        surprisePct: sp == null ? null : +sp.toFixed(1),
        beat: sp == null ? null : sp >= 0,
      };
    });
  }

  if (!full.length) return null;
  const history = full.slice(0, 4); // tira de badges, comportamiento sin cambios
  const epsHistory = full.slice(0, 40); // hasta 10 años (trimestral) para el gráfico
  const rated = history.filter(r => r.beat != null);
  return { history, epsHistory, beats: rated.filter(r => r.beat).length, total: rated.length };
}
