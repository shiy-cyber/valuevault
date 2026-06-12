import React, { useEffect, useState, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import { api } from '../lib/api.js';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const RANGES = [['3mo','3M'],['6mo','6M'],['1y','1A']];
const fmtDay = (ts) => { const d = new Date(ts); return `${d.getDate()} ${MESES[d.getMonth()]}`; };

export default function SMC({ theme, toast }) {
  const [symbol, setSymbol] = useState('AAPL');
  const [input, setInput] = useState('AAPL');
  const [range, setRange] = useState('6mo');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const isDark = theme === 'dark';

  const load = useCallback(async (sym, rg) => {
    setLoading(true);
    try { setData(await api.smc(sym, rg)); }
    catch (e) { toast?.('⚠ ' + (e.message || 'No se pudo cargar ' + sym)); setData(null); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(symbol, range); }, [symbol, range, load]);
  const analyze = () => { const s = input.trim().toUpperCase(); if (s) setSymbol(s); };

  const textColor = isDark ? '#7a8694' : '#6b7280';
  const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';
  const cardBase = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' };
  const cap = { fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' };

  // Banda sombreada (par de datasets con relleno entre ambos)
  const band = (top, bottom, color) => ([
    { label: '_t', data: data.closes.map(() => top), borderColor: 'rgba(0,0,0,0)', pointRadius: 0, fill: false },
    { label: '_b', data: data.closes.map(() => bottom), borderColor: 'rgba(0,0,0,0)', pointRadius: 0, fill: '-1', backgroundColor: color },
  ]);
  const chartData = data ? {
    labels: data.closes.map(c => fmtDay(c.t)),
    datasets: [
      { label: 'Precio', data: data.closes.map(c => c.c), borderColor: '#3a8eff', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.2, fill: false },
      ...(data.support ? band(data.support.top, data.support.bottom, 'rgba(46,204,113,.18)') : []),
      ...(data.resistance ? band(data.resistance.top, data.resistance.bottom, 'rgba(231,76,60,.18)') : []),
    ],
  } : null;
  const chartOpts = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: textColor, font: { family: 'DM Mono', size: 10 }, filter: it => it.text === 'Precio' } },
      tooltip: { filter: it => it.dataset.label === 'Precio', backgroundColor: isDark ? '#181c22' : '#fff', titleColor: textColor, bodyColor: textColor, borderColor: isDark ? '#2d3540' : '#e2e4e8', borderWidth: 1, callbacks: { label: c => '$' + c.parsed.y } },
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 }, maxTicksLimit: 12, autoSkip: true } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 10 }, callback: v => '$' + v } },
    },
  };

  const activeOB = data ? data.orderBlocks.filter(o => !o.mitigated) : [];
  const strongestOB = activeOB.length ? Math.max(...activeOB.map(o => o.strength || 0)) : null;

  const stat = (label, value, sub, color) => (
    <div style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '12px 14px' }}>
      <div style={{ fontSize: '9px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '16px', fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: '9px', color: 'var(--muted)' }}>{sub}</div>}
    </div>
  );

  const statusBadge = (z) => {
    const { label, col } = z.filled ? { label: z.kind === 'OB' ? 'mitigada' : 'llena', col: 'var(--muted)' }
      : z.mitigated ? { label: 'mitigada', col: '#e67e22' }
      : { label: 'activa', col: z.type === 'bull' ? '#2ecc71' : '#e74c3c' };
    return <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', padding: '1px 7px', borderRadius: '8px', background: col + '22', color: col }}>{label}</span>;
  };

  const strengthColor = (s) => s == null ? 'var(--muted)' : s >= 67 ? 'var(--green)' : s >= 40 ? 'var(--orange)' : 'var(--red)';

  const zoneTable = (title, zones, emptyMsg, withStrength = false) => (
    <div style={{ ...cardBase, overflowX: 'auto' }}>
      <div style={cap}>{title}</div>
      {zones.length ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'DM Mono',monospace" }}>
          <thead><tr style={{ color: 'var(--muted)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            <th style={{ textAlign: 'left', padding: '5px 6px' }}>Tipo</th><th style={{ textAlign: 'right', padding: '5px 6px' }}>Zona</th>
            {withStrength && <th style={{ textAlign: 'right', padding: '5px 6px' }}>Dist.</th>}
            {withStrength && <th style={{ textAlign: 'right', padding: '5px 6px' }}>Fuerza</th>}
            <th style={{ textAlign: 'right', padding: '5px 6px' }}>Fecha</th><th style={{ textAlign: 'right', padding: '5px 6px' }}>Estado</th>
          </tr></thead>
          <tbody>
            {[...zones].reverse().map((z, i) => {
              const mid = (z.top + z.bottom) / 2;
              const dist = data?.price ? (mid - data.price) / data.price * 100 : null;
              return (
              <tr key={i} style={{ fontSize: '11px', borderTop: '1px solid var(--border)', opacity: z.filled && !z.broken ? 0.55 : 1 }}>
                <td style={{ padding: '6px', color: z.type === 'bull' ? 'var(--green)' : 'var(--red)', whiteSpace: 'nowrap' }}>
                  {z.type === 'bull' ? '▲ alcista' : '▼ bajista'}
                  {z.broken && <span title={`Breaker: roto, ahora actúa como ${z.role}`} style={{ marginLeft: '5px', fontSize: '9px', padding: '0 5px', borderRadius: '8px', background: 'rgba(155,89,182,.25)', color: '#b07bd0' }}>⇄ {z.role}</span>}
                </td>
                <td style={{ padding: '6px', textAlign: 'right' }}>${z.bottom}–${z.top}</td>
                {withStrength && (
                  <td style={{ padding: '6px', textAlign: 'right', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {dist == null ? '—' : `${dist >= 0 ? '↑' : '↓'} ${Math.abs(dist).toFixed(1)}%`}
                  </td>
                )}
                {withStrength && (
                  <td style={{ padding: '6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ color: strengthColor(z.strength), fontWeight: 700 }} title={`Convicción ${z.strengthLabel}`}>{z.strength ?? '—'}</span>
                    {z.highVolume && <span title={`Volumen del impulso ${z.volRatio}× la media`} style={{ marginLeft: '5px', color: 'var(--gold)', fontSize: '10px' }}>⚡{z.volRatio}×</span>}
                  </td>
                )}
                <td style={{ padding: '6px', textAlign: 'right', color: 'var(--muted)' }}>{fmtDay(z.t)}</td>
                <td style={{ padding: '6px', textAlign: 'right' }}>{statusBadge(z)}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      ) : <div style={{ color: 'var(--muted)', fontSize: '11px' }}>{emptyMsg}</div>}
    </div>
  );

  return (
    <div className="section active">
      <div style={{ ...cardBase, borderLeft: '4px solid var(--gold)', marginBottom: '18px' }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '16px', marginBottom: '6px' }}>Estructura de Mercado · Smart Money <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--gold)', border: '1px solid rgba(201,168,76,.3)', padding: '1px 7px', borderRadius: '10px', verticalAlign: 'middle' }}>EXPERIMENTAL</span></div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.7 }}>Detecta <b>Fair Value Gaps</b> (huecos de ineficiencia que el precio tiende a rellenar) y <b>Order Blocks</b> (última vela opuesta antes de un impulso). Son conceptos heurísticos y subjetivos — úsalos como zonas de interés, no como señales. Las bandas verde/roja marcan el soporte/resistencia no mitigado más cercano.</div>
      </div>

      {/* Controles */}
      <div style={{ ...cardBase, marginBottom: '18px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '160px' }}>
            <label style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>Ticker</label>
            <input value={input} onChange={e => setInput(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && analyze()} placeholder="AAPL, MSFT…" style={{ width: '100%', marginTop: '4px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 10px', color: 'var(--text)', fontFamily: "'DM Mono',monospace", fontSize: '15px' }} />
          </div>
          <button className="btn btn-gold" onClick={analyze} disabled={loading}>{loading ? '⏳' : 'Analizar'}</button>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{RANGES.map(([k, l]) => <button key={k} className={`filter-chip${range === k ? ' active' : ''}`} onClick={() => setRange(k)}>{l}</button>)}</div>
        </div>
      </div>

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: '10px', marginBottom: '18px' }}>
            {stat('Precio', '$' + data.price, data.symbol)}
            {stat('Soporte cercano', data.support ? `$${data.support.bottom}–${data.support.top}` : '—', data.support ? data.support.kind : 'sin zona', '#2ecc71')}
            {stat('Resistencia cercana', data.resistance ? `$${data.resistance.bottom}–${data.resistance.top}` : '—', data.resistance ? data.resistance.kind : 'sin zona', '#e74c3c')}
            {stat('FVG activas', String(data.counts.fvgUnfilled), 'sin rellenar', '#c9a84c')}
            {stat('Order Blocks activos', String(data.counts.obUnmitigated), 'sin mitigar', '#c9a84c')}
            {strongestOB != null && stat('OB más fuerte', String(strongestOB), 'fuerza 0-100', strengthColor(strongestOB))}
          </div>

          <div style={{ ...cardBase, marginBottom: '18px' }}>
            <div style={{ ...cap, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span>Precio + zonas clave</span>
              <span style={{ textTransform: 'none', letterSpacing: 0 }}><span style={{ color: '#2ecc71' }}>■</span> soporte · <span style={{ color: '#e74c3c' }}>■</span> resistencia</span>
            </div>
            <div style={{ position: 'relative', height: '360px' }}>{!loading && chartData && <Line data={chartData} options={chartOpts} />}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: '16px' }}>
            {zoneTable('Fair Value Gaps', data.fvgs, 'No se detectaron FVG en el rango.')}
            {zoneTable('Order Blocks · fuerza + volumen', data.orderBlocks, 'No se detectaron Order Blocks en el rango.', true)}
          </div>
        </>
      )}

      {loading && <div style={{ ...cardBase, textAlign: 'center', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", fontSize: '12px', padding: '40px' }}>⏳ Analizando {symbol}…</div>}
      {!loading && !data && <div style={{ ...cardBase, textAlign: 'center', color: 'var(--muted)', fontSize: '12px', padding: '40px' }}>No se pudieron cargar datos para <b>{symbol}</b>. Prueba con el símbolo exacto.</div>}

      <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--surface2)', borderRadius: '8px', borderLeft: '3px solid var(--gold)', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.7 }}>
        ⚡ Detección algorítmica sobre velas diarias (Yahoo). "Mitigada" = el precio volvió a tocar la zona; "llena/activa" según si la rellenó o sigue intacta. La <b>fuerza (0-100)</b> de cada Order Block combina volumen del impulso vs su media (40%), tamaño del impulso (30%) y desplazamiento posterior (30%); el rayo ⚡ marca impulsos con volumen ≥1,5× la media. <b>Dist.</b> = % desde el precio actual hasta la zona (↑ por encima, ↓ por debajo). Una etiqueta <span style={{ color: '#b07bd0' }}>⇄ breaker</span> indica un OB roto (el precio cerró atravesándolo), que invierte su papel: un OB alcista roto pasa a actuar como resistencia y viceversa. Metodología discutida y no estandarizada — herramienta de análisis exploratorio, no asesoramiento de inversión.
      </div>
    </div>
  );
}
