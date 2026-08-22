import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Line } from 'react-chartjs-2';
import { api } from '../lib/api.js';
import StatCard from './shared/StatCard.jsx';

const RANGE_KEYS = ['3mo','6mo','1y'];

export default function SMC({ theme, toast }) {
  const { t } = useTranslation();
  const months = t('macroPage.months', { returnObjects: true });
  const fmtDay = (ts) => { const d = new Date(ts); return `${d.getDate()} ${months[d.getMonth()]}`; };
  const RANGES = RANGE_KEYS.map(k => [k, t('volProfilePage.ranges.' + k)]);
  const [symbol, setSymbol] = useState('AAPL');
  const [input, setInput] = useState('AAPL');
  const [range, setRange] = useState('6mo');
  const [obSort, setObSort] = useState('date'); // 'date' | 'near'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const isDark = theme === 'dark';

  const load = useCallback(async (sym, rg) => {
    setLoading(true);
    try { setData(await api.smc(sym, rg)); }
    catch (e) { toast?.(t('toast.error', { message: e.message || t('volProfilePage.couldNotLoadSym', { sym }) })); setData(null); }
    finally { setLoading(false); }
  }, [toast, t]);

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
  const priceLabel = t('volProfilePage.priceLabel');
  const chartData = data ? {
    labels: data.closes.map(c => fmtDay(c.t)),
    datasets: [
      { label: priceLabel, data: data.closes.map(c => c.c), borderColor: '#3a8eff', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.2, fill: false },
      ...(data.support ? band(data.support.top, data.support.bottom, 'rgba(46,204,113,.18)') : []),
      ...(data.resistance ? band(data.resistance.top, data.resistance.bottom, 'rgba(231,76,60,.18)') : []),
    ],
  } : null;
  const chartOpts = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: textColor, font: { family: 'DM Mono', size: 10 }, filter: it => it.text === priceLabel } },
      tooltip: { filter: it => it.dataset.label === priceLabel, backgroundColor: isDark ? '#181c22' : '#fff', titleColor: textColor, bodyColor: textColor, borderColor: isDark ? '#2d3540' : '#e2e4e8', borderWidth: 1, callbacks: { label: c => '$' + c.parsed.y } },
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 }, maxTicksLimit: 12, autoSkip: true } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 10 }, callback: v => '$' + v } },
    },
  };

  const activeOB = data ? data.orderBlocks.filter(o => !o.mitigated) : [];
  const strongestOB = activeOB.length ? Math.max(...activeOB.map(o => o.strength || 0)) : null;

  const stat = (label, value, sub, color) => <StatCard label={label} value={value} sub={sub} color={color} />;

  const statusBadge = (z) => {
    const { label, col } = z.filled ? { label: z.kind === 'OB' ? t('smcPage.status.mitigated') : t('smcPage.status.filled'), col: 'var(--muted)' }
      : z.mitigated ? { label: t('smcPage.status.mitigated'), col: '#e67e22' }
      : { label: t('smcPage.status.active'), col: z.type === 'bull' ? '#2ecc71' : '#e74c3c' };
    return <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', padding: '1px 7px', borderRadius: '8px', background: col + '22', color: col }}>{label}</span>;
  };

  const strengthColor = (s) => s == null ? 'var(--muted)' : s >= 67 ? 'var(--green)' : s >= 40 ? 'var(--orange)' : 'var(--red)';

  const zoneTable = (title, zones, emptyMsg, withStrength = false) => {
    const mid = (z) => (z.top + z.bottom) / 2;
    let rows = [...zones].reverse(); // por defecto: más recientes primero
    if (withStrength && obSort === 'near' && data?.price) {
      rows = [...zones].sort((a, b) => Math.abs(mid(a) - data.price) - Math.abs(mid(b) - data.price));
    }
    return (
    <div style={{ ...cardBase, overflowX: 'auto' }}>
      <div style={{ ...cap, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <span>{title}</span>
        {withStrength && (
          <span style={{ display: 'flex', gap: '4px' }}>
            <button className={`filter-chip${obSort === 'date' ? ' active' : ''}`} style={{ padding: '2px 9px', fontSize: '10px' }} onClick={() => setObSort('date')}>{t('smcPage.sortDate')}</button>
            <button className={`filter-chip${obSort === 'near' ? ' active' : ''}`} style={{ padding: '2px 9px', fontSize: '10px' }} onClick={() => setObSort('near')}>{t('smcPage.sortNear')}</button>
          </span>
        )}
      </div>
      {zones.length ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'DM Mono',monospace" }}>
          <thead><tr style={{ color: 'var(--muted)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            <th style={{ textAlign: 'left', padding: '5px 6px' }}>{t('smcPage.colType')}</th><th style={{ textAlign: 'right', padding: '5px 6px' }}>{t('smcPage.colZone')}</th>
            {withStrength && <th style={{ textAlign: 'right', padding: '5px 6px' }}>{t('smcPage.colDist')}</th>}
            {withStrength && <th style={{ textAlign: 'right', padding: '5px 6px' }}>{t('smcPage.colStrength')}</th>}
            <th style={{ textAlign: 'right', padding: '5px 6px' }}>{t('smcPage.colDate')}</th><th style={{ textAlign: 'right', padding: '5px 6px' }}>{t('smcPage.colStatus')}</th>
          </tr></thead>
          <tbody>
            {rows.map((z, i) => {
              const dist = data?.price ? (mid(z) - data.price) / data.price * 100 : null;
              const near = withStrength && dist != null && Math.abs(dist) < 2;
              return (
              <tr key={i} style={{ fontSize: '11px', borderTop: '1px solid var(--border)', opacity: z.filled && !z.broken ? 0.55 : 1, background: near ? 'rgba(201,168,76,.10)' : 'transparent', boxShadow: near ? 'inset 3px 0 0 var(--gold)' : 'none' }}>
                <td style={{ padding: '6px', color: z.type === 'bull' ? 'var(--green)' : 'var(--red)', whiteSpace: 'nowrap' }}>
                  {z.type === 'bull' ? t('smcPage.bullish') : t('smcPage.bearish')}
                  {z.htf && <span title={t('smcPage.weeklyConfluenceTooltip')} style={{ marginLeft: '5px', fontSize: '9px', padding: '0 5px', borderRadius: '8px', background: 'rgba(201,168,76,.22)', color: 'var(--gold)' }}>{t('smcPage.weeklyTag')}</span>}
                  {z.broken && <span title={t('smcPage.breakerTooltip', { role: z.role })} style={{ marginLeft: '5px', fontSize: '9px', padding: '0 5px', borderRadius: '8px', background: 'rgba(155,89,182,.25)', color: '#b07bd0' }}>⇄ {z.role}</span>}
                </td>
                <td style={{ padding: '6px', textAlign: 'right' }}>${z.bottom}–${z.top}</td>
                {withStrength && (
                  <td style={{ padding: '6px', textAlign: 'right', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {dist == null ? '—' : `${dist >= 0 ? '↑' : '↓'} ${Math.abs(dist).toFixed(1)}%`}
                  </td>
                )}
                {withStrength && (
                  <td style={{ padding: '6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ color: strengthColor(z.strength), fontWeight: 700 }} title={t('smcPage.convictionTooltip', { label: z.strengthLabel })}>{z.strength ?? '—'}</span>
                    {z.highVolume && <span title={t('smcPage.volumeTooltip', { ratio: z.volRatio })} style={{ marginLeft: '5px', color: 'var(--gold)', fontSize: '10px' }}>⚡{z.volRatio}×</span>}
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
  };

  return (
    <div className="section active">
      <div style={{ ...cardBase, borderLeft: '4px solid var(--gold)', marginBottom: '18px' }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '16px', marginBottom: '6px' }}>{t('smcPage.title')} <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--gold)', border: '1px solid rgba(201,168,76,.3)', padding: '1px 7px', borderRadius: '10px', verticalAlign: 'middle' }}>{t('guide.tags.experimental').toUpperCase()}</span></div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.7 }}>{t('smcPage.subtitlePrefix')} <b>Fair Value Gaps</b> {t('smcPage.subtitleMid')} <b>Order Blocks</b> {t('smcPage.subtitleSuffix')}</div>
      </div>

      {/* Controles */}
      <div style={{ ...cardBase, marginBottom: '18px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '160px' }}>
            <label style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>{t('volProfilePage.tickerLabel')}</label>
            <input value={input} onChange={e => setInput(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && analyze()} placeholder="AAPL, MSFT…" style={{ width: '100%', marginTop: '4px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 10px', color: 'var(--text)', fontFamily: "'DM Mono',monospace", fontSize: '15px' }} />
          </div>
          <button className="btn btn-gold" onClick={analyze} disabled={loading}>{loading ? '⏳' : t('volProfilePage.analyze')}</button>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{RANGES.map(([k, l]) => <button key={k} className={`filter-chip${range === k ? ' active' : ''}`} onClick={() => setRange(k)}>{l}</button>)}</div>
        </div>
      </div>

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: '10px', marginBottom: '18px' }}>
            {stat(t('volProfilePage.priceLabel'), '$' + data.price, data.symbol)}
            {stat(t('smcPage.nearSupport'), data.support ? `$${data.support.bottom}–${data.support.top}` : '—', data.support ? data.support.kind : t('smcPage.noZone'), '#2ecc71')}
            {stat(t('smcPage.nearResistance'), data.resistance ? `$${data.resistance.bottom}–${data.resistance.top}` : '—', data.resistance ? data.resistance.kind : t('smcPage.noZone'), '#e74c3c')}
            {stat(t('smcPage.activeFvg'), String(data.counts.fvgUnfilled), t('smcPage.unfilled'), '#c9a84c')}
            {stat(t('smcPage.activeOb'), String(data.counts.obUnmitigated), t('smcPage.unmitigated'), '#c9a84c')}
            {strongestOB != null && stat(t('smcPage.strongestOb'), String(strongestOB), t('smcPage.strength0to100'), strengthColor(strongestOB))}
            {data.counts.obHtf != null && stat(t('smcPage.weeklyConfluence'), String(data.counts.obHtf), t('smcPage.obDailyWeekly'), 'var(--gold)')}
          </div>

          <div style={{ ...cardBase, marginBottom: '18px' }}>
            <div style={{ ...cap, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span>{t('smcPage.priceAndZones')}</span>
              <span style={{ textTransform: 'none', letterSpacing: 0 }}><span style={{ color: '#2ecc71' }}>■</span> {t('smcPage.support')} · <span style={{ color: '#e74c3c' }}>■</span> {t('smcPage.resistance')}</span>
            </div>
            <div style={{ position: 'relative', height: '360px' }}>{!loading && chartData && <Line data={chartData} options={chartOpts} />}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: '16px' }}>
            {zoneTable('Fair Value Gaps', data.fvgs, t('smcPage.noFvg'))}
            {zoneTable(t('smcPage.obTableTitle'), data.orderBlocks, t('smcPage.noOb'), true)}
          </div>
        </>
      )}

      {loading && <div style={{ ...cardBase, textAlign: 'center', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", fontSize: '12px', padding: '40px' }}>{t('volProfilePage.analyzing', { symbol })}</div>}
      {!loading && !data && <div style={{ ...cardBase, textAlign: 'center', color: 'var(--muted)', fontSize: '12px', padding: '40px' }}>{t('volProfilePage.noDataPrefix')} <b>{symbol}</b>. {t('smcPage.noDataSuffix')}</div>}

      <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--surface2)', borderRadius: '8px', borderLeft: '3px solid var(--gold)', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.7 }}>
        {t('smcPage.footerPart1')} <b>{t('smcPage.footerStrengthBold')}</b> {t('smcPage.footerPart2')} <b>{t('smcPage.footerDistBold')}</b> {t('smcPage.footerPart3')} <b>{t('smcPage.colDate')}</b> {t('smcPage.footerOr')} <b>{t('smcPage.sortNear')}</b>{t('smcPage.footerPart4')} <span style={{ color: '#b07bd0' }}>{t('smcPage.breakerTag')}</span> {t('smcPage.footerPart5')} <span style={{ color: 'var(--gold)' }}>{t('smcPage.weeklyTag')}</span> {t('smcPage.footerPart6')}
      </div>
    </div>
  );
}
