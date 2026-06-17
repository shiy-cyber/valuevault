// ─────────────────────────────────────────────────────────────
// Indicadores económicos vía Alpha Vantage (gratis), para cubrir lo que
// macro.js NO tiene (FRED está bloqueado en serverless): tasa de PARO
// (UNEMPLOYMENT) y crecimiento del PIB REAL (REAL_GDP, YoY). Cacheado vía
// avCache (TTL 7d): ~2 llamadas/semana en total, despreciable frente a la
// cuota. Estos endpoints NO usan `symbol` → symbolParam: null.
// ─────────────────────────────────────────────────────────────
import { avQuery } from './avCache.js';

// AV devuelve los datos newest-first: [{ date:'YYYY-MM-DD', value:'x' }, …]
function points(data) {
  return (Array.isArray(data) ? data : [])
    .map(r => ({ date: r.date, value: parseFloat(r.value) }))
    .filter(p => p.date && Number.isFinite(p.value));
}

export async function getEconomics() {
  const out = { unemployment: null, gdpGrowth: null };

  // Tasa de paro (mensual, %). Último valor + anterior (tendencia).
  try {
    const { data } = await avQuery('UNEMPLOYMENT', null, { symbolParam: null });
    const pts = points(data?.data);
    if (pts.length) {
      out.unemployment = {
        value: +pts[0].value.toFixed(1),
        date: pts[0].date,
        prev: pts[1] ? +pts[1].value.toFixed(1) : null,
      };
    }
  } catch { /* tolerante: si falla, queda null */ }

  // PIB real (anual, nivel en miles de M$) → crecimiento interanual %.
  try {
    const { data } = await avQuery('REAL_GDP', null, { symbolParam: null, extra: '&interval=annual' });
    const pts = points(data?.data);
    if (pts.length >= 2 && pts[1].value) {
      out.gdpGrowth = { value: +(((pts[0].value / pts[1].value) - 1) * 100).toFixed(1), date: pts[0].date };
    }
  } catch { /* tolerante */ }

  return out;
}
