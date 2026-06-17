// ─────────────────────────────────────────────────────────────
// Histórico de dividendos (Alpha Vantage DIVIDENDS, JSON). Para la
// estrategia "dividend": ¿cuántos años CONSECUTIVOS sube el dividendo
// anual? (proxy de "dividend aristocrat") + importe por año. Bajo
// demanda (no en /quality): su propio endpoint + botón. Cacheado vía
// avCache (TTL 7d). Agrega los pagos por año (ex_dividend_date).
// ─────────────────────────────────────────────────────────────
import { avQuery } from './avCache.js';

export async function getDividends(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return null;

  const { data, stale, fetchedAt } = await avQuery('DIVIDENDS', sym);
  const rows = Array.isArray(data?.data) ? data.data : [];

  // Suma de importes por año natural (ex-dividend date).
  const byYear = {};
  for (const r of rows) {
    const amt = parseFloat(r.amount);
    const y = (String(r.ex_dividend_date || r.payment_date || '').match(/^\d{4}/) || [])[0];
    if (y && Number.isFinite(amt) && amt > 0) byYear[y] = +((byYear[y] || 0) + amt).toFixed(4);
  }
  const allYears = Object.keys(byYear).map(Number);
  if (!allYears.length) return null;

  const thisYear = new Date().getFullYear();
  // Años COMPLETOS (excluye el actual, que aún no tiene todos los pagos) desc.
  const complete = allYears.filter(y => y < thisYear).sort((a, b) => b - a);

  // Racha de crecimiento: años consecutivos (desde el último completo) en que el
  // dividendo anual sube respecto al año anterior.
  let streak = 0;
  for (let i = 0; i < complete.length - 1; i++) {
    if (byYear[complete[i]] > byYear[complete[i + 1]] + 1e-9) streak++;
    else break;
  }

  // Histórico para mostrar (últimos 6 años; marca el actual como parcial).
  const years = allYears.sort((a, b) => b - a).slice(0, 6);
  const history = years.map((y, idx) => {
    const older = years[idx + 1];
    const up = (y >= thisYear || older == null) ? null : byYear[y] > byYear[older];
    return { year: String(y), amount: byYear[y], partial: y >= thisYear, up };
  });

  return {
    streak,
    annual: complete.length ? byYear[complete[0]] : null,   // último año completo
    annualYear: complete.length ? String(complete[0]) : null,
    history,
    stale: !!stale,
    fetchedAt,
  };
}
