import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Line } from 'react-chartjs-2';
import { api } from '../lib/api.js';

const SEGMENTS = ['all', 'DRAM', 'NAND', 'HBM', 'Mobile', 'GDDR'];
const RANGES = [[5, '5A'], [10, '10A'], [null, 'Todo']];
const chgColor = (v) => v == null ? 'var(--muted)' : v >= 0 ? 'var(--green)' : 'var(--red)';
const fmtPct = (v) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

function sliceRange(points, years) {
  if (!years) return points;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return points.filter(p => p.date >= cutoffStr);
}

// Mini-gráfico de una serie mensual (PPI / facturación) con selector de rango.
function TrendChart({ points, color, years, setYears, valueFmt, theme }) {
  const { t } = useTranslation();
  const isDark = theme === 'dark';
  const textColor = isDark ? '#7a8694' : '#6b7280';
  const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';
  if (!Array.isArray(points) || points.length < 2) return null;
  const shown = sliceRange(points, years);
  const data = {
    labels: shown.map(p => p.date.slice(0, 7)),
    datasets: [{ data: shown.map(p => p.value), borderColor: color, backgroundColor: color + '18', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.25, fill: true }],
  };
  const opts = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: isDark ? '#181c22' : '#fff', titleColor: textColor, bodyColor: textColor, borderColor: isDark ? '#2d3540' : '#e2e4e8', borderWidth: 1, callbacks: { label: c => valueFmt(c.parsed.y) } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 }, maxTicksLimit: 8 } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 }, callback: v => valueFmt(v) } },
    },
  };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px', marginBottom: '6px' }}>
        {RANGES.map(([n, l]) => (
          <button key={l} className={`filter-chip${years === n ? ' active' : ''}`} style={{ padding: '2px 9px', fontSize: '10px' }} onClick={() => setYears(n)}>{l}</button>
        ))}
      </div>
      <div style={{ position: 'relative', height: '160px' }}><Line data={data} options={opts} /></div>
    </div>
  );
}

// Tendencia del mercado de semiconductores — 3 fuentes independientes:
//  1) Spot de memoria (memoryindex.io) — snapshot del día, histórico propio
//     acumulado día a día (no hay backfill gratis para esto).
//  2) PPI de semiconductores (BLS) — precio real con ~10 años de histórico,
//     pero ajustado por calidad: baja estructuralmente por Ley de Moore
//     incluso en plena escasez, no es un proxy del spot.
//  3) Facturación mundial (WSTS) — demanda real, mensual, desde 1986.
export default function MemoryPrices({ theme }) {
  const { t } = useTranslation();
  const isDark = theme === 'dark';
  const [current, setCurrent] = useState([]);
  const [history, setHistory] = useState([]);
  const [ppi, setPpi] = useState(null);
  const [billings, setBillings] = useState(null);
  const [segment, setSegment] = useState('all');
  const [ppiYears, setPpiYears] = useState(10);
  const [billingsYears, setBillingsYears] = useState(10);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async (fresh) => {
    if (fresh) setRefreshing(true);
    try {
      const d = await api.memoryPrices(fresh);
      setCurrent(d.current || []);
      setHistory(d.history || []);
      setPpi(d.ppi || null);
      setBillings(d.billings || null);
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

  // Solo entran al gráfico de spot los productos con ≥2 puntos acumulados —
  // con 1 punto (día de arranque) no hay línea que trazar, solo ruido.
  const chartable = useMemo(() => {
    const bySeg = segment === 'all' ? history : history.filter(h => h.segment === segment);
    return bySeg.filter(h => h.points.length >= 2);
  }, [history, segment]);

  const textColor = isDark ? '#7a8694' : '#6b7280';
  const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';
  const palette = ['#c9a84c', '#3a8eff', '#2ecc71', '#e74c3c', '#9b59b6', '#e67e22', '#1abc9c', '#f1c40f'];
  const allDates = [...new Set(chartable.flatMap(h => h.points.map(p => p.date)))].sort();
  const spotLineData = {
    labels: allDates,
    datasets: chartable.map((h, i) => {
      const byDate = Object.fromEntries(h.points.map(p => [p.date, p.spot]));
      return {
        label: h.name, data: allDates.map(d => byDate[d] ?? null), borderColor: palette[i % palette.length],
        backgroundColor: palette[i % palette.length] + '18', borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, tension: 0.25, spanGaps: true,
      };
    }),
  };
  const spotLineOpts = {
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

  const cap = { fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' };
  const fmtB = (v) => v == null ? '—' : `$${(v / 1000).toFixed(1)}B`;
  const fmtPpi = (v) => v == null ? '—' : v.toFixed(1);

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%)',
      border: '1px solid var(--gold)', borderRadius: '14px', padding: '24px', marginBottom: '22px',
      boxShadow: '0 6px 28px rgba(201,168,76,.10)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '26px' }}>🔬</span>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '20px', fontWeight: 700 }}>{t('memoryPrices.title')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {updatedAt && <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>↻ {updatedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button className="btn btn-outline" onClick={() => load(true)} disabled={refreshing || loading}>{refreshing ? t('macroPage.updating') : t('macroPage.update')}</button>
        </div>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '20px', lineHeight: 1.6 }}>{t('memoryPrices.subtitle')}</div>

      {/* Demanda + Precio de fondo — las dos series con histórico real, lo más llamativo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: '16px', marginBottom: '20px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
          <div style={cap}>{t('memoryPrices.billingsTitle')}</div>
          {billings ? (
            <>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '22px', fontWeight: 700, color: 'var(--green)', marginBottom: '8px' }}>{fmtB(billings[billings.length - 1]?.value)} <span style={{ fontSize: '11px', color: 'var(--muted)' }}>/ {t('memoryPrices.perMonth')}</span></div>
              <TrendChart points={billings} color="#2ecc71" years={billingsYears} setYears={setBillingsYears} valueFmt={fmtB} theme={theme} />
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '8px', lineHeight: 1.6 }}>{t('memoryPrices.billingsNote')}</div>
            </>
          ) : <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{loading ? t('marketPulse.loading') : t('memoryPrices.sourceUnavailable')}</div>}
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
          <div style={cap}>{t('memoryPrices.ppiTitle')}</div>
          {ppi ? (
            <>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '22px', fontWeight: 700, color: 'var(--gold)', marginBottom: '8px' }}>{fmtPpi(ppi[ppi.length - 1]?.value)}</div>
              <TrendChart points={ppi} color="#c9a84c" years={ppiYears} setYears={setPpiYears} valueFmt={fmtPpi} theme={theme} />
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '8px', lineHeight: 1.6 }}>{t('memoryPrices.ppiNote')}</div>
            </>
          ) : <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{loading ? t('marketPulse.loading') : t('memoryPrices.sourceUnavailable')}</div>}
        </div>
      </div>

      {/* Spot de memoria — el snapshot diario + histórico propio en construcción */}
      <div style={cap}>{t('memoryPrices.spotTitle')}</div>
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
                <th style={{ padding: '4px 8px' }}>7d</th>
                <th style={{ padding: '4px 8px' }}>30d</th>
                <th style={{ padding: '4px 8px' }}>60d</th>
                <th style={{ padding: '4px 8px' }}>90d</th>
                <th style={{ padding: '4px 8px' }}>180d</th>
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
                  <td style={{ textAlign: 'right', padding: '6px 8px', color: chgColor(r.chg7d) }}>{fmtPct(r.chg7d)}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', color: chgColor(r.chg30d) }}>{fmtPct(r.chg30d)}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', color: chgColor(r.chg60d) }}>{fmtPct(r.chg60d)}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', color: chgColor(r.chg90d) }}>{fmtPct(r.chg90d)}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', color: chgColor(r.chg180d) }}>{fmtPct(r.chg180d)}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', color: chgColor(r.chgYoy) }}>{fmtPct(r.chgYoy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {loading && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('marketPulse.loading')}</div>}

      {chartable.length > 0 ? (
        <div style={{ position: 'relative', height: '220px' }}><Line data={spotLineData} options={spotLineOpts} /></div>
      ) : (
        !loading && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{t('memoryPrices.buildingHistory')}</div>
      )}
      <div style={{ marginTop: '10px', fontSize: '9px', color: 'var(--muted)' }}>{t('memoryPrices.sourceNote')}</div>
    </div>
  );
}
