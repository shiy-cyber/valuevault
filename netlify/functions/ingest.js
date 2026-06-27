// ─────────────────────────────────────────────────────────────
// Función PROGRAMADA de Netlify (cron). Rellena la BD por adelantado, fuera
// de la ruta de la petición del usuario. La API luego solo LEE de la BD.
// PROTOTIPO: ingesta de cotizaciones. Ajusta el horario en `config.schedule`.
// ─────────────────────────────────────────────────────────────
import { ready } from '../../backend/db.js';
import { ingestQuotes } from '../../backend/ingest.js';

// Cada 15 min. En producción conviene afinar al horario de mercado.
export const config = { schedule: '*/15 * * * *' };

export const handler = async () => {
  await ready();                       // asegura esquema (idempotente)
  const summary = await ingestQuotes();
  return { statusCode: 200, body: JSON.stringify(summary) };
};
