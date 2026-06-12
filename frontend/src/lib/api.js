// Cliente del backend. En desarrollo usa el proxy de Vite (/api → :3001).
// En producción define VITE_API_URL con la URL del backend (Railway/Render).
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const u = (path) => `${BASE}${path}`;

async function req(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(u(path), opts);
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}

export const api = {
  getAssets:   () => req('GET', '/api/assets'),
  createAsset: (a) => req('POST', '/api/assets', a),
  updateAsset: (id, a) => req('PUT', `/api/assets/${id}`, a),
  deleteAsset: (id) => req('DELETE', `/api/assets/${id}`),

  getNotes:   () => req('GET', '/api/notes'),
  createNote: (n) => req('POST', '/api/notes', n),
  deleteNote: (id) => req('DELETE', `/api/notes/${id}`),

  getConfig: () => req('GET', '/api/config'),
  setConfig: (key, value) => req('PUT', `/api/config/${key}`, { value }),

  getExport: () => req('GET', '/api/export'),

  lookup:  (ticker) => req('GET', `/api/lookup/${encodeURIComponent(ticker)}`),
  sectors: () => req('GET', '/api/sectors'),
  indices: (fresh) => req('GET', `/api/indices${fresh ? '?fresh=1' : ''}`),
  sentiment: (fresh) => req('GET', `/api/sentiment${fresh ? '?fresh=1' : ''}`),
  macro: (fresh) => req('GET', `/api/macro${fresh ? '?fresh=1' : ''}`),
  marketMap: () => req('GET', '/api/market-map'),
  quote:   (symbol) => req('GET', `/api/quote/${encodeURIComponent(symbol)}`),
  history: (symbol, range) => req('GET', `/api/history/${encodeURIComponent(symbol)}?range=${range}`),
  refreshPrices: () => req('POST', '/api/assets/refresh-prices'),
  refreshAssetData: (id) => req('POST', `/api/assets/${id}/refresh-data`),
};
