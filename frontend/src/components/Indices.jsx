import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Line } from 'react-chartjs-2';
import { api } from '../lib/api.js';

const PERIOD_KEYS = ['1m','3m','6m','ytd','1y','3y','5y','10y','20y'];
// El backend devuelve `region` en español (para filtrar); la etiqueta se
// resuelve via i18next: indicesPage.regions.<key>
const REGIONS = [['USA', 'usa'], ['Europa', 'europe'], ['Asia', 'asia']];
// Periodos intra-mes (puntos diarios) → etiqueta "12 May"; el resto → "May '25".
const INTRADAY = new Set(['1m', '3m', '6m', 'ytd']);

// Null-safe: si el backend cae al fallback (serie vacía/ausente para ese
// periodo), evita romper toda la página con un TypeError sobre undefined.
const lastVal = (s, p) => {
  const arr = s?.[p];
  return Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null;
};
const fmtPct = (v) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—';

export default function Indices({ theme, toast }) {
  const { t } = useTranslation();
  const months = t('macroPage.months', { returnObjects: true });
  const PERIODS = PERIOD_KEYS.map(k => [k, t('trendsPage.periods.' + k)]);
  const fmtLabel = (ts, period) => {
    const d = new Date(ts);
    const mes = months[d.getMonth()];
    if (INTRADAY.has(period)) return `${d.getDate()} ${mes}`;
    return `${mes} '${String(d.getFullYear()).slice(2)}`;
  };
  const [indices, setIndices] = useState([]);
  const [period, setPeriod] = useState('1m');
  const [active, setActive] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const isDark = theme === 'dark';

  // Carga los índices. fresh=true salta la caché de 10 min del backend
  // y conserva la selección de índices activos del usuario.
  const load = useCallback(async (fresh) => {
    if (fresh) setRefreshing(true);
    try {
      const data = await api.indices(fresh);
      setIndices(data);
      setActive(prev => prev.size ? prev : new Set(data.map(s => s.name)));
      setUpdatedAt(new Date());
      if (data.some(s => s.live === false)) toast?.(t('indicesPage.someFallback'));
      else if (fresh) toast?.(t('indicesPage.indicesUpdated'));
    } catch (e) {
      toast?.(t('indicesPage.couldNotLoadIndices', { message: e.message }));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast, t]);

  useEffect(() => { load(false); }, [load]);

  const textColor = isDark ? '#7a8694' : '#6b7280';
  const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';

  const toggleIndex = (name) => {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };
  const selectAll = () => setActive(new Set(indices.map(s => s.name)));
  const clearAll = () => setActive(new Set());
  const allOn = indices.length > 0 && active.size === indices.length;

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

  const byRegion = useMemo(() => REGIONS.map(([r, key]) => ({
    region: r, regionLabel: t('indicesPage.regions.' + key),
    items: [...indices.filter(s => s.region === r)].sort((a, b) => (lastVal(b, period) ?? -Infinity) - (lastVal(a, period) ?? -Infinity)),
  })).filter(g => g.items.length), [indices, period, t]);

  const signal = (v) => v > 5 ? t('trendsPage.signal.strongUp') : v > 2 ? t('trendsPage.signal.bullish') : v > 0 ? t('trendsPage.signal.neutralPos') : v > -2 ? t('trendsPage.signal.neutralNeg') : v > -5 ? t('trendsPage.signal.bearish') : t('trendsPage.signal.strongDown');

  return (
    <div className="section active">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'18px', flexWrap:'wrap', gap:'10px' }}>
        <div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'16px', marginBottom:'3px' }}>{t('indicesPage.title')}</div>
          <div style={{ fontSize:'11px', color:'var(--muted)', fontFamily:"'DM Mono',monospace" }}>
            {t('indicesPage.subtitle')} · {loading ? t('marketPulse.loading') : t('trendsPage.liveData')}
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

      {/* CARDS POR REGIÓN */}
      {byRegion.map(group => (
        <div key={group.region} style={{ marginBottom:'18px' }}>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'10px' }}>{group.regionLabel}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:'10px' }}>
            {group.items.map(s => {
              const v = lastVal(s, period); const pos = v != null && v >= 0;
              const dv = s.changePercent; const dpos = dv != null && dv >= 0;
              return (
                <div key={s.symbol} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'16px', transition:'all .2s' }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = s.color; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px var(--shadow)'; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
                      <span style={{ fontSize:'18px' }}>{s.icon}</span>
                      <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'12px', color:'var(--text)', fontWeight:600 }}>{s.name}</span>
                    </div>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', padding:'2px 7px', borderRadius:'10px', background: dpos ? 'rgba(46,204,113,.15)' : 'rgba(231,76,60,.15)', color: dpos ? 'var(--green)' : 'var(--red)' }}>{dv != null ? (dpos ? '▲' : '▼') + ' ' : ''}{fmtPct(dv)}</span>
                  </div>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'20px', fontWeight:700, color:'var(--text)' }}>
                    {s.price != null ? s.price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                    {s.currency && s.price != null ? <span style={{ fontSize:'10px', color:'var(--muted)', marginLeft:'5px' }}>{s.currency}</span> : null}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'8px', paddingTop:'8px', borderTop:'1px solid var(--border)' }}>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)' }}>{PERIODS.find(p => p[0] === period)[1]}</span>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'13px', fontWeight:700, color: pos ? 'var(--green)' : 'var(--red)' }}>{fmtPct(v)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* LINE — RENDIMIENTO ACUMULADO */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'20px', marginBottom:'18px' }}>
        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'6px' }}>{t('indicesPage.cumulativeTitle')}</div>
        <div style={{ fontSize:'11px', color:'var(--muted)', marginBottom:'14px' }}>{t('indicesPage.cumulativeSubtitle', { active: active.size, total: indices.length })}</div>
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'16px', alignItems:'center' }}>
          <button onClick={selectAll} disabled={allOn} style={{ padding:'4px 12px', borderRadius:'20px', fontSize:'10px', fontFamily:"'DM Mono',monospace", cursor: allOn ? 'default' : 'pointer', border:'1px solid var(--gold)', background:'transparent', color:'var(--gold)', opacity: allOn ? 0.4 : 1, transition:'all .15s' }}>{t('trendsPage.selectAll')}</button>
          <button onClick={clearAll} disabled={active.size === 0} style={{ padding:'4px 12px', borderRadius:'20px', fontSize:'10px', fontFamily:"'DM Mono',monospace", cursor: active.size === 0 ? 'default' : 'pointer', border:'1px solid var(--muted)', background:'transparent', color:'var(--muted)', opacity: active.size === 0 ? 0.4 : 1, transition:'all .15s' }}>{t('trendsPage.selectNone')}</button>
          <span style={{ width:'1px', alignSelf:'stretch', background:'var(--border)', margin:'0 4px' }} />
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
        <div style={{ padding:'16px 18px', borderBottom:'1px solid var(--border)', fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase' }}>{t('indicesPage.tableTitle')}</div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--surface2)' }}>
                {[t('indicesPage.colIndex'), t('indicesPage.colRegion'), t('indicesPage.colLast'), t('indicesPage.colDayPct'), `${PERIODS.find(p => p[0] === period)[1]} %`, t('trendsPage.colSignal'), t('trendsPage.colView')].map((th, i) => (
                  <th key={i} style={{ padding:'10px 14px', fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'1px', textAlign: i >= 2 && i <= 4 ? 'right' : (i >= 5 ? 'center' : 'left') }}>{th}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byRegion.flatMap(g => g.items).map((s, i) => {
                const v = lastVal(s, period); const pos = v != null && v >= 0;
                const dpos = s.changePercent != null && s.changePercent >= 0;
                return (
                  <tr key={s.symbol} style={{ background: i % 2 === 0 ? '' : 'var(--surface2)' }}>
                    <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace", fontSize:'13px' }}><span style={{ marginRight:'6px' }}>{s.icon}</span><span style={{ color:'var(--text)' }}>{s.name}</span></td>
                    <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace", fontSize:'11px', color:'var(--muted)' }}>{t('indicesPage.regions.' + (REGIONS.find(([r]) => r === s.region)?.[1] || ''))}</td>
                    <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace", fontSize:'13px', textAlign:'right', color:'var(--text)' }}>{s.price != null ? s.price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                    <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace", fontSize:'13px', textAlign:'right', fontWeight:600, color: dpos ? 'var(--green)' : 'var(--red)' }}>{fmtPct(s.changePercent)}</td>
                    <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace", fontSize:'13px', textAlign:'right', fontWeight:600, color: pos ? 'var(--green)' : 'var(--red)' }}>{fmtPct(v)}</td>
                    <td style={{ padding:'12px 14px', fontSize:'12px', textAlign:'right' }}>{v != null ? signal(v) : '—'}</td>
                    <td style={{ padding:'12px 14px', textAlign:'center' }}><a href={`https://finance.yahoo.com/quote/${encodeURIComponent(s.symbol)}`} target="_blank" rel="noreferrer" className="insider-link" style={{ fontSize:'10px' }}>↗</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop:'14px', padding:'12px 16px', background:'var(--surface2)', borderRadius:'8px', borderLeft:'3px solid var(--gold)', fontSize:'11px', color:'var(--muted)', lineHeight:1.7 }}>
        {t('indicesPage.footer')}
      </div>
    </div>
  );
}
