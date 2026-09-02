// ─────────────────────────────────────────────────────────────
// Función PROGRAMADA de Netlify (cron). Rellena la BD por adelantado, fuera
// de la ruta de la petición del usuario. La API luego solo LEE de la BD.
// Ingesta de cotizaciones. Ajusta el horario en `config.schedule`.
//
// Macro/sentimiento YA NO pasan por aquí: el manifiesto de funciones de
// Netlify mostraba `schedule: null` pese a estar bien declarado (fallo de
// la plataforma, no del código), así que esta función llevaba ~2 meses sin
// dispararse y esos snapshots se quedaron congelados sin que nadie lo
// notara. /api/macro y /api/sentiment ahora hacen fetch en vivo con su
// propia caché en memoria (mismo patrón que /api/sectors) — no dependen de
// ningún cron, así que da igual que este siga sin dispararse.
// ─────────────────────────────────────────────────────────────
import { ready } from '../../backend/db.js';
import { ingestQuotes, isAuthorizedCron } from '../../backend/ingest.js';

// Cada 15 min: cotizaciones de cartera. (Fundamentales van en una función
// DIARIA aparte por la cuota de AV.)
export const config = { schedule: '*/15 * * * *' };

export const handler = async (event) => {
  if (!isAuthorizedCron(event)) return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado' }) };
  await ready();                       // asegura esquema (idempotente)
  const quotes = await ingestQuotes();
  return { statusCode: 200, body: JSON.stringify({ quotes }) };
};
