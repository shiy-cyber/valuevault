import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, Line } from 'react-chartjs-2';
import { api } from '../lib/api.js';
import StatCard from './shared/StatCard.jsx';

const bn = (v) => v == null ? '—' : (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2) + ' bn' : (v / 1e6).toFixed(0) + ' M');

export default function Gamma({ theme, toast }) {
  const { t } = useTranslation();
  const [symbol, setSymbol] = useState('SPY');
  const [input, setInput] = useState('SPY');
  const [date, setDate] = useState(null);       // unix de la expiración elegida
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const isDark = theme === 'dark';

  const load = useCallback(async (sym, d) => {
    setLoading(true);
    try { setData(await api.gamma(sym, d)); }
    catch (e) { toast?.(t('toast.error', { message: e.message || t('volProfilePage.couldNotLoadSym', { sym }) })); setData(null); }
    finally { setLoading(false); }
  }, [toast, t]);

  useEffect(() => { load(symbol, date); }, [symbol, date, load]);
  const analyze = () => { const s = input.trim().toUpperCase(); if (s) { setDate(null); setSymbol(s); } };

  const textColor = isDark ? '#7a8694' : '#6b7280';
  const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';
  const cardBase = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' };
  const cap = { fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' };

  const posColor = '#2ecc71', negColor = '#e74c3c', spotColor = '#3a8eff', flipColor = '#c9a84c';
  const tipBox = { backgroundColor: isDark ? '#181c22' : '#fff', titleColor: textColor, bodyColor: textColor, borderColor: isDark ? '#2d3540' : '#e2e4e8', borderWidth: 1 };

  // ── 1) Perfil por strike (barras horizontales, strike más alto arriba) ──
  // Limita a los ~40 strikes con mayor gamma (los relevantes) para que la
  // gráfica no crezca sin control en subyacentes con cientos de strikes.
  const MAX_STRIKES = 40;
  const byStrike = data
    ? [...data.strikes].sort((a, b) => Math.abs(b.netGEX) - Math.abs(a.netGEX)).slice(0, MAX_STRIKES).sort((a, b) => b.strike - a.strike)
    : [];
  const isWall = (s) => s === data?.callWall || s === data?.putWall;
  const barData = data ? {
    labels: byStrike.map(s => s.strike),
    datasets: [{
      label: 'GEX neto',
      data: byStrike.map(s => +(s.netGEX / 1e6).toFixed(1)), // $M
      backgroundColor: byStrike.map(s => (s.netGEX >= 0 ? posColor : negColor) + (isWall(s.strike) ? 'ff' : '99')),
      borderColor: byStrike.map(s => isWall(s.strike) ? flipColor : 'transparent'),
      borderWidth: byStrike.map(s => isWall(s.strike) ? 1.5 : 0),
    }],
  } : null;
  const barOpts = {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { ...tipBox, callbacks: {
        title: (it) => t('gammaPage.strikeLabel', { strike: it[0].label }) + (isWall(+it[0].label) ? (+it[0].label === data.callWall ? t('gammaPage.callWallSuffix') : t('gammaPage.putWallSuffix')) : ''),
        label: (c) => `GEX ${c.parsed.x >= 0 ? '+' : ''}${c.parsed.x} M$ /1%`,
        afterLabel: (c) => { const s = byStrike[c.dataIndex]; return t('gammaPage.oiLine', { call: s.callOI, put: s.putOI }); },
      } },
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 }, callback: v => v + 'M' } },
      y: { grid: { display: false }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 }, autoSkip: true, maxTicksLimit: 22 } },
    },
  };

  // ── 2) Curva de gamma (flip): GEX total vs precio; cruza cero en el flip ──
  const lineData = data ? {
    datasets: [{
      label: 'GEX total',
      data: data.profile.map(pt => ({ x: pt.p, y: +(pt.g / 1e9).toFixed(3) })), // $bn
      borderWidth: 2, pointRadius: 0, tension: 0.2, fill: { target: 'origin' },
      segment: {
        borderColor: c => (c.p1.parsed.y >= 0 ? posColor : negColor),
        backgroundColor: c => (c.p1.parsed.y >= 0 ? posColor : negColor) + '22',
      },
    }],
  } : null;
  const lineOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { ...tipBox, callbacks: {
        title: (it) => t('gammaPage.priceLabel', { price: it[0].parsed.x.toFixed(2) }),
        label: (c) => `GEX ${c.parsed.y >= 0 ? '+' : ''}${c.parsed.y} bn$ /1%`,
      } },
    },
    scales: {
      x: { type: 'linear', grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 }, callback: v => '$' + v } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 }, callback: v => v + 'bn' } },
    },
  };
  // Plugin: líneas horizontales de spot y flip sobre el perfil por strike.
  // El eje Y es categórico (strikes), así que interpolamos la posición del
  // precio entre los dos strikes que lo rodean.
  const barRefs = {
    id: 'gammaBarRefs',
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      const n = byStrike.length;
      if (!n) return;
      const yFor = (price) => {
        if (price == null) return null;
        if (price >= byStrike[0].strike) return chartArea.top + (0.5 / n) * chartArea.height;
        if (price <= byStrike[n - 1].strike) return chartArea.top + ((n - 0.5) / n) * chartArea.height;
        for (let i = 0; i < n - 1; i++) {
          const hi = byStrike[i].strike, lo = byStrike[i + 1].strike;
          if (price <= hi && price >= lo) {
            const f = (hi - price) / ((hi - lo) || 1);
            return chartArea.top + ((i + f + 0.5) / n) * chartArea.height;
          }
        }
        return null;
      };
      // labelBelow: cuando spot y flip están muy cerca, sus líneas casi se
      // superponen — si los dos textos se dibujaran siempre por encima de su
      // línea, quedarían pintados uno sobre el otro. Poniendo el de flip
      // siempre por debajo (y el de spot siempre por encima) nunca chocan,
      // aunque las dos líneas coincidan en el mismo píxel.
      const hline = (price, color, label, labelBelow) => {
        const y = yFor(price);
        if (y == null) return;
        ctx.save();
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(chartArea.left, y); ctx.lineTo(chartArea.right, y); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = color; ctx.font = "10px 'DM Mono', monospace"; ctx.textAlign = 'right';
        ctx.fillText(label, chartArea.right - 4, labelBelow ? y + 11 : y - 3); ctx.textAlign = 'left';
        ctx.restore();
      };
      hline(data?.spot, spotColor, 'spot $' + data?.spot, false);
      hline(data?.gammaFlip, flipColor, 'flip $' + data?.gammaFlip, true);
    },
  };

  // Plugin: líneas verticales de spot y flip + base cero sobre la curva
  const refLines = {
    id: 'gammaRefs',
    afterDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      // Igual que en el perfil por strike: si spot y flip están muy cerca, sus
      // líneas casi coinciden en X — apilamos las etiquetas en vertical (una
      // más abajo que la otra) para que nunca se solapen.
      const vline = (val, color, label, row) => {
        if (val == null) return;
        const x = scales.x.getPixelForValue(val);
        if (x < chartArea.left || x > chartArea.right) return;
        ctx.save();
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = color; ctx.font = "10px 'DM Mono', monospace";
        ctx.fillText(label, x + 4, chartArea.top + 11 + row * 13);
        ctx.restore();
      };
      vline(data?.spot, spotColor, 'spot $' + data?.spot, 0);
      vline(data?.gammaFlip, flipColor, 'flip $' + data?.gammaFlip, 1);
    },
  };

  const stat = (label, value, sub, color) => <StatCard label={label} value={value} sub={sub} color={color} />;

  const regimePos = data?.regime === 'positive';
  const flipVsSpot = data && data.gammaFlip != null ? (data.spot >= data.gammaFlip ? t('gammaPage.above') : t('gammaPage.below')) : null;

  return (
    <div className="section active">
      <div style={{ ...cardBase, borderLeft: '4px solid var(--gold)', marginBottom: '18px' }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '16px', marginBottom: '6px' }}>{t('gammaPage.title')} <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--gold)', border: '1px solid rgba(201,168,76,.3)', padding: '1px 7px', borderRadius: '10px', verticalAlign: 'middle' }}>{t('guide.tags.opciones').toUpperCase()}</span></div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.7 }}>
          {t('gammaPage.subtitlePrefix')} <b>{t('gammaPage.dealersBold')}</b> {t('gammaPage.subtitle2')} <b>GEX &gt; 0</b> {t('gammaPage.subtitle3')} <b>{t('gammaPage.dampenBold')}</b> {t('gammaPage.subtitle4')} <b>GEX &lt; 0</b> {t('gammaPage.subtitle5')} <b>{t('gammaPage.amplifyBold')}</b> {t('gammaPage.subtitle6')} <b>{t('gammaPage.gammaFlipBold')}</b> {t('gammaPage.subtitle7')} <b>{t('gammaPage.callPutWallBold')}</b> {t('gammaPage.subtitle8')}
        </div>
      </div>

      {/* Controles */}
      <div style={{ ...cardBase, marginBottom: '18px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '160px' }}>
            <label style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>{t('gammaPage.tickerLabel')}</label>
            <input value={input} onChange={e => setInput(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && analyze()} placeholder="SPY, QQQ, NVDA…" style={{ width: '100%', marginTop: '4px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 10px', color: 'var(--text)', fontFamily: "'DM Mono',monospace", fontSize: '15px' }} />
          </div>
          <button className="btn btn-gold" onClick={analyze} disabled={loading}>{loading ? '⏳' : t('volProfilePage.analyze')}</button>
          {data && data.expirations?.length > 0 && (
            <div style={{ minWidth: '150px' }}>
              <label style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>{t('gammaPage.expiration')}</label>
              <select value={date ?? data.expirationDate} onChange={e => { const v = e.target.value; setDate(v === 'all' ? 'all' : Number(v)); }} style={{ width: '100%', marginTop: '4px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 10px', color: 'var(--text)', fontFamily: "'DM Mono',monospace", fontSize: '13px' }}>
                <option value="all">{t('gammaPage.aggregatedAll')}</option>
                {data.expirations.map(e => <option key={e.date} value={e.date}>{e.label}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: '10px', marginBottom: '18px' }}>
            {stat(t('volProfilePage.priceLabel'), '$' + data.spot, `${data.symbol} · ${data.aggregated ? t('gammaPage.nExpirationsAgg', { n: data.nExpirations }) : t('gammaPage.daysToExpiry', { d: data.daysToExpiry })}`)}
            {stat(t('gammaPage.netGex'), (data.netGEX >= 0 ? '+' : '−') + '$' + bn(Math.abs(data.netGEX)), regimePos ? t('gammaPage.longGamma') : t('gammaPage.shortGamma'), regimePos ? posColor : negColor)}
            {stat(t('gammaPage.gammaFlip'), data.gammaFlip != null ? '$' + data.gammaFlip : '—', flipVsSpot ? t('gammaPage.priceAt', { pos: flipVsSpot }) : t('gammaPage.noCross'), 'var(--gold)')}
            {stat(t('gammaPage.callWall'), data.callWall != null ? '$' + data.callWall : '—', t('smcPage.resistance'), negColor)}
            {stat(t('gammaPage.putWall'), data.putWall != null ? '$' + data.putWall : '—', t('smcPage.support'), posColor)}
            {stat(t('gammaPage.putCallOi'), data.putCallOI != null ? String(data.putCallOI) : '—', t('gammaPage.oiRatio'))}
          </div>

          <div style={{ ...cardBase, marginBottom: '18px' }}>
            <div style={{ ...cap, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span>{t('gammaPage.strikeProfileTitle')} · {data.aggregated ? t('gammaPage.nExpirationsAgg', { n: data.nExpirations }) : t('gammaPage.expiryLabel', { expiry: data.expiry })} <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--muted)' }}>{t('gammaPage.topByGamma', { n: byStrike.length })}</span></span>
              <span style={{ textTransform: 'none', letterSpacing: 0 }}><span style={{ color: posColor }}>■</span> + · <span style={{ color: negColor }}>■</span> − · <span style={{ color: flipColor }}>▭</span> wall · <span style={{ color: spotColor }}>┄</span> spot · <span style={{ color: flipColor }}>┄</span> flip</span>
            </div>
            <div style={{ position: 'relative', height: '360px' }}>{!loading && barData && <Bar data={barData} options={barOpts} plugins={[barRefs]} />}</div>
          </div>

          <div style={{ ...cardBase, marginBottom: '18px' }}>
            <div style={{ ...cap, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span>{t('gammaPage.curveTitle')}</span>
              <span style={{ textTransform: 'none', letterSpacing: 0 }}><span style={{ color: spotColor }}>┊</span> spot · <span style={{ color: flipColor }}>┊</span> flip · <span style={{ color: posColor }}>■</span> {t('gammaPage.longShort.long')} / <span style={{ color: negColor }}>■</span> {t('gammaPage.longShort.short')}</span>
            </div>
            <div style={{ position: 'relative', height: '300px' }}>{!loading && lineData && <Line data={lineData} options={lineOpts} plugins={[refLines]} />}</div>
          </div>
        </>
      )}

      {loading && <div style={{ ...cardBase, textAlign: 'center', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", fontSize: '12px', padding: '40px' }}>{t('gammaPage.calculating', { symbol })}</div>}
      {!loading && !data && <div style={{ ...cardBase, textAlign: 'center', color: 'var(--muted)', fontSize: '12px', padding: '40px' }}>{t('gammaPage.noChainPrefix')} <b>{symbol}</b>. {t('gammaPage.noChainSuffix')}</div>}

      <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--surface2)', borderRadius: '8px', borderLeft: '3px solid var(--gold)', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.7 }}>
        {t('gammaPage.footerPrefix')} {data?.aggregated ? t('gammaPage.footerAggregated', { n: data.nExpirations }) : t('gammaPage.footerSingle')}. {t('gammaPage.footerSuffix')}
      </div>
    </div>
  );
}
