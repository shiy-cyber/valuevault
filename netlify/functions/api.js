// ─────────────────────────────────────────────────────────────
// Función serverless de Netlify: expone toda la API Express.
// El redirect /api/* → /.netlify/functions/api/:splat la invoca.
// ─────────────────────────────────────────────────────────────
import serverless from 'serverless-http';
import { createApp } from '../../backend/app.js';

let cached; // memoiza la app+wrapper por instancia caliente
async function getHandler() {
  if (!cached) {
    const app = await createApp();
    cached = serverless(app);
  }
  return cached;
}

export const handler = async (event, context) => {
  const sh = await getHandler();
  // Normaliza la ruta a la pública (/api/...) para que casen las rutas Express.
  if (event.rawUrl) {
    try { event.path = new URL(event.rawUrl).pathname; } catch { /* noop */ }
  }
  return sh(event, context);
};
