// ─────────────────────────────────────────────────────────────
// Indicadores económicos vía Alpha Vantage (gratis), para cubrir lo que
// macro.js NO tiene (FRED está bloqueado en serverless): tasa de PARO
// (UNEMPLOYMENT) y crecimiento del PIB REAL (REAL_GDP, YoY). Cacheado vía
// avCache (TTL 7d): ~2 llamadas/semana en total, despreciable frente a la
// cuota. Estos endpoints NO usan `symbol` → symbolParam: null.
//
// Respaldo Financial Modeling Prep (SOLO si AV falla), independiente por
// campo — economic-indicators?name=unemploymentRate da 2 puntos reales
// (sirve igual que AV); name=realGDP solo da el ÚLTIMO punto en el plan
// gratis (probado, incluso pidiendo rango de fechas), así que no hay forma
// real de calcular un crecimiento interanual con FMP — gdpGrowth se queda
// en null si AV falla, no se inventa un cálculo con un solo dato.
// ─────────────────────────────────────────────────────────────
import { avQuery } from './avCache.js';
import { fmpQuery } from './fmp.js';

// AV devuelve los datos newest-first: [{ date:'YYYY-MM-DD', value:'x' }, …]
function points(data) {
  return (Array.isArray(data) ? data : [])
    .map(r => ({ date: r.date, value: parseFloat(r.value) }))
    .filter(p => p.date && Number.isFinite(p.value));
}
// FMP: [{ name, date:'YYYY-MM-DD', value:number }, …] (ya newest-first)
function pointsFMP(rows) {
  return (rows || [])
    .map(r => ({ date: r.date, value: r.value }))
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
  } catch { /* tolerante: si falla, se intenta el respaldo FMP */ }
  if (!out.unemployment) {
    const pts = pointsFMP(await fmpQuery('economic-indicators', { name: 'unemploymentRate' }));
    if (pts.length) {
      out.unemployment = {
        value: +pts[0].value.toFixed(1),
        date: pts[0].date,
        prev: pts[1] ? +pts[1].value.toFixed(1) : null,
      };
    }
  }

  // PIB real (anual, nivel en miles de M$) → crecimiento interanual %.
  try {
    const { data } = await avQuery('REAL_GDP', null, { symbolParam: null, extra: '&interval=annual' });
    const pts = points(data?.data);
    if (pts.length >= 2 && pts[1].value) {
      out.gdpGrowth = { value: +(((pts[0].value / pts[1].value) - 1) * 100).toFixed(1), date: pts[0].date };
    }
  } catch { /* tolerante: si falla, se intenta el respaldo FMP */ }
  if (!out.gdpGrowth) {
    const pts = pointsFMP(await fmpQuery('economic-indicators', { name: 'realGDP' }));
    if (pts.length >= 2 && pts[1].value) {
      out.gdpGrowth = { value: +(((pts[0].value / pts[1].value) - 1) * 100).toFixed(1), date: pts[0].date };
    } // con 1 solo punto (lo habitual en el plan gratis de FMP) queda null — no se inventa el crecimiento
  }

  return out;
}
