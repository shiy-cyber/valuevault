import React, { useEffect, useState, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { api } from '../lib/api.js';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const PERIODS = [['1m','1 Mes'],['3m','3 Meses'],['6m','6 Meses'],['ytd','YTD'],['1y','1 Año'],['3y','3 Años'],['5y','5 Años'],['10y','10 Años'],['20y','20 Años']];
const REGIONS = ['USA', 'Europa', 'Asia'];
// Periodos intra-mes (puntos diarios) → etiqueta "12 May"; el resto → "May '25".
const INTRADAY = new Set(['1m', '3m', '6m', 'ytd']);

const lastVal = (s, p) => s[p][s[p].length - 1];

const fmtLabel = (ts, period) => {
  const d = new Date(ts);
  const mes = MESES[d.getMonth()];
  if (INTRADAY.has(period)) return `${d.getDate()} ${mes}`;
  return `${mes} '${String(d.getFullYear()).slice(2)}`;
};

export default function Indices({ theme, toast }) {
  const [indices, setIndices] = useState([]);
  const [period, setPeriod] = useState('1m');
  const [active, setActive] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const isDark = theme === 'dark';

  useEffect(() => {
    let alive = true;
    api.indices()
      .then(data => {
        if (!alive) return;
        setIndices(data);
        setActive(new Set(data.map(s => s.name)));
        setLoading(false);
        if (data.some(s => s.live === false)) toast?.('⚠ Algún índice usa datos de respaldo');
      })
      .catch(e => { if (alive) { setLoading(false); toast?.('⚠ No se pudieron cargar los índices: ' + e.message); } });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const textColor = isDark ? '#7a8694' : '#6b7280';
  const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';

  const toggleIndex = (name) => {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(name)) { if (next.size <= 1) return prev; next.delete(name); }
      else next.add(name);
      return next;
    });
  };

  const tsLabels = indices[0]?.labels?.[period] || [];
  const xLabels = tsLabels.map(ts => fmtLabel(ts, period));

  const lineData = {
    labels: xLabels,
    datasets: indices.filter(s => active.has(s.name)).map(s => ({
      label: s.name, data: s[period], borderColor: s.color, backgroundColor: s.color + '18',
      borderWidth: 2, pointRadius: 2, pointHoverRadius: 5, tension: 0.4, fill: false,
    })),
  };
  const lineOpts = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { color: textColor, font: { family: 'DM Mono', size: 10 }, boxWidth: 10, padding: 12 } },
      tooltip: { backgroundColor: isDark ? '#181c22' : '#fff', titleColor: textColor, bodyColor: textColor, borderColor: isDark ? '#2d3540' : '#e2e4e8', borderWidth: 1, callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y >= 0 ? '+' : ''}${c.parsed.y.toFixed(2)}%` } },
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 10 } } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 10 }, callback: v => v + '%' } },
    },
  };

  const byRegion = useMemo(() => REGIONS.map(r => ({
    region: r,
    items: [...indices.filter(s => s.region === r)].sort((a, b) => lastVal(b, period) - lastVal(a, period)),
  })).filter(g => g.items.length), [indices, period]);

  const signal = (v) => v > 5 ? '🔥 Fuerte alza' : v > 2 ? '📈 Alcista' : v > 0 ? '➡️ Neutro+' : v > -2 ? '➡️ Neutro-' : v > -5 ? '📉 Bajista' : '❄️ Fuerte baja';

  return (
    <div className="section active">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'18px', flexWrap:'wrap', gap:'10px' }}>
        <div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'16px', marginBottom:'3px' }}>Índices Bursátiles Principales</div>
          <div style={{ fontSize:'11px', color:'var(--muted)', fontFamily:"'DM Mono',monospace" }}>
            Variación diaria y rendimiento acumulado · {loading ? 'cargando…' : 'datos Yahoo Finance en vivo'}
          </div>
        </div>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          {PERIODS.map(([k, l]) => (
            <button key={k} className={`filter-chip${period === k ? ' active' : ''}`} onClick={() => setPeriod(k)}>{l}</button>
          ))}
        </div>
      </div>

      {/* CARDS POR REGIÓN */}
      {byRegion.map(group => (
        <div key={group.region} style={{ marginBottom:'18px' }}>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'10px' }}>{group.region}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:'10px' }}>
            {group.items.map(s => {
              const v = lastVal(s, period); const pos = v >= 0;
              const dv = s.changePercent; const dpos = dv >= 0;
              return (
                <div key={s.symbol} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'16px', transition:'all .2s' }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = s.color; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px var(--shadow)'; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
                      <span style={{ fontSize:'18px' }}>{s.icon}</span>
                      <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'12px', color:'var(--text)', fontWeight:600 }}>{s.name}</span>
                    </div>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', padding:'2px 7px', borderRadius:'10px', background: dpos ? 'rgba(46,204,113,.15)' : 'rgba(231,76,60,.15)', color: dpos ? 'var(--green)' : 'var(--red)' }}>{dpos ? '▲' : '▼'} {dpos ? '+' : ''}{dv.toFixed(2)}%</span>
                  </div>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'20px', fontWeight:700, color:'var(--text)' }}>
                    {s.price != null ? s.price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                    {s.currency && s.price != null ? <span style={{ fontSize:'10px', color:'var(--muted)', marginLeft:'5px' }}>{s.currency}</span> : null}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'8px', paddingTop:'8px', borderTop:'1px solid var(--border)' }}>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)' }}>{PERIODS.find(p => p[0] === period)[1]}</span>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'13px', fontWeight:700, color: pos ? 'var(--green)' : 'var(--red)' }}>{pos ? '+' : ''}{v.toFixed(2)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* LINE — RENDIMIENTO ACUMULADO */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'20px', marginBottom:'18px' }}>
        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'6px' }}>Rendimiento Acumulado Comparado</div>
        <div style={{ fontSize:'11px', color:'var(--muted)', marginBottom:'14px' }}>Rendimiento % acumulado en el periodo — selecciona índices</div>
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'16px' }}>
          {indices.map(s => {
            const on = active.has(s.name);
            return (
              <button key={s.name} onClick={() => toggleIndex(s.name)}
                style={{ padding:'4px 10px', borderRadius:'20px', fontSize:'10px', fontFamily:"'DM Mono',monospace", cursor:'pointer', border:`1px solid ${s.color}`, background: on ? s.color + '33' : 'transparent', color: on ? s.color : 'var(--muted)', transition:'all .15s' }}>
                {s.name}
              </button>
            );
          })}
        </div>
        <div style={{ position:'relative', height:'320px' }}>{!loading && <Line data={lineData} options={lineOpts} />}</div>
      </div>

      {/* TABLE */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', overflow:'hidden' }}>
        <div style={{ padding:'16px 18px', borderBottom:'1px solid var(--border)', fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase' }}>Detalle por Índice</div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--surface2)' }}>
                {['Índice','Región','Último','Día %',`${PERIODS.find(p => p[0] === period)[1]} %`,'Señal','Ver'].map((th, i) => (
                  <th key={i} style={{ padding:'10px 14px', fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'1px', textAlign: i >= 2 && i <= 4 ? 'right' : (i >= 5 ? 'center' : 'left') }}>{th}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byRegion.flatMap(g => g.items).map((s, i) => {
                const v = lastVal(s, period); const pos = v >= 0;
                const dpos = s.changePercent >= 0;
                return (
                  <tr key={s.symbol} style={{ background: i % 2 === 0 ? '' : 'var(--surface2)' }}>
                    <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace", fontSize:'13px' }}><span style={{ marginRight:'6px' }}>{s.icon}</span><span style={{ color:'var(--text)' }}>{s.name}</span></td>
                    <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace", fontSize:'11px', color:'var(--muted)' }}>{s.region}</td>
                    <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace", fontSize:'13px', textAlign:'right', color:'var(--text)' }}>{s.price != null ? s.price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                    <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace", fontSize:'13px', textAlign:'right', fontWeight:600, color: dpos ? 'var(--green)' : 'var(--red)' }}>{dpos ? '+' : ''}{s.changePercent.toFixed(2)}%</td>
                    <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace", fontSize:'13px', textAlign:'right', fontWeight:600, color: pos ? 'var(--green)' : 'var(--red)' }}>{pos ? '+' : ''}{v.toFixed(2)}%</td>
                    <td style={{ padding:'12px 14px', fontSize:'12px', textAlign:'right' }}>{signal(v)}</td>
                    <td style={{ padding:'12px 14px', textAlign:'center' }}><a href={`https://finance.yahoo.com/quote/${encodeURIComponent(s.symbol)}`} target="_blank" rel="noreferrer" className="insider-link" style={{ fontSize:'10px' }}>↗</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop:'14px', padding:'12px 16px', background:'var(--surface2)', borderRadius:'8px', borderLeft:'3px solid var(--gold)', fontSize:'11px', color:'var(--muted)', lineHeight:1.7 }}>
        ⚡ Cotizaciones en tiempo real de los principales índices mundiales vía Yahoo Finance. La variación diaria compara el último cierre con el anterior; el rendimiento acumulado parte del inicio del periodo seleccionado.
      </div>
    </div>
  );
}
