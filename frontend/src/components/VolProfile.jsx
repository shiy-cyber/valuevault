import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Line, Bar } from 'react-chartjs-2';
import { api } from '../lib/api.js';
import StatCard from './shared/StatCard.jsx';

const RANGE_KEYS = ['3mo','6mo','1y','2y'];
const ANCHOR_KEYS = ['range','ytd','high','low'];

const fmtVol = (v) => v == null ? '—' : v >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(0) + 'M' : String(Math.round(v));

export default function VolProfile({ theme, toast }) {
  const { t } = useTranslation();
  const months = t('macroPage.months', { returnObjects: true });
  const fmtDay = (ts) => { const d = new Date(ts); return `${d.getDate()} ${months[d.getMonth()]}`; };
  const RANGES = RANGE_KEYS.map(k => [k, t('volProfilePage.ranges.' + k)]);
  const ANCHORS = ANCHOR_KEYS.map(k => [k, t('volProfilePage.anchors.' + k)]);
  const [symbol, setSymbol] = useState('AAPL');
  const [input, setInput] = useState('AAPL');
  const [range, setRange] = useState('1y');
  const [anchor, setAnchor] = useState('range');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const isDark = theme === 'dark';

  const load = useCallback(async (sym, rg, an) => {
    setLoading(true);
    try {
      const d = await api.volprofile(sym, rg, an);
      setData(d);
    } catch (e) {
      toast?.(t('toast.error', { message: e.message || t('volProfilePage.couldNotLoadSym', { sym }) }));
      setData(null);
    } finally { setLoading(false); }
  }, [toast, t]);

  useEffect(() => { load(symbol, range, anchor); }, [symbol, range, anchor, load]);

  const analyze = () => { const s = input.trim().toUpperCase(); if (s) setSymbol(s); };

  const textColor = isDark ? '#7a8694' : '#6b7280';
  const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';

  // ─── Gráfica de precio con VWAP + niveles ───
  const hline = (val, color, label) => ({
    label, data: data ? data.closes.map(() => val) : [], borderColor: color, borderWidth: 1.5,
    borderDash: [5, 4], pointRadius: 0, fill: false, tension: 0,
  });
  const priceLabel = t('volProfilePage.priceLabel');
  const priceData = data ? {
    labels: data.closes.map(c => fmtDay(c.t)),
    datasets: [
      { label: priceLabel, data: data.closes.map(c => c.c), borderColor: '#3a8eff', backgroundColor: 'rgba(58,142,255,.08)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.2, fill: true },
      { label: 'VWAP', data: data.vwap.series.map(s => s.vwap), borderColor: '#c9a84c', borderWidth: 2, pointRadius: 0, tension: 0.2, fill: false, spanGaps: false },
      hline(data.poc, '#2ecc71', 'POC'),
      hline(data.vah, '#e67e22', 'VAH'),
      hline(data.val, '#9b59b6', 'VAL'),
    ],
  } : null;
  const priceOpts = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { color: textColor, font: { family: 'DM Mono', size: 10 }, boxWidth: 10, padding: 10, filter: (it) => [priceLabel, 'VWAP'].includes(it.text) } },
      tooltip: { backgroundColor: isDark ? '#181c22' : '#fff', titleColor: textColor, bodyColor: textColor, borderColor: isDark ? '#2d3540' : '#e2e4e8', borderWidth: 1, filter: (it) => [priceLabel, 'VWAP'].includes(it.dataset.label) },
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 }, maxTicksLimit: 12, autoSkip: true } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 10 }, callback: v => '$' + v } },
    },
  };

  // ─── Perfil de Volumen (barras horizontales) ───
  const barColor = (b) => b.isPOC ? '#c9a84c' : b.inVA ? 'rgba(46,204,113,.55)' : (isDark ? 'rgba(122,134,148,.35)' : 'rgba(107,114,128,.35)');
  const priceBinIdx = data ? data.bins.findIndex(b => data.price >= b.low && data.price < b.high) : -1;
  const vpData = data ? {
    labels: data.bins.map(b => b.mid),
    datasets: [{
      data: data.bins.map(b => b.volume), backgroundColor: data.bins.map(barColor),
      borderColor: data.bins.map((_, i) => i === priceBinIdx ? '#3a8eff' : 'rgba(0,0,0,0)'),
      borderWidth: data.bins.map((_, i) => i === priceBinIdx ? 2 : 0),
      borderSkipped: false, barPercentage: 0.95, categoryPercentage: 1,
    }],
  } : null;
  const vpOpts = {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { title: (it) => '$' + data.bins[it[0].dataIndex].low + '–' + data.bins[it[0].dataIndex].high, label: (c) => 'Vol: ' + fmtVol(c.parsed.x) }, backgroundColor: isDark ? '#181c22' : '#fff', titleColor: textColor, bodyColor: textColor, borderColor: isDark ? '#2d3540' : '#e2e4e8', borderWidth: 1 },
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 8 }, callback: v => fmtVol(v) } },
      y: { reverse: true, grid: { display: false }, ticks: { color: textColor, font: { family: 'DM Mono', size: 8 }, maxTicksLimit: 12, callback: function (v) { return '$' + this.getLabelForValue(v); } } },
    },
  };

  const cardBase = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' };
  const cap = { fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' };

  // Lectura institucional
  const aboveVWAP = data && data.vwap.value != null && data.price > data.vwap.value;
  const abovePOC = data && data.price > data.poc;
  const inVA = data && data.price >= data.val && data.price <= data.vah;
  const bias = !data ? '' : (aboveVWAP && abovePOC) ? t('volProfilePage.biasBullish')
    : (!aboveVWAP && !abovePOC) ? t('volProfilePage.biasBearish')
    : t('volProfilePage.biasNeutral');

  const stat = (label, value, sub, color) => <StatCard label={label} value={value} sub={sub} color={color} size={18} />;

  return (
    <div className="section active">
      {/* Intro */}
      <div style={{ ...cardBase, borderLeft: '4px solid var(--gold)', marginBottom: '18px' }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '16px', marginBottom: '6px' }}>{t('volProfilePage.title')}</div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.7 }}>
          {t('volProfilePage.subtitle1')} <b>{t('volProfilePage.reallyBold')}</b> {t('volProfilePage.subtitle2')} <b>{t('volProfilePage.pocBold')}</b> {t('volProfilePage.subtitle3')} <b>{t('volProfilePage.valueAreaBold')}</b> {t('volProfilePage.subtitle4')} <b>{t('volProfilePage.vwapAnchoredBold')}</b> {t('volProfilePage.subtitle5')}
        </div>
      </div>

      {/* Controles */}
      <div style={{ ...cardBase, marginBottom: '18px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '160px' }}>
            <label style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>{t('volProfilePage.tickerLabel')}</label>
            <input value={input} onChange={e => setInput(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && analyze()} placeholder="AAPL, MSFT…" style={{ width: '100%', marginTop: '4px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 10px', color: 'var(--text)', fontFamily: "'DM Mono',monospace", fontSize: '15px' }} />
          </div>
          <button className="btn btn-gold" onClick={analyze} disabled={loading}>{loading ? '⏳' : t('volProfilePage.analyze')}</button>
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '14px' }}>
          <div>
            <div style={{ fontSize: '9px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", marginBottom: '5px', letterSpacing: '1px' }}>{t('volProfilePage.rangeLabel')}</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{RANGES.map(([k, l]) => <button key={k} className={`filter-chip${range === k ? ' active' : ''}`} onClick={() => setRange(k)}>{l}</button>)}</div>
          </div>
          <div>
            <div style={{ fontSize: '9px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", marginBottom: '5px', letterSpacing: '1px' }}>{t('volProfilePage.anchorLabel')}</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{ANCHORS.map(([k, l]) => <button key={k} className={`filter-chip${anchor === k ? ' active' : ''}`} onClick={() => setAnchor(k)}>{l}</button>)}</div>
          </div>
        </div>
      </div>

      {data && (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,130px),1fr))', gap: '10px', marginBottom: '18px' }}>
            {stat(priceLabel, '$' + data.price, data.symbol, abovePOC ? 'var(--green)' : 'var(--red)')}
            {stat('POC', '$' + data.poc, t('volProfilePage.control'), '#c9a84c')}
            {stat('VAH', '$' + data.vah, t('volProfilePage.valueAreaUp'), '#e67e22')}
            {stat('VAL', '$' + data.val, t('volProfilePage.valueAreaDown'), '#9b59b6')}
            {stat('VWAP', data.vwap.value != null ? '$' + data.vwap.value : '—', t('volProfilePage.since', { date: data.vwap.anchorDate ? fmtDay(data.vwap.anchorDate) : '—' }), aboveVWAP ? 'var(--green)' : 'var(--red)')}
          </div>

          {/* Lectura */}
          <div style={{ ...cardBase, marginBottom: '18px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '13px', fontWeight: 600 }}>{bias}</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '11px', color: 'var(--muted)' }}>
              {t('volProfilePage.readingLine', { inOut: inVA ? t('volProfilePage.inside') : t('volProfilePage.outside'), overUnder1: abovePOC ? t('volProfilePage.over') : t('volProfilePage.under'), overUnder2: aboveVWAP ? t('volProfilePage.over') : t('volProfilePage.under') })}
            </div>
          </div>

          {/* Charts */}
          <div className="vp-charts">
            <div style={cardBase}>
              <div style={cap}>{t('volProfilePage.priceChartTitle')}</div>
              <div style={{ position: 'relative', height: '360px' }}>{!loading && priceData && <Line data={priceData} options={priceOpts} />}</div>
            </div>
            <div style={cardBase}>
              <div style={{ ...cap, display: 'flex', justifyContent: 'space-between' }}><span>{t('volProfilePage.vpChartTitle')}</span><span style={{ color: '#3a8eff', textTransform: 'none', letterSpacing: 0 }}>{t('volProfilePage.currentPrice')}</span></div>
              <div style={{ position: 'relative', height: '360px' }}>{!loading && vpData && <Bar data={vpData} options={vpOpts} />}</div>
            </div>
          </div>
        </>
      )}

      {loading && <div style={{ ...cardBase, textAlign: 'center', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", fontSize: '12px', padding: '40px' }}>{t('volProfilePage.analyzing', { symbol })}</div>}
      {!loading && !data && <div style={{ ...cardBase, textAlign: 'center', color: 'var(--muted)', fontSize: '12px', padding: '40px' }}>{t('volProfilePage.noDataPrefix')} <b>{symbol}</b>. {t('volProfilePage.noDataSuffix')}</div>}

      <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--surface2)', borderRadius: '8px', borderLeft: '3px solid var(--gold)', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.7 }}>
        {t('volProfilePage.footer')}
      </div>
    </div>
  );
}
