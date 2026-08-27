import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Line } from 'react-chartjs-2';
import { api } from '../lib/api.js';

const SEGMENTS = ['all', 'DRAM', 'NAND', 'HBM', 'Mobile', 'GDDR'];
const chgColor = (v) => v == null ? 'var(--muted)' : v >= 0 ? 'var(--green)' : 'var(--red)';
const fmtPct = (v) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

// Precios de memoria (DRAM/NAND/HBM) — memoryindex.io. El snapshot (precio +
// 24h/30d/interanual) es del proveedor, sin coste; el histórico para graficar
// lo construye nuestro propio cron diario (crece día a día desde que se activó
// esta función, no hay backfill posible — la fuente gratuita no lo ofrece).
export default function MemoryPrices({ theme }) {
  const { t } = useTranslation();
  const isDark = theme === 'dark';
  const [current, setCurrent] = useState([]);
  const [history, setHistory] = useState([]);
  const [segment, setSegment] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async (fresh) => {
    if (fresh) setRefreshing(true);
    try {
      const d = await api.memoryPrices(fresh);
      setCurrent(d.current || []);
      setHistory(d.history || []);
      setUpdatedAt(new Date());
    } catch {
      // silencioso: es un widget informativo aparte, no debe romper Tendencias
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const rows = useMemo(() => {
    const filtered = segment === 'all' ? current : current.filter(r => r.segment === segment);
    return [...filtered].sort((a, b) => (a.segment || '').localeCompare(b.segment || '') || (a.name || '').localeCompare(b.name || ''));
  }, [current, segment]);

  // Solo entran al gráfico los productos con ≥2 puntos acumulados — con 1
  // punto (día de arranque) no hay línea que trazar, solo ruido.
  const chartable = useMemo(() => {
    const bySeg = segment === 'all' ? history : history.filter(h => h.segment === segment);
    return bySeg.filter(h => h.points.length >= 2);
  }, [history, segment]);

  const textColor = isDark ? '#7a8694' : '#6b7280';
  const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';
  const palette = ['#c9a84c', '#3a8eff', '#2ecc71', '#e74c3c', '#9b59b6', '#e67e22', '#1abc9c', '#f1c40f'];
  const allDates = [...new Set(chartable.flatMap(h => h.points.map(p => p.date)))].sort();
  const lineData = {
    labels: allDates,
    datasets: chartable.map((h, i) => {
      const byDate = Object.fromEntries(h.points.map(p => [p.date, p.spot]));
      return {
        label: h.name, data: allDates.map(d => byDate[d] ?? null), borderColor: palette[i % palette.length],
        backgroundColor: palette[i % palette.length] + '18', borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, tension: 0.25, spanGaps: true,
      };
    }),
  };
  const lineOpts = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { color: textColor, font: { family: 'DM Mono', size: 9 }, boxWidth: 10, padding: 8 } },
      tooltip: { backgroundColor: isDark ? '#181c22' : '#fff', titleColor: textColor, bodyColor: textColor, borderColor: isDark ? '#2d3540' : '#e2e4e8', borderWidth: 1, callbacks: { label: c => c.dataset.label + ': $' + c.parsed.y } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 } } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 }, callback: v => '$' + v } },
    },
  };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>{t('memoryPrices.title')}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>{t('memoryPrices.subtitle')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {updatedAt && <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>↻ {updatedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button className="btn btn-outline" onClick={() => load(true)} disabled={refreshing || loading}>{refreshing ? t('macroPage.updating') : t('macroPage.update')}</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {SEGMENTS.map(s => (
          <button key={s} className={`filter-chip${segment === s ? ' active' : ''}`} onClick={() => setSegment(s)}>{s === 'all' ? t('memoryPrices.allSegments') : s}</button>
        ))}
      </div>

      {!loading && rows.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'DM Mono',monospace", fontSize: '12px' }}>
            <thead>
              <tr style={{ color: 'var(--muted)', fontSize: '10px', textAlign: 'right' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>{t('memoryPrices.colProduct')}</th>
                <th style={{ padding: '4px 8px' }}>{t('memoryPrices.colSegment')}</th>
                <th style={{ padding: '4px 8px' }}>{t('memoryPrices.colPrice')}</th>
                <th style={{ padding: '4px 8px' }}>24h</th>
                <th style={{ padding: '4px 8px' }}>30d</th>
                <th style={{ padding: '4px 8px' }}>{t('memoryPrices.colYoy')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.contractId} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text)' }} title={r.name}>{r.ticker}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--muted)' }}>{r.segment}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px' }}>${r.spot}<span style={{ color: 'var(--muted)', fontSize: '9px' }}> {r.unit}</span></td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', color: chgColor(r.chg24h) }}>{fmtPct(r.chg24h)}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', color: chgColor(r.chg30d) }}>{fmtPct(r.chg30d)}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', color: chgColor(r.chgYoy) }}>{fmtPct(r.chgYoy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {loading && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('marketPulse.loading')}</div>}

      {chartable.length > 0 ? (
        <div style={{ position: 'relative', height: '220px' }}><Line data={lineData} options={lineOpts} /></div>
      ) : (
        !loading && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{t('memoryPrices.buildingHistory')}</div>
      )}
      <div style={{ marginTop: '10px', fontSize: '9px', color: 'var(--muted)' }}>{t('memoryPrices.sourceNote')}</div>
    </div>
  );
}
