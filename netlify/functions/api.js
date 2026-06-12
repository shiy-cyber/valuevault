// ─────────────────────────────────────────────────────────────
// Función serverless de Netlify: expone toda la API Express.
// El redirect /api/* → /.netlify/functions/api/:splat la invoca.
// ─────────────────────────────────────────────────────────────
import serverless from 'serverless-http';
import { createApp } from '../../backend/app.js';

// Memoiza la PROMESA de init (no el resultado): así, si llegan varias
// peticiones a una instancia fría a la vez, comparten un único arranque en
// lugar de ejecutar createApp()/migraciones en paralelo. Si falla, se limpia
// para reintentar en la siguiente petición (no cachea un rechazo).
let cachedPromise;
function getHandler() {
  if (!cachedPromise) {
    cachedPromise = createApp()
      .then(app => serverless(app))
      .catch(e => { cachedPromise = null; throw e; });
  }
  return cachedPromise;
}

export const handler = async (event, context) => {
  const sh = await getHandler();
  // Normaliza la ruta a la pública (/api/...) para que casen las rutas Express.
  if (event.rawUrl) {
    try { event.path = new URL(event.rawUrl).pathname; } catch { /* noop */ }
  }
  return sh(event, context);
};
