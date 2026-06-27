// ─────────────────────────────────────────────────────────────
// Función PROGRAMADA DIARIA: ingesta de fundamentales (Alpha Vantage).
// Separada de la frecuente por la CUOTA de AV (25/día): ingestFundamentals
// aplica presupuesto y solo refresca los tickers ausentes/viejos.
// ─────────────────────────────────────────────────────────────
import { ready } from '../../backend/db.js';
import { ingestFundamentals } from '../../backend/ingest.js';

export const config = { schedule: '0 6 * * *' }; // 06:00 UTC cada día

export const handler = async () => {
  await ready();
  const fundamentals = await ingestFundamentals();
  return { statusCode: 200, body: JSON.stringify({ fundamentals }) };
};
