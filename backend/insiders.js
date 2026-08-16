// ─────────────────────────────────────────────────────────────
// Transacciones de insiders (Alpha Vantage INSIDER_TRANSACTIONS, JSON).
// "Smart money": ¿los directivos compran o venden sus propias acciones?
// Bajo demanda (no en /quality): su propio endpoint + botón. Cacheado vía
// avCache (TTL 7d por defecto). acquisition_or_disposal: A=compra, D=venta.
//
// SIN respaldo Financial Modeling Prep (comprobado, no al descuido): su
// endpoint (`insider-trading/search`) da "Restricted Endpoint" en el plan
// gratis — no hay forma real de cubrir este hueco sin pasar a un plan de
// pago. Si AV falla o no tiene el ticker, esta función simplemente no
// devuelve datos (como ya pasaba antes).
// ─────────────────────────────────────────────────────────────
import { avQuery } from './avCache.js';

export async function getInsiderTransactions(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return null;

  const { data, stale, fetchedAt } = await avQuery('INSIDER_TRANSACTIONS', sym);
  const rows = Array.isArray(data?.data) ? data.data : [];
  const fnum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

  const tx = rows.slice(0, 10).map(r => {
    const buy = String(r.acquisition_or_disposal || '').toUpperCase() === 'A';
    const shares = fnum(r.shares);
    const price = fnum(r.share_price);
    return {
      date: r.transaction_date || null,
      who: r.executive || null,
      title: r.executive_title || null,
      buy,
      shares,
      price,
      value: (shares != null && price != null) ? Math.round(shares * price) : null,
    };
  }).filter(t => t.date);

  if (!tx.length) return null;
  const buys = tx.filter(t => t.buy).length;
  return { tx, buys, sells: tx.length - buys, stale: !!stale, fetchedAt };
}
