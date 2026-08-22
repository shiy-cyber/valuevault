import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Line, Bar } from 'react-chartjs-2';
import { api } from '../lib/api.js';

const PERIOD_KEYS = ['1m','3m','6m','ytd','1y','3y','5y','10y'];
// Periodos intra-mes (puntos diarios) → etiqueta "12 May"; el resto → "May '25".
const INTRADAY = new Set(['1m', '3m', '6m', 'ytd']);

// Null-safe: si el backend cae al fallback (serie vacía/ausente para ese
// periodo), evita romper toda la página con un TypeError sobre undefined.
const lastVal = (s, p) => {
  const arr = s?.[p];
  return Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null;
};
const fmtPct = (v, digits = 2) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%` : '—';

export default function Trends({ theme, toast }) {
  const { t } = useTranslation();
  const months = t('macroPage.months', { returnObjects: true });
  const PERIODS = PERIOD_KEYS.map(k => [k, t('trendsPage.periods.' + k)]);
  const fmtLabel = (ts, period) => {
    const d = new Date(ts);
    const mes = months[d.getMonth()];
    if (INTRADAY.has(period)) return `${d.getDate()} ${mes}`;
    return `${mes} '${String(d.getFullYear()).slice(2)}`;
  };
  const [sectors, setSectors] = useState([]);
  const [period, setPeriod] = useState('1m');
  const [active, setActive] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const isDark = theme === 'dark';

  // fresh=true salta la caché de 10 min del backend y conserva la selección
  const load = useCallback(async (fresh) => {
    if (fresh) setRefreshing(true);
    try {
      const data = await api.sectors(fresh);
      setSectors(data);
      setActive(prev => prev.size ? prev : new Set(data.map(s => s.name)));
      setUpdatedAt(new Date());
      if (data.some(s => s.live === false)) toast?.(t('trendsPage.someFallback'));
      else if (fresh) toast?.(t('trendsPage.sectorsUpdated'));
    } catch (e) {
      toast?.(t('trendsPage.couldNotLoadSectors', { message: e.message }));
    } finally { setLoading(false); setRefreshing(false); }
  }, [toast, t]);

  useEffect(() => { load(false); }, [load]);

  const sorted = useMemo(() => [...sectors].sort((a, b) => (lastVal(b, period) ?? -Infinity) - (lastVal(a, period) ?? -Infinity)), [sectors, period]);

  const textColor = isDark ? '#7a8694' : '#6b7280';
  const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';

  const toggleSector = (name) => {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };
  const selectAll = () => setActive(new Set(sectors.map(s => s.name)));
  const clearAll = () => setActive(new Set());
  const allOn = sectors.length > 0 && active.size === sectors.length;

  // Fechas reales de los 12 puntos (vienen del backend); si faltan, eje vacío
  const tsLabels = sectors[0]?.labels?.[period] || [];
  const xLabels = tsLabels.map(ts => fmtLabel(ts, period));

  const lineData = {
    labels: xLabels,
    datasets: sectors.filter(s => active.has(s.name)).map(s => ({
      label: s.name, data: s[period], borderColor: s.color, backgroundColor: s.color + '18',
      borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, tension: 0.4, fill: false,
    })),
  };
  const lineOpts = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { color: textColor, font: { family: 'DM Mono', size: 10 }, boxWidth: 10, padding: 12 } },
      tooltip: { backgroundColor: isDark ? '#181c22' : '#fff', titleColor: textColor, bodyColor: textColor, borderColor: isDark ? '#2d3540' : '#e2e4e8', borderWidth: 1 },
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 10 } } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 10 }, callback: v => v + '%' } },
    },
  };

  const barData = {
    labels: sorted.map(s => s.name),
    datasets: [{
      data: sorted.map(s => lastVal(s, period) ?? 0),
      backgroundColor: sorted.map(s => (lastVal(s, period) ?? 0) >= 0 ? 'rgba(46,204,113,.7)' : 'rgba(231,76,60,.7)'),
      borderColor: sorted.map(s => (lastVal(s, period) ?? 0) >= 0 ? '#2ecc71' : '#e74c3c'),
      borderWidth: 1, borderRadius: 5,
    }],
  };
  const barOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.y.toFixed(2) + '%' }, backgroundColor: isDark ? '#181c22' : '#fff', titleColor: textColor, bodyColor: textColor, borderColor: isDark ? '#2d3540' : '#e2e4e8', borderWidth: 1 } },
    scales: {
      x: { grid: { display: false }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 } } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 10 }, callback: v => v + '%' } },
    },
  };

  const signal = (v) => v > 5 ? t('trendsPage.signal.strongUp') : v > 2 ? t('trendsPage.signal.bullish') : v > 0 ? t('trendsPage.signal.neutralPos') : v > -2 ? t('trendsPage.signal.neutralNeg') : v > -5 ? t('trendsPage.signal.bearish') : t('trendsPage.signal.strongDown');

  const thStyle = { padding:'10px 14px', fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'1px' };

  return (
    <div className="section active">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'18px', flexWrap:'wrap', gap:'10px' }}>
        <div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'16px', marginBottom:'3px' }}>{t('trendsPage.title')}</div>
          <div style={{ fontSize:'11px', color:'var(--muted)', fontFamily:"'DM Mono',monospace" }}>
            {t('trendsPage.subtitle')} · {loading ? t('marketPulse.loading') : t('trendsPage.liveData')}
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'10px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            {updatedAt && <span style={{ fontSize:'10px', color:'var(--muted)', fontFamily:"'DM Mono',monospace" }}>↻ {updatedAt.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })}</span>}
            <button className="btn btn-outline" onClick={() => load(true)} disabled={refreshing || loading}>{refreshing ? t('macroPage.updating') : t('macroPage.update')}</button>
          </div>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', justifyContent:'flex-end' }}>
            {PERIODS.map(([k, l]) => (
              <button key={k} className={`filter-chip${period === k ? ' active' : ''}`} onClick={() => setPeriod(k)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* HEATMAP */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'20px', marginBottom:'18px' }}>
        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'14px' }}>{t('trendsPage.heatmapTitle')}</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:'8px' }}>
          {sorted.map(s => {
            const v = lastVal(s, period); const pos = v != null && v >= 0; const intensity = v != null ? Math.min(Math.abs(v) / 20, 1) : 0;
            const bg = pos ? `rgba(46,204,113,${0.1 + intensity * 0.4})` : `rgba(231,76,60,${0.1 + intensity * 0.4})`;
            const border = pos ? 'rgba(46,204,113,.4)' : 'rgba(231,76,60,.4)';
            return (
              <div key={s.etf} style={{ background:bg, border:`1px solid ${border}`, borderRadius:'10px', padding:'14px 12px', textAlign:'center', transition:'transform .2s' }}
                onMouseOver={e => e.currentTarget.style.transform = 'scale(1.04)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
                <div style={{ fontSize:'20px', marginBottom:'5px' }}>{s.icon}</div>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--text)', fontWeight:500, marginBottom:'3px' }}>{s.name}</div>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'11px', color:'var(--muted)', marginBottom:'6px' }}>{s.etf}{s.price ? ` · $${s.price}` : ''}</div>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'16px', fontWeight:700, color: pos ? 'var(--green)' : 'var(--red)' }}>{fmtPct(v, 1)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* LINE */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'20px', marginBottom:'18px' }}>
        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'6px' }}>{t('trendsPage.cumulativeTitle')}</div>
        <div style={{ fontSize:'11px', color:'var(--muted)', marginBottom:'14px' }}>{t('trendsPage.cumulativeSubtitle', { active: active.size, total: sectors.length })}</div>
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'16px', alignItems:'center' }}>
          <button onClick={selectAll} disabled={allOn} style={{ padding:'4px 12px', borderRadius:'20px', fontSize:'10px', fontFamily:"'DM Mono',monospace", cursor: allOn ? 'default' : 'pointer', border:'1px solid var(--gold)', background:'transparent', color:'var(--gold)', opacity: allOn ? 0.4 : 1, transition:'all .15s' }}>{t('trendsPage.selectAll')}</button>
          <button onClick={clearAll} disabled={active.size === 0} style={{ padding:'4px 12px', borderRadius:'20px', fontSize:'10px', fontFamily:"'DM Mono',monospace", cursor: active.size === 0 ? 'default' : 'pointer', border:'1px solid var(--muted)', background:'transparent', color:'var(--muted)', opacity: active.size === 0 ? 0.4 : 1, transition:'all .15s' }}>{t('trendsPage.selectNone')}</button>
          <span style={{ width:'1px', alignSelf:'stretch', background:'var(--border)', margin:'0 4px' }} />
          {sectors.map(s => {
            const on = active.has(s.name);
            return (
              <button key={s.name} onClick={() => toggleSector(s.name)}
                style={{ padding:'4px 10px', borderRadius:'20px', fontSize:'10px', fontFamily:"'DM Mono',monospace", cursor:'pointer', border:`1px solid ${s.color}`, background: on ? s.color + '33' : 'transparent', color: on ? s.color : 'var(--muted)', transition:'all .15s' }}>
                {s.name}
              </button>
            );
          })}
        </div>
        <div style={{ position:'relative', height:'280px' }}>{!loading && <Line data={lineData} options={lineOpts} />}</div>
      </div>

      {/* BAR */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'20px', marginBottom:'18px' }}>
        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'14px' }}>{t('trendsPage.barTitle')}</div>
        <div style={{ position:'relative', height:'260px' }}>{!loading && <Bar data={barData} options={barOpts} />}</div>
      </div>

      {/* TABLE */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', overflow:'hidden' }}>
        <div style={{ padding:'16px 18px', borderBottom:'1px solid var(--border)', fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase' }}>{t('trendsPage.tableTitle')}</div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--surface2)' }}>
                <th style={{ ...thStyle, textAlign:'left' }}>{t('trendsPage.colSector')}</th>
                <th style={{ ...thStyle, textAlign:'left' }}>ETF</th>
                <th style={{ ...thStyle, textAlign:'right' }}>{t('trendsPage.colReturn')}</th>
                <th style={{ ...thStyle, textAlign:'right' }}>{t('trendsPage.colSignal')}</th>
                <th style={{ ...thStyle, textAlign:'center' }}>{t('trendsPage.colView')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => {
                const v = lastVal(s, period); const pos = v != null && v >= 0;
                return (
                  <tr key={s.etf} style={{ background: i % 2 === 0 ? '' : 'var(--surface2)' }}>
                    <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace", fontSize:'13px' }}><span style={{ marginRight:'6px' }}>{s.icon}</span><span style={{ color:'var(--text)' }}>{s.name}</span></td>
                    <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace", fontSize:'12px', color:'var(--gold)' }}>{s.etf}</td>
                    <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace", fontSize:'14px', textAlign:'right', fontWeight:600, color: pos ? 'var(--green)' : 'var(--red)' }}>{fmtPct(v)}</td>
                    <td style={{ padding:'12px 14px', fontSize:'12px', textAlign:'right' }}>{v != null ? signal(v) : '—'}</td>
                    <td style={{ padding:'12px 14px', textAlign:'center' }}><a href={`https://finviz.com/quote.ashx?t=${s.etf}`} target="_blank" rel="noreferrer" className="insider-link" style={{ fontSize:'10px' }}>↗</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop:'14px', padding:'12px 16px', background:'var(--surface2)', borderRadius:'8px', borderLeft:'3px solid var(--gold)', fontSize:'11px', color:'var(--muted)', lineHeight:1.7 }}>
        {t('trendsPage.footer')}
        <a href="https://finviz.com/map.ashx?t=sec" target="_blank" rel="noreferrer" style={{ color:'var(--gold)', textDecoration:'none' }}> Finviz Sector Map</a> ·
        <a href="https://www.tradingview.com/markets/stocks-usa/sectorandindustry-sector/" target="_blank" rel="noreferrer" style={{ color:'var(--gold)', textDecoration:'none' }}> TradingView Sectors</a>
      </div>
    </div>
  );
}
