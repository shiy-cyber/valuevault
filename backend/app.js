// ─────────────────────────────────────────────────────────────
// ValueVault — app Express reutilizable (local + serverless).
// createApp() devuelve la app con el esquema/semilla ya listos.
// Multi-usuario: la cartera (assets/notes) se aísla por usuario;
// las herramientas de mercado son públicas. Sin login → cuenta demo.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import cors from 'cors';
import { ready, all, get, run, rowToAsset, rowToNote, ASSET_NUM, ASSET_TXT, ASSET_JSON, DEMO_UID } from './db.js';
import { lookupTicker } from './alphavantage.js';
import { getSectors, getIndices, getQuote, getQuotes, getHistory, getMarketMap, getFx } from './sectors.js';
import { getSentiment } from './sentiment.js';
import { getMacro } from './macro.js';
import { getFundamentals } from './valuation.js';
import { getVolProfile } from './volprofile.js';
import { getRisk } from './risk.js';
import { getEstimates } from './estimates.js';
import { getGamma } from './gamma.js';
import { getSMC } from './smc.js';
import { registerUser, loginUser, userFromReq, initAuthSecret, resetWithCode, regenerateRecovery } from './auth.js';

const ALL_COLS = [...ASSET_TXT, ...ASSET_NUM, ...ASSET_JSON, 'type'];

// Construye el objeto-fila a partir del body, saneando tipos
function assetRowFromBody(b) {
  const row = {};
  ASSET_TXT.forEach(c => row[c] = b[c] != null ? String(b[c]) : null);
  ASSET_NUM.forEach(c => {
    const v = b[c];
    row[c] = (v === '' || v === null || v === undefined || Number.isNaN(Number(v))) ? null : Number(v);
  });
  ASSET_JSON.forEach(c => row[c] = JSON.stringify(Array.isArray(b[c]) ? b[c] : []));
  row.type = ['portfolio', 'watchlist'].includes(b.type) ? b.type : 'portfolio';
  if (!row.ticker) throw Object.assign(new Error('Falta ticker'), { status: 400 });
  if (!row.name)   throw Object.assign(new Error('Falta nombre'), { status: 400 });
  if (!['low', 'medium', 'high'].includes(row.risk)) row.risk = 'medium';
  return row;
}

const h = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

// Usuario para LECTURA: el del token, o la cuenta demo si es anónimo
const readUid = (req) => userFromReq(req)?.uid ?? DEMO_UID;
// Usuario para ESCRITURA: exige sesión (no se puede modificar la demo)
const writeUid = (req) => {
  const u = userFromReq(req);
  if (!u) throw Object.assign(new Error('Inicia sesión o crea una cuenta para guardar cambios'), { status: 401 });
  return u.uid;
};

export async function createApp() {
  await ready(); // esquema + semilla + demo (idempotente, una vez por instancia)
  await initAuthSecret(); // clave JWT (entorno o BD), una vez por instancia

  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
  app.use(express.json({ limit: '1mb' }));

  // ─── Salud ─────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  // ─── AUTH ──────────────────────────────────────────────────
  app.post('/api/auth/register', h(async (req, res) => {
    res.status(201).json(await registerUser(req.body.email, req.body.password));
  }));
  app.post('/api/auth/login', h(async (req, res) => {
    res.json(await loginUser(req.body.email, req.body.password));
  }));
  app.get('/api/auth/me', h(async (req, res) => {
    const u = userFromReq(req);
    res.json({ user: u ? { id: u.uid, email: u.email } : null });
  }));
  app.post('/api/auth/reset', h(async (req, res) => {
    res.json(await resetWithCode(req.body.email, req.body.code, req.body.password));
  }));
  app.post('/api/auth/recovery-code', h(async (req, res) => {
    const u = userFromReq(req);
    if (!u) return res.status(401).json({ error: 'Inicia sesión' });
    res.json(await regenerateRecovery(u.uid));
  }));

  // ─── ASSETS (aislados por usuario) ─────────────────────────
  app.get('/api/assets', h(async (req, res) => {
    const rows = await all('SELECT * FROM assets WHERE userId = ? ORDER BY id ASC', [readUid(req)]);
    res.json(rows.map(rowToAsset));
  }));

  app.post('/api/assets', h(async (req, res) => {
    const uid = writeUid(req);
    const row = assetRowFromBody(req.body);
    const cols = [...ALL_COLS, 'userId'];
    const args = [...ALL_COLS.map(c => row[c]), uid];
    const info = await run(
      `INSERT INTO assets (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      args
    );
    const created = await get('SELECT * FROM assets WHERE id = ?', [info.lastInsertRowid]);
    res.status(201).json(rowToAsset(created));
  }));

  app.put('/api/assets/:id', h(async (req, res) => {
    const uid = writeUid(req);
    const id = Number(req.params.id);
    const exists = await get('SELECT id FROM assets WHERE id = ? AND userId = ?', [id, uid]);
    if (!exists) return res.status(404).json({ error: 'Activo no encontrado' });
    const row = assetRowFromBody(req.body);
    const args = [...ALL_COLS.map(c => row[c]), id, uid];
    await run(`UPDATE assets SET ${ALL_COLS.map(c => `${c} = ?`).join(', ')} WHERE id = ? AND userId = ?`, args);
    const updated = await get('SELECT * FROM assets WHERE id = ?', [id]);
    res.json(rowToAsset(updated));
  }));

  app.delete('/api/assets/:id', h(async (req, res) => {
    const uid = writeUid(req);
    const id = Number(req.params.id);
    await run('UPDATE notes SET assetId = NULL WHERE assetId = ? AND userId = ?', [id, uid]);
    const info = await run('DELETE FROM assets WHERE id = ? AND userId = ?', [id, uid]);
    if (!info.changes) return res.status(404).json({ error: 'Activo no encontrado' });
    res.json({ ok: true });
  }));

  // Calcula y persiste calidad del capital (ROIC/FCF yield/WACC) de un activo.
  // Bajo demanda (Alpha Vantage 25/día) y solo para usuarios con sesión.
  app.post('/api/assets/:id/quality', h(async (req, res) => {
    const uid = writeUid(req);
    const id = Number(req.params.id);
    const existing = await get('SELECT * FROM assets WHERE id = ? AND userId = ?', [id, uid]);
    if (!existing) return res.status(404).json({ error: 'Activo no encontrado' });

    // Dos fuentes independientes: ROIC/FCF/WACC (Alpha Vantage, con cuota) y
    // revisiones de EPS + consenso (Yahoo). Si una falla, persistimos la otra.
    const upd = {};
    let fundamentals = null, estimates = null;
    const errs = [];
    try {
      const f = await getFundamentals(existing.ticker);
      fundamentals = f;
      upd.roic = f.roic ?? null; upd.fcfy = f.fcfy ?? null; upd.wacc = f.wacc ?? null;
    } catch (e) { errs.push('fundamentales: ' + e.message); }
    try {
      const est = await getEstimates(existing.ticker);
      estimates = est;
      if (est.epsRev != null) upd.epsRev = est.epsRev;
      if (est.targetMean != null) upd.targetMean = est.targetMean;
      if (est.recommendation != null) upd.recommendation = est.recommendation;
      if (est.numAnalysts != null) upd.numAnalysts = est.numAnalysts;
    } catch (e) { errs.push('estimaciones: ' + e.message); }

    const cols = Object.keys(upd);
    if (!cols.length) return res.status(502).json({ error: errs.join(' · ') || 'Sin datos' });
    await run(`UPDATE assets SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ? AND userId = ?`, [...cols.map(c => upd[c]), id, uid]);
    const updated = rowToAsset(await get('SELECT * FROM assets WHERE id = ?', [id]));
    res.json({ asset: updated, fundamentals, estimates, errors: errs });
  }));

  // ─── NOTES (aisladas por usuario) ──────────────────────────
  app.get('/api/notes', h(async (req, res) => {
    const rows = await all('SELECT * FROM notes WHERE userId = ? ORDER BY id DESC', [readUid(req)]);
    res.json(rows.map(rowToNote));
  }));

  app.post('/api/notes', h(async (req, res) => {
    const uid = writeUid(req);
    const b = req.body;
    if (!b.title || !b.content) return res.status(400).json({ error: 'Falta título o contenido' });
    const info = await run(
      `INSERT INTO notes (title, topic, source, content, tags, date, assetId, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [String(b.title), b.topic || 'value', b.source || '', String(b.content),
       JSON.stringify(Array.isArray(b.tags) ? b.tags : []),
       b.date || new Date().toISOString().slice(0, 10),
       b.assetId ? Number(b.assetId) : null, uid]
    );
    const created = await get('SELECT * FROM notes WHERE id = ?', [info.lastInsertRowid]);
    res.status(201).json(rowToNote(created));
  }));

  app.delete('/api/notes/:id', h(async (req, res) => {
    const uid = writeUid(req);
    const info = await run('DELETE FROM notes WHERE id = ? AND userId = ?', [Number(req.params.id), uid]);
    if (!info.changes) return res.status(404).json({ error: 'Nota no encontrada' });
    res.json({ ok: true });
  }));

  // ─── CONFIG (global: tema) ─────────────────────────────────
  app.get('/api/config', h(async (_req, res) => {
    const rows = await all('SELECT key, value FROM config');
    res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
  }));

  app.put('/api/config/:key', h(async (req, res) => {
    await run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', [req.params.key, String(req.body.value ?? '')]);
    res.json({ ok: true });
  }));

  // ─── EXPORT (de la cartera del usuario) ────────────────────
  app.get('/api/export', h(async (req, res) => {
    const uid = readUid(req);
    const assets = (await all('SELECT * FROM assets WHERE userId = ? ORDER BY id', [uid])).map(rowToAsset);
    const notes = (await all('SELECT * FROM notes WHERE userId = ? ORDER BY id', [uid])).map(rowToNote);
    res.json({ assets, learningNotes: notes, exportedAt: new Date().toISOString() });
  }));

  // ─── ALPHA VANTAGE (público) ───────────────────────────────
  app.get('/api/lookup/:ticker', h(async (req, res) => {
    res.json(await lookupTicker(req.params.ticker));
  }));

  app.get('/api/fundamentals/:ticker', h(async (req, res) => {
    res.json(await getFundamentals(req.params.ticker));
  }));

  // ─── YAHOO / MERCADO (público) ─────────────────────────────
  app.get('/api/sectors', h(async (req, res) => { res.json(await getSectors(req.query.fresh === '1')); }));
  app.get('/api/indices', h(async (req, res) => { res.json(await getIndices(req.query.fresh === '1')); }));
  app.get('/api/sentiment', h(async (req, res) => { res.json(await getSentiment(req.query.fresh === '1')); }));
  app.get('/api/macro', h(async (req, res) => { res.json(await getMacro(req.query.fresh === '1')); }));
  app.get('/api/volprofile/:symbol', h(async (req, res) => { res.json(await getVolProfile(req.params.symbol, req.query.range, req.query.anchor)); }));
  app.get('/api/smc/:symbol', h(async (req, res) => { res.json(await getSMC(req.params.symbol, req.query.range)); }));
  app.get('/api/gamma/:symbol', h(async (req, res) => { res.json(await getGamma(req.params.symbol, req.query.date)); }));
  app.get('/api/market-map', h(async (req, res) => { res.json(await getMarketMap(req.query.fresh === '1')); }));
  app.get('/api/fx', h(async (req, res) => {
    const symbols = String(req.query.symbols || '').split(',').map(s => s.trim()).filter(Boolean);
    res.json(await getFx(symbols));
  }));
  app.get('/api/risk', h(async (req, res) => {
    const symbols = String(req.query.symbols || '').split(',').map(s => s.trim()).filter(Boolean);
    res.json(await getRisk(symbols, req.query.range || '1y'));
  }));
  app.get('/api/quote/:symbol', h(async (req, res) => { res.json(await getQuote(req.params.symbol)); }));
  app.get('/api/history/:symbol', h(async (req, res) => { res.json(await getHistory(req.params.symbol, req.query.range || '6mo')); }));

  // Refresca el precio de todos los activos del usuario con Yahoo
  app.post('/api/assets/refresh-prices', h(async (req, res) => {
    const uid = readUid(req);
    const rows = await all('SELECT id, ticker, currency FROM assets WHERE userId = ?', [uid]);
    if (!rows.length) return res.json({ updated: 0, total: 0, assets: [], quotes: [] });
    const quotes = await getQuotes(rows.map(r => r.ticker));
    const byTicker = Object.fromEntries(quotes.map(q => [q.symbol, q]));
    const now = new Date().toISOString();
    let updated = 0;
    for (const r of rows) {
      const q = byTicker[r.ticker];
      if (q && q.price != null) {
        // Captura la divisa de Yahoo solo si el activo aún no la tiene fijada
        if (q.currency && !r.currency) await run('UPDATE assets SET currency = ? WHERE id = ?', [q.currency, r.id]);
        await run('UPDATE assets SET current = ?, priceUpdatedAt = ? WHERE id = ?', [q.price, now, r.id]); updated++;
      }
    }
    const assets = (await all('SELECT * FROM assets WHERE userId = ? ORDER BY id ASC', [uid])).map(rowToAsset);
    res.json({ updated, total: rows.length, at: now, assets, quotes });
  }));

  // Refresca TODOS los datos de un activo del usuario: precio + fundamentales.
  app.post('/api/assets/:id/refresh-data', h(async (req, res) => {
    const uid = readUid(req);
    const id = Number(req.params.id);
    const existing = await get('SELECT * FROM assets WHERE id = ? AND userId = ?', [id, uid]);
    if (!existing) return res.status(404).json({ error: 'Activo no encontrado' });
    const ticker = existing.ticker;

    const updates = {};
    let source = '';
    try {
      const d = await lookupTicker(ticker); // Alpha Vantage (precio + fundamentales)
      const MARKET_FIELDS = ['current', 'pe', 'fpe', 'pb', 'peg', 'evebitda', 'ps', 'eps', 'epsd', 'epsny', 'epsg', 'roe', 'roa', 'gm', 'om', 'nm', 'beta', 'w52h', 'w52l'];
      MARKET_FIELDS.forEach(k => { if (d[k] !== null && d[k] !== undefined) updates[k] = d[k]; });
      if (d.mcap) updates.mcap = d.mcap;
      if (d.name) updates.name = d.name;
      if (d.sector) updates.sector = d.sector;
      if (d.market) updates.market = d.market;
      source = 'alphavantage';
    } catch (e) {
      try {
        const q = await getQuote(ticker);
        if (q.price != null) updates.current = q.price;
        source = 'yahoo';
      } catch (e2) {
        return res.status(502).json({ error: 'No se pudieron obtener datos: ' + e.message });
      }
    }
    updates.priceUpdatedAt = new Date().toISOString();

    const cols = Object.keys(updates);
    await run(`UPDATE assets SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ? AND userId = ?`, [...cols.map(c => updates[c]), id, uid]);
    const updated = rowToAsset(await get('SELECT * FROM assets WHERE id = ?', [id]));
    res.json({ asset: updated, source });
  }));

  return app;
}
