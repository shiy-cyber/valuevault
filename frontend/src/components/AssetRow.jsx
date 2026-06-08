import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { api } from '../lib/api.js';
import { fmt, getRiskW, riskLabel, riskColor, mvColor, tagList, changePct, insiderLinks, timeAgo } from '../lib/format.js';

function MV({ label, val, suffix = '', good, warn }) {
  const v = parseFloat(val);
  const empty = val === null || val === undefined || val === '' || isNaN(v);
  const display = empty ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + suffix;
  return (
    <div className="mv-item">
      <div className="mv-label">{label}</div>
      <div className="mv-val" style={{ color: mvColor(val, good, warn) }}>{display}</div>
    </div>
  );
}

const RANGES = [['1mo','1M'],['6mo','6M'],['1y','1A'],['5y','5A']];

// Gráfico histórico de precio (carga perezosa)
function PriceHistory({ ticker, theme }) {
  const [range, setRange] = useState('6mo');
  const [points, setPoints] = useState(null);
  const [err, setErr] = useState(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    let alive = true;
    setPoints(null); setErr(null);
    api.history(ticker, range)
      .then(d => { if (alive) setPoints(d.points || []); })
      .catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [ticker, range]);

  const textColor = isDark ? '#7a8694' : '#6b7280';
  const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';
  const up = points && points.length > 1 && points.at(-1).close >= points[0].close;
  const color = up ? '#2ecc71' : '#e74c3c';

  const data = points && {
    labels: points.map(p => new Date(p.t).toISOString().slice(0, 10)),
    datasets: [{ data: points.map(p => p.close), borderColor: color, backgroundColor: color + '18', borderWidth: 2, pointRadius: 0, tension: 0.25, fill: true }],
  };
  const opts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, backgroundColor: isDark ? '#181c22' : '#fff', titleColor: textColor, bodyColor: textColor, borderColor: isDark ? '#2d3540' : '#e2e4e8', borderWidth: 1, callbacks: { label: c => '$' + c.parsed.y } } },
    scales: {
      x: { type: 'category', grid: { display: false }, ticks: { color: textColor, font: { family: 'DM Mono', size: 8 }, maxTicksLimit: 6, callback(i) { const v = this.getLabelForValue(i); return typeof v === 'string' ? v.slice(0, 7) : v; } } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 }, callback: v => '$' + v } },
    },
  };

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
        <div className="mv-section-label" style={{ margin: 0 }}>Evolución de Precio</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {RANGES.map(([k, l]) => (
            <button key={k} className={`filter-chip${range === k ? ' active' : ''}`} style={{ padding: '2px 9px', fontSize: '10px' }} onClick={() => setRange(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ position: 'relative', height: '160px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px' }}>
        {err ? <div style={{ color: 'var(--muted)', fontSize: '11px', textAlign: 'center', paddingTop: '60px' }}>Sin histórico disponible</div>
          : !points ? <div style={{ color: 'var(--muted)', fontSize: '11px', textAlign: 'center', paddingTop: '60px' }}>Cargando…</div>
          : <Line data={data} options={opts} />}
      </div>
    </div>
  );
}

// Fila expandible de activo (usada en Dashboard, Mis Activos y Watchlist)
export default function AssetRow({ a, noteCount, theme, onNotes, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const chg = changePct(a).toFixed(2);
  const isPos = chg >= 0;
  const live = timeAgo(a.priceUpdatedAt);

  return (
    <div className="asset-row">
      <div className="arow-head" onClick={() => setOpen(o => !o)}>
        <div className="arow-left">
          <div className="arow-arrow" style={{ transform: open ? 'rotate(90deg)' : 'none', color: open ? 'var(--gold)' : 'var(--muted)' }}>▶</div>
          <div>
            <div className="arow-ticker">{a.ticker}{a.type === 'watchlist' && <span title="En seguimiento" style={{ color: 'var(--gold)', fontSize: '11px', marginLeft: '5px' }}>★</span>}</div>
            <div className="arow-name">{a.name}</div>
          </div>
        </div>
        <div className="arow-mid">
          <div className="arow-price">${fmt(a.current)}{live && <span title={`Precio actualizado ${live}`} style={{ color: 'var(--green)', fontSize: '8px', marginLeft: '4px', verticalAlign: 'middle' }}>●</span>}</div>
          <div className="arow-chg" style={{ color: isPos ? 'var(--green)' : 'var(--red)' }}>{isPos ? '+' : ''}{chg}%</div>
        </div>
        <div className="arow-tags">
          {tagList(a.strategies, a.time).map((t, i) => <span key={i} className={`tag ${t.cls}`}>{t.label}</span>)}
        </div>
        <div className="arow-risk">
          <div className="arow-risk-bar"><div style={{ height:'100%', borderRadius:'2px', width:`${getRiskW(a.risk)}%`, background: riskColor(a.risk) }} /></div>
          <div className="arow-risk-label">{riskLabel(a.risk)}</div>
        </div>
        <div className="arow-actions" onClick={(e) => e.stopPropagation()}>
          <button className="card-btn notes-btn" style={{ padding:'5px 9px', fontSize:'10px' }} onClick={() => onNotes(a.id)}>📝{noteCount > 0 ? ' ' + noteCount : ''}</button>
          <button className="card-btn" style={{ padding:'5px 9px', fontSize:'10px' }} onClick={() => onEdit(a)}>✏️</button>
          <button className="card-btn del" style={{ padding:'5px 9px', fontSize:'10px' }} onClick={() => onDelete(a)}>🗑</button>
        </div>
      </div>

      {open && (
        <div className="arow-panel">
          <PriceHistory ticker={a.ticker} theme={theme} />

          <div className="mv-section-label">Valoración</div>
          <div className="mv-grid">
            <MV label="P/E" val={a.pe} suffix="x" /><MV label="Fwd P/E" val={a.fpe} suffix="x" /><MV label="P/B" val={a.pb} suffix="x" />
            <MV label="PEG" val={a.peg} /><MV label="EV/EBITDA" val={a.evebitda} suffix="x" /><MV label="P/Sales" val={a.ps} suffix="x" />
          </div>

          <div className="mv-section-label">EPS</div>
          <div className="mv-grid">
            <MV label="EPS" val={a.eps} suffix="$" /><MV label="EPS Diluted" val={a.epsd} suffix="$" /><MV label="EPS Next Y" val={a.epsny} suffix="$" />
            <MV label="EPS Gr.5Y" val={a.epsg} suffix="%" good={10} warn={5} />
          </div>

          <div className="mv-section-label">Calidad del Negocio</div>
          <div className="mv-grid">
            <MV label="ROE" val={a.roe} suffix="%" good={15} warn={8} /><MV label="ROA" val={a.roa} suffix="%" good={10} warn={5} /><MV label="Gross Mg." val={a.gm} suffix="%" good={40} warn={20} />
            <MV label="Mg.Operativo" val={a.om} suffix="%" good={20} warn={10} /><MV label="Mg.Neto" val={a.nm} suffix="%" good={15} warn={8} />
          </div>

          <div className="mv-section-label">Solidez Financiera</div>
          <div className="mv-grid">
            <MV label="Deuda/Equity" val={a.de} /><MV label="Current Ratio" val={a.cr} good={1.5} warn={1} /><MV label="Quick Ratio" val={a.qr} good={1} warn={0.7} />
          </div>

          <div className="mv-section-label">Dividendo</div>
          <div className="mv-grid">
            <MV label="Div. Yield" val={a.dy} suffix="%" good={3} warn={1} /><MV label="Payout Ratio" val={a.pr} suffix="%" />
          </div>

          <div className="mv-section-label">Mercado</div>
          <div className="mv-grid">
            <MV label="Beta" val={a.beta} /><MV label="52W High" val={a.w52h} suffix="$" /><MV label="52W Low" val={a.w52l} suffix="$" />
            <div className="mv-item"><div className="mv-label">Mkt Cap</div><div className="mv-val">{a.mcap || '—'}</div></div>
          </div>

          <div className="mv-section-label">Tesis de Inversión</div>
          <div style={{ fontSize:'12px', color:'var(--muted)', lineHeight:1.7, padding:'12px', background:'var(--surface)', borderRadius:'8px', borderLeft:'3px solid var(--gold)', marginBottom:'12px' }}>
            {a.thesis || 'Sin tesis registrada.'}
          </div>

          <div className="mv-section-label">Insiders & Institucionales</div>
          <div style={{ display:'flex', gap:'7px', flexWrap:'wrap' }}>
            {insiderLinks(a.ticker).map((l, i) => <a key={i} className="insider-link" href={l.url} target="_blank" rel="noreferrer">{l.label}</a>)}
          </div>
        </div>
      )}
    </div>
  );
}
