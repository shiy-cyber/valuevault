// ─────────────────────────────────────────────────────────────
// Fetch mínimo a Financial Modeling Prep — SOLO se usa como RESPALDO cuando
// Alpha Vantage falla (cuota/red) o no cubre un ticker (algunos valores
// grandes, ej. AAPL/AMAT/BRK.B, no tienen datos en ciertos endpoints AV,
// comprobado en vivo). Cada módulo consumidor decide cuándo intentarlo.
//
// Sin FMP_API_KEY configurada, fmpQuery devuelve null sin lanzar — el
// respaldo simplemente no se intenta, igual que si no existiera esta clave.
// La respuesta de FMP en su plan gratis, cuando un endpoint/parámetro no
// está cubierto, es un OBJETO de error (no un array) — lo tratamos como
// "sin dato" (null), nunca como excepción que rompa el resto del flujo.
// ─────────────────────────────────────────────────────────────
const BASE = 'https://financialmodelingprep.com/stable';

export async function fmpQuery(path, params = {}) {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;
  const qs = new URLSearchParams({ ...params, apikey: key });
  try {
    const r = await fetch(`${BASE}/${path}?${qs}`, { signal: AbortSignal.timeout(9000) });
    const j = await r.json();
    return Array.isArray(j) ? j : null;
  } catch { return null; }
}
