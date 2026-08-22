import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Line } from 'react-chartjs-2';
import { MACRO_SOURCES, MACRO_CATS } from '../data/constants.js';
import { api } from '../lib/api.js';
import SparkChart from './shared/SparkChart.jsx';

// Color por estado de la curva / inflación (el backend siempre devuelve el status en español)
const statusColor = (s) => s === 'Invertida' ? '#e74c3c' : s === 'Plana' ? '#c9a84c' : s === 'Normal' ? '#2ecc71' : 'var(--muted)';
const inflColor = (v) => v == null ? 'var(--muted)' : v <= 2.2 ? '#2ecc71' : v <= 3 ? '#c9a84c' : '#e74c3c';
const unempColor = (v) => v == null ? 'var(--muted)' : v <= 4 ? '#2ecc71' : v <= 5 ? '#c9a84c' : '#e74c3c';
const gdpColor = (v) => v == null ? 'var(--muted)' : v >= 2 ? '#2ecc71' : v >= 0 ? '#c9a84c' : '#e74c3c';

function Spark({ points, color }) {
  if (!points || points.length < 2) return null;
  return <div style={{ height: '40px', marginTop: '8px' }}><SparkChart points={points} color={color} tension={0.3} /></div>;
}

export default function Macro({ theme, toast }) {
  const { t } = useTranslation();
  const [cat, setCat] = useState('all');
  const [macro, setMacro] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const isDark = theme === 'dark';
  const sources = cat === 'all' ? MACRO_SOURCES : MACRO_SOURCES.filter(s => s.cat === cat);

  const load = useCallback(async (fresh) => {
    if (fresh) setRefreshing(true);
    try {
      const d = await api.macro(fresh);
      setMacro(d);
      setUpdatedAt(new Date());
      if (fresh) toast?.(t('macroPage.toastUpdated'));
    } catch (e) {
      toast?.(t('macroPage.toastError', { message: e.message }));
    } finally { setLoading(false); setRefreshing(false); }
  }, [toast]);

  useEffect(() => { load(false); }, [load]);

  const textColor = isDark ? '#7a8694' : '#6b7280';
  const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';
  const curve = macro?.curve, infl = macro?.inflation, econ = macro?.economics;

  const curveData = curve ? {
    labels: curve.points.map(p => p.label),
    datasets: [{ label: 'Rendimiento', data: curve.points.map(p => p.value), borderColor: '#c9a84c', backgroundColor: 'rgba(201,168,76,.12)', borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, tension: 0.3, fill: true }],
  } : null;
  const curveOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: isDark ? '#181c22' : '#fff', titleColor: textColor, bodyColor: textColor, borderColor: isDark ? '#2d3540' : '#e2e4e8', borderWidth: 1, callbacks: { label: c => `${c.parsed.y}%` } } },
    scales: { x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 11 } } }, y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 10 }, callback: v => v + '%' } } },
  };

  const cardBase = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' };
  const cap = { fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' };
  const big = { fontFamily: "'DM Mono',monospace", fontSize: '28px', fontWeight: 700 };
  const badge = (txt, col) => <span style={{ display: 'inline-block', fontFamily: "'DM Mono',monospace", fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: col + '22', color: col }}>{txt}</span>;
  const months = t('macroPage.months', { returnObjects: true });
  const monthYr = (d) => { if (!d) return ''; const [y, m] = d.split('-'); return `${months[+m - 1]} '${y.slice(2)}`; };

  return (
    <div className="section active">
      {/* Intro */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px 24px', marginBottom: '18px', borderLeft: '4px solid var(--gold)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '16px', marginBottom: '6px' }}>{t('macroPage.title')}</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.7 }}>{t('macroPage.subtitle')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {updatedAt && <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>↻ {updatedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button className="btn btn-outline" onClick={() => load(true)} disabled={refreshing || loading}>{refreshing ? t('macroPage.updating') : t('macroPage.update')}</button>
        </div>
      </div>

      {/* Curva de tipos */}
      {curve && (
        <div style={{ ...cardBase, marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            <div style={cap}>{t('macroPage.yieldCurveTitle')}</div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '11px', color: 'var(--muted)' }}>10Y-2Y <b style={{ color: statusColor(curve.spread10_2.status) }}>{curve.spread10_2.value > 0 ? '+' : ''}{curve.spread10_2.value}%</b> {badge(curve.spread10_2.status, statusColor(curve.spread10_2.status))}</span>
            </div>
          </div>
          <div style={{ position: 'relative', height: '220px' }}>{!loading && <Line data={curveData} options={curveOpts} />}</div>
        </div>
      )}

      {/* Tarjetas de métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: '14px', marginBottom: '20px' }}>
        {/* Spread 10Y-2Y */}
        {curve && (
          <div style={cardBase}>
            <div style={cap}>{t('macroPage.spread102')}</div>
            <div style={{ ...big, color: statusColor(curve.spread10_2.status) }}>{curve.spread10_2.value > 0 ? '+' : ''}{curve.spread10_2.value ?? '—'}%</div>
            <div style={{ marginTop: '6px' }}>{badge(curve.spread10_2.status, statusColor(curve.spread10_2.status))}</div>
            <Spark points={(curve.spread10_2.history || []).map(h => h.spread)} color={statusColor(curve.spread10_2.status)} />
            <div style={{ fontSize: '10px', color: 'var(--muted)', lineHeight: 1.6, marginTop: '8px' }}>{t('macroPage.spread102Note')} <b style={{ color: statusColor(curve.spread10_3m.status) }}>{curve.spread10_3m.value > 0 ? '+' : ''}{curve.spread10_3m.value}%</b></div>
          </div>
        )}

        {/* Core CPI subyacente */}
        <div style={cardBase}>
          <div style={cap}>{t('macroPage.coreCpiTitle')}</div>
          {infl?.coreCPI ? (
            <>
              <div style={{ ...big, color: inflColor(infl.coreCPI.value) }}>{infl.coreCPI.value}%</div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '6px' }}>{t('macroPage.yoy')} · {monthYr(infl.coreCPI.date)}</div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', lineHeight: 1.6, marginTop: '8px' }}>{t('macroPage.coreCpiNote')} <b>2%</b>. {infl.coreCPI.value > 2 ? t('macroPage.aboveTarget', { pp: (infl.coreCPI.value - 2).toFixed(1) }) : t('macroPage.onTarget')}</div>
            </>
          ) : <div style={{ color: 'var(--muted)', fontSize: '12px' }}>{loading ? t('marketPulse.loading') : t('macroPage.notAvailable')}</div>}
        </div>

        {/* CPI general */}
        <div style={cardBase}>
          <div style={cap}>{t('macroPage.cpiTitle')}</div>
          {infl?.cpi ? (
            <>
              <div style={{ ...big, color: inflColor(infl.cpi.value) }}>{infl.cpi.value}%</div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '6px' }}>{t('macroPage.yoy')} · {monthYr(infl.cpi.date)}</div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', lineHeight: 1.6, marginTop: '8px' }}>{t('macroPage.cpiNote')}</div>
            </>
          ) : <div style={{ color: 'var(--muted)', fontSize: '12px' }}>{loading ? t('marketPulse.loading') : t('macroPage.notAvailable')}</div>}
        </div>

        {/* Fed Funds (EFFR) */}
        <div style={cardBase}>
          <div style={cap}>{t('macroPage.fedRateTitle')}</div>
          {infl?.fedFunds ? (
            <>
              <div style={{ ...big, color: 'var(--gold)' }}>{infl.fedFunds.value}%</div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '6px' }}>{t('macroPage.effr')} · {monthYr(infl.fedFunds.date)}</div>
              <a href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '10px', fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--gold)', textDecoration: 'none' }}>{t('macroPage.fomcCalendar')}</a>
            </>
          ) : <div style={{ color: 'var(--muted)', fontSize: '12px' }}>{loading ? t('marketPulse.loading') : t('macroPage.notAvailable')}</div>}
        </div>

        {/* Tasa de paro (Alpha Vantage) */}
        <div style={cardBase}>
          <div style={cap}>{t('macroPage.unemploymentTitle')}</div>
          {econ?.unemployment ? (
            <>
              <div style={{ ...big, color: unempColor(econ.unemployment.value) }}>{econ.unemployment.value}%</div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '6px' }}>{monthYr(econ.unemployment.date)}{econ.unemployment.prev != null ? t('macroPage.prevValue', { value: econ.unemployment.prev }) : ''}</div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', lineHeight: 1.6, marginTop: '8px' }}>{t('macroPage.unemploymentNote')}</div>
            </>
          ) : <div style={{ color: 'var(--muted)', fontSize: '12px' }}>{loading ? t('marketPulse.loading') : t('macroPage.notAvailable')}</div>}
        </div>

        {/* PIB real (Alpha Vantage) */}
        <div style={cardBase}>
          <div style={cap}>{t('macroPage.gdpTitle')}</div>
          {econ?.gdpGrowth ? (
            <>
              <div style={{ ...big, color: gdpColor(econ.gdpGrowth.value) }}>{econ.gdpGrowth.value > 0 ? '+' : ''}{econ.gdpGrowth.value}%</div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '6px' }}>{t('macroPage.yoy')} · {econ.gdpGrowth.date?.slice(0, 4)}</div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', lineHeight: 1.6, marginTop: '8px' }}>{t('macroPage.gdpNote')}</div>
            </>
          ) : <div style={{ color: 'var(--muted)', fontSize: '12px' }}>{loading ? t('marketPulse.loading') : t('macroPage.notAvailable')}</div>}
        </div>
      </div>

      {/* Separador */}
      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '14px' }}>{t('macroPage.sourcesTitle')}</div>

      <div className="filters-bar" style={{ marginBottom: '18px' }}>
        {MACRO_CATS.map(c => (
          <button key={c.key} className={`filter-chip${cat === c.key ? ' active' : ''}`} onClick={() => setCat(c.key)}>{t('macroPage.cats.' + c.key)}</button>
        ))}
      </div>

      <div id="macro-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '14px' }}>
        {sources.map((s, i) => (
          <a key={i} href={s.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', transition: 'all .2s', height: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px var(--shadow)'; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ fontSize: '24px' }}>{s.icon}</div>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--gold)', border: '1px solid rgba(201,168,76,.3)', padding: '2px 7px', borderRadius: '10px', whiteSpace: 'nowrap' }}>{t('macroPage.sources.' + s.key + '.tag')}</span>
              </div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '14px', fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>{t('macroPage.sources.' + s.key + '.name')}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.7, flex: 1 }}>{t('macroPage.sources.' + s.key + '.desc')}</div>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--gold)', marginTop: '4px' }}>{t('macroPage.openLink')}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
