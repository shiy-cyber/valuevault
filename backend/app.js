// ─────────────────────────────────────────────────────────────
// ValueVault — app Express reutilizable (local + serverless).
// createApp() devuelve la app con el esquema/semilla ya listos.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import cors from 'cors';
import { ready, all, get, run, rowToAsset, rowToNote, ASSET_NUM, ASSET_TXT, ASSET_JSON } from './db.js';
import { lookupTicker } from './alphavantage.js';
import { getSectors, getQuote, getQuotes, getHistory } from './sectors.js';

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

export async function createApp() {
  await ready(); // esquema + semilla (idempotente, una vez por instancia)

  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
  app.use(express.json({ limit: '1mb' }));

  // ─── Salud ─────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  // ─── ASSETS ────────────────────────────────────────────────
  app.get('/api/assets', h(async (_req, res) => {
    const rows = await all('SELECT * FROM assets ORDER BY id ASC');
    res.json(rows.map(rowToAsset));
  }));

  app.post('/api/assets', h(async (req, res) => {
    const row = assetRowFromBody(req.body);
    const args = ALL_COLS.map(c => row[c]);
    const info = await run(
      `INSERT INTO assets (${ALL_COLS.join(', ')}) VALUES (${ALL_COLS.map(() => '?').join(', ')})`,
      args
    );
    const created = await get('SELECT * FROM assets WHERE id = ?', [info.lastInsertRowid]);
    res.status(201).json(rowToAsset(created));
  }));

  app.put('/api/assets/:id', h(async (req, res) => {
    const id = Number(req.params.id);
    const exists = await get('SELECT id FROM assets WHERE id = ?', [id]);
    if (!exists) return res.status(404).json({ error: 'Activo no encontrado' });
    const row = assetRowFromBody(req.body);
    const args = ALL_COLS.map(c => row[c]);
    args.push(id);
    await run(`UPDATE assets SET ${ALL_COLS.map(c => `${c} = ?`).join(', ')} WHERE id = ?`, args);
    const updated = await get('SELECT * FROM assets WHERE id = ?', [id]);
    res.json(rowToAsset(updated));
  }));

  app.delete('/api/assets/:id', h(async (req, res) => {
    const id = Number(req.params.id);
    await run('UPDATE notes SET assetId = NULL WHERE assetId = ?', [id]);
    const info = await run('DELETE FROM assets WHERE id = ?', [id]);
    if (!info.changes) return res.status(404).json({ error: 'Activo no encontrado' });
    res.json({ ok: true });
  }));

  // ─── NOTES ─────────────────────────────────────────────────
  app.get('/api/notes', h(async (_req, res) => {
    const rows = await all('SELECT * FROM notes ORDER BY id DESC');
    res.json(rows.map(rowToNote));
  }));

  app.post('/api/notes', h(async (req, res) => {
    const b = req.body;
    if (!b.title || !b.content) return res.status(400).json({ error: 'Falta título o contenido' });
    const info = await run(
      `INSERT INTO notes (title, topic, source, content, tags, date, assetId) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [String(b.title), b.topic || 'value', b.source || '', String(b.content),
       JSON.stringify(Array.isArray(b.tags) ? b.tags : []),
       b.date || new Date().toISOString().slice(0, 10),
       b.assetId ? Number(b.assetId) : null]
    );
    const created = await get('SELECT * FROM notes WHERE id = ?', [info.lastInsertRowid]);
    res.status(201).json(rowToNote(created));
  }));

  app.delete('/api/notes/:id', h(async (req, res) => {
    const info = await run('DELETE FROM notes WHERE id = ?', [Number(req.params.id)]);
    if (!info.changes) return res.status(404).json({ error: 'Nota no encontrada' });
    res.json({ ok: true });
  }));

  // ─── CONFIG ────────────────────────────────────────────────
  app.get('/api/config', h(async (_req, res) => {
    const rows = await all('SELECT key, value FROM config');
    res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
  }));

  app.put('/api/config/:key', h(async (req, res) => {
    await run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', [req.params.key, String(req.body.value ?? '')]);
    res.json({ ok: true });
  }));

  // ─── EXPORT ────────────────────────────────────────────────
  app.get('/api/export', h(async (_req, res) => {
    const assets = (await all('SELECT * FROM assets ORDER BY id')).map(rowToAsset);
    const notes = (await all('SELECT * FROM notes ORDER BY id')).map(rowToNote);
    res.json({ assets, learningNotes: notes, exportedAt: new Date().toISOString() });
  }));

  // ─── ALPHA VANTAGE ─────────────────────────────────────────
  app.get('/api/lookup/:ticker', h(async (req, res) => {
    res.json(await lookupTicker(req.params.ticker));
  }));

  // ─── YAHOO FINANCE ─────────────────────────────────────────
  app.get('/api/sectors', h(async (_req, res) => { res.json(await getSectors()); }));
  app.get('/api/quote/:symbol', h(async (req, res) => { res.json(await getQuote(req.params.symbol)); }));
  app.get('/api/history/:symbol', h(async (req, res) => { res.json(await getHistory(req.params.symbol, req.query.range || '6mo')); }));

  // Refresca el precio de todos los activos con Yahoo
  app.post('/api/assets/refresh-prices', h(async (_req, res) => {
    const rows = await all('SELECT id, ticker FROM assets');
    if (!rows.length) return res.json({ updated: 0, total: 0, assets: [], quotes: [] });
    const quotes = await getQuotes(rows.map(r => r.ticker));
    const byTicker = Object.fromEntries(quotes.map(q => [q.symbol, q]));
    const now = new Date().toISOString();
    let updated = 0;
    for (const r of rows) {
      const q = byTicker[r.ticker];
      if (q && q.price != null) { await run('UPDATE assets SET current = ?, priceUpdatedAt = ? WHERE id = ?', [q.price, now, r.id]); updated++; }
    }
    const assets = (await all('SELECT * FROM assets ORDER BY id ASC')).map(rowToAsset);
    res.json({ updated, total: rows.length, at: now, assets, quotes });
  }));

  return app;
}
