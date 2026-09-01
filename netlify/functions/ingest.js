// ─────────────────────────────────────────────────────────────
// Función PROGRAMADA de Netlify (cron). Rellena la BD por adelantado, fuera
// de la ruta de la petición del usuario. La API luego solo LEE de la BD.
// PROTOTIPO: ingesta de cotizaciones. Ajusta el horario en `config.schedule`.
// ─────────────────────────────────────────────────────────────
import { ready } from '../../backend/db.js';
import { ingestQuotes, ingestSnapshots, isAuthorizedCron } from '../../backend/ingest.js';

// Frecuente (cada 15 min): cotizaciones + snapshots (macro/sentimiento).
// (Fundamentales van en una función DIARIA aparte por la cuota de AV.)
export const config = { schedule: '*/15 * * * *' };

export const handler = async (event) => {
  if (!isAuthorizedCron(event)) return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado' }) };
  await ready();                       // asegura esquema (idempotente)
  const [quotes, snapshots] = await Promise.all([ingestQuotes(), ingestSnapshots()]);
  return { statusCode: 200, body: JSON.stringify({ quotes, snapshots }) };
};
