import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmt, changePct } from '../lib/format.js';

// dir: 'hi' = más alto mejor · 'lo' = más bajo mejor · null = informativo (sin resaltar)
// label se resuelve via i18next en el componente: comparePage.rows.<key>
const ROWS = [
  { key:'current', suffix:'', dir:null, fmt:v => '$' + fmt(v) },
  { key:'chg', suffix:'%', dir:'hi', get:a => a.price > 0 ? changePct(a) : null },
  { key:'pe', suffix:'x', dir:'lo' },
  { key:'fpe', suffix:'x', dir:'lo' },
  { key:'pb', suffix:'x', dir:'lo' },
  { key:'peg', suffix:'', dir:'lo' },
  { key:'evebitda', suffix:'x', dir:'lo' },
  { key:'ps', suffix:'x', dir:'lo' },
  { key:'eps', suffix:'$', dir:'hi' },
  { key:'epsg', suffix:'%', dir:'hi' },
  { key:'roe', suffix:'%', dir:'hi' },
  { key:'roa', suffix:'%', dir:'hi' },
  { key:'gm', suffix:'%', dir:'hi' },
  { key:'om', suffix:'%', dir:'hi' },
  { key:'nm', suffix:'%', dir:'hi' },
  { key:'de', suffix:'', dir:'lo' },
  { key:'cr', suffix:'', dir:'hi' },
  { key:'qr', suffix:'', dir:'hi' },
  { key:'dy', suffix:'%', dir:'hi' },
  { key:'pr', suffix:'%', dir:null },
  { key:'beta', suffix:'', dir:'lo' },
  { key:'mcap', suffix:'', dir:null, fmt:v => v || '—' },
];

export default function Compare({ assets }) {
  const { t } = useTranslation();
  const [sel, setSel] = useState([]);
  const chosen = assets.filter(a => sel.includes(a.id));

  const toggle = (id) => setSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 3 ? prev : [...prev, id]);

  const cellValue = (a, row) => row.get ? row.get(a) : a[row.key];

  // índices ganador/perdedor por fila (solo numéricos con dirección)
  const winners = (row) => {
    if (!row.dir) return { best: -1, worst: -1 };
    const vals = chosen.map(a => { const v = cellValue(a, row); const n = parseFloat(v); return isNaN(n) ? null : n; });
    const present = vals.map((v, i) => ({ v, i })).filter(x => x.v !== null);
    if (present.length < 2) return { best: -1, worst: -1 };
    const sorted = [...present].sort((x, y) => row.dir === 'hi' ? y.v - x.v : x.v - y.v);
    return { best: sorted[0].i, worst: sorted[sorted.length - 1].i };
  };

  return (
    <div className="section active">
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'20px', marginBottom:'18px' }}>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'18px' }}>{t('comparePage.title')}</div>
        <div style={{ fontSize:'11px', color:'var(--muted)', fontFamily:"'DM Mono',monospace", marginTop:'3px', marginBottom:'14px' }}>{t('comparePage.subtitle')}</div>
        <div style={{ display:'flex', gap:'7px', flexWrap:'wrap' }}>
          {assets.map(a => (
            <button key={a.id} className={`filter-chip${sel.includes(a.id) ? ' active' : ''}`}
              disabled={!sel.includes(a.id) && sel.length >= 3}
              style={{ opacity: (!sel.includes(a.id) && sel.length >= 3) ? 0.4 : 1 }}
              onClick={() => toggle(a.id)}>
              {a.ticker}{a.type === 'watchlist' ? ' ★' : ''}
            </button>
          ))}
        </div>
      </div>

      {chosen.length < 2
        ? <div className="empty-state"><div className="empty-icon">⇄</div><div className="empty-text">{t('comparePage.chooseTwo')}</div></div>
        : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign:'left' }}>{t('comparePage.metric')}</th>
                  {chosen.map(a => (
                    <th key={a.id} style={{ textAlign:'right' }}>
                      <div style={{ color:'var(--gold)', fontSize:'13px' }}>{a.ticker}</div>
                      <div style={{ color:'var(--muted)', textTransform:'none', letterSpacing:0, fontWeight:400, fontSize:'10px' }}>{a.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(row => {
                  const { best, worst } = winners(row);
                  return (
                    <tr key={row.key}>
                      <td className="td-name" style={{ color:'var(--muted)' }}>{t('comparePage.rows.' + row.key)}</td>
                      {chosen.map((a, i) => {
                        const raw = cellValue(a, row);
                        const display = row.fmt ? row.fmt(raw) : fmt(raw, row.suffix);
                        const color = i === best ? 'var(--green)' : i === worst ? 'var(--red)' : 'var(--text)';
                        const weight = (i === best || i === worst) ? 600 : 400;
                        return <td key={a.id} style={{ textAlign:'right', color, fontWeight:weight }}>{display}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
