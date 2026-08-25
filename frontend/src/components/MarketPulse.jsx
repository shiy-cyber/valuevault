import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import SparkChart from './shared/SparkChart.jsx';

// Índices clave para el vistazo rápido de "cómo está el mercado hoy".
const IDX = [
  { symbol: '^GSPC', label: 'S&P 500' },
  { symbol: '^NDX', label: 'Nasdaq 100' },
  { symbol: '^DJI', label: 'Dow Jones' },
];

const scoreColor = (v) => v == null ? '#7a8694' : v < 25 ? '#e74c3c' : v < 45 ? '#e67e22' : v < 55 ? '#c9a84c' : v < 75 ? '#2ecc71' : '#16a085';
const vixColor = (x) => x == null ? '#7a8694' : x < 13 ? '#16a085' : x < 20 ? '#2ecc71' : x < 30 ? '#c9a84c' : x < 40 ? '#e67e22' : '#e74c3c';
const chgColor = (c) => c == null ? '#7a8694' : c >= 0 ? '#2ecc71' : '#e74c3c';

function Spark({ points, color }) {
  if (!points || points.length < 2) return null;
  return <div style={{ height: '30px', width: '100%' }}><SparkChart points={points} color={color} borderWidth={1.5} /></div>;
}

// Franja compacta al inicio del Dashboard con la situación general del
// mercado (índices USA + VIX + Fear & Greed, con sparkline de 1 mes cada
// uno). Se recarga en cada apertura del Dashboard (mount) contra endpoints
// ya cacheados en backend (10 min cotizaciones/histórico, snapshot del cron
// para sentimiento) — barata de pedir.
export default function MarketPulse() {
  const { t } = useTranslation();
  const scoreZone = (v) => v == null ? '—' : v < 25 ? t('marketPulse.zones.extremeFear') : v < 45 ? t('marketPulse.zones.fear') : v < 55 ? t('marketPulse.zones.neutral') : v < 75 ? t('marketPulse.zones.greed') : t('marketPulse.zones.extremeGreed');
  const vixZone = (x) => x == null ? '—' : x < 13 ? t('marketPulse.vixZones.complacency') : x < 20 ? t('marketPulse.vixZones.calm') : x < 30 ? t('marketPulse.vixZones.caution') : x < 40 ? t('marketPulse.vixZones.fear') : t('marketPulse.vixZones.panic');
  const [quotes, setQuotes] = useState(null);
  const [hist, setHist] = useState({});
  const [fng, setFng] = useState(null);
  const [crypto, setCrypto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const symbols = [...IDX.map(i => i.symbol), '^VIX'];
      const [q, s, ...hs] = await Promise.all([
        api.quotes(symbols),
        api.sentiment(false).catch(() => null),
        ...symbols.map(sym => api.history(sym, '1mo').catch(() => null)),
      ]);
      setQuotes(q);
      setFng(s?.cnn ?? null);
      setCrypto(s?.crypto ?? null);
      const h = {};
      symbols.forEach((sym, i) => { h[sym] = hs[i]?.points?.map(p => p.close) ?? null; });
      setHist(h);
      setUpdatedAt(new Date());
    } catch {
      // silencioso: es un resumen informativo, no debe bloquear el resto del Dashboard
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const find = (sym) => quotes?.find(q => q.symbol === sym);
  const vix = find('^VIX');
  const fngSpark = (fng?.history || []).slice(-30).map(h => h.score);
  const cryptoSpark = (crypto?.history || []).slice(-30).map(h => h.value);

  const pill = (key, label, value, color, sub, sparkPoints) => (
    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '10px 16px', minWidth: '120px', flex: '1 1 120px' }}>
      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '.5px', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '16px', fontWeight: 700, color }}>{value}</span>
      {sub && <span style={{ fontSize: '9px', color: 'var(--muted)' }}>{sub}</span>}
      <Spark points={sparkPoints} color={color} />
    </div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '4px solid var(--gold)', borderRadius: '12px', marginBottom: '18px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '10px 16px', background: 'var(--surface2)', minWidth: '150px' }}>
        <span style={{ fontFamily: "'Playfair Display',serif", fontSize: '13px' }}>{t('marketPulse.title')}</span>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--muted)', cursor: 'pointer' }} onClick={load}>
          {loading ? t('marketPulse.loading') : updatedAt ? t('marketPulse.updated', { time: updatedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) }) : t('marketPulse.refresh')}
        </span>
      </div>

      {!loading && quotes && (
        <div style={{ display: 'flex', flexWrap: 'wrap', flex: 1 }}>
          {IDX.map(i => {
            const q = find(i.symbol);
            const chg = q?.changePercent;
            const color = chgColor(chg);
            return pill(i.symbol, i.label, chg == null ? '—' : `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`, color,
              q?.price ? q.price.toLocaleString('es-ES', { maximumFractionDigits: 0 }) : null, hist[i.symbol]);
          })}
          {pill('vix', 'VIX', vix?.price ?? '—', vixColor(vix?.price), vixZone(vix?.price), hist['^VIX'])}
          {fng && pill('fng', 'Fear & Greed', Math.round(fng.score), scoreColor(fng.score), scoreZone(fng.score), fngSpark)}
          {crypto?.value != null && pill('crypto', t('marketPulse.cryptoFng'), Math.round(crypto.value), scoreColor(crypto.value), scoreZone(crypto.value), cryptoSpark)}
        </div>
      )}
      {loading && <div style={{ padding: '10px 16px', fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>{t('marketPulse.loadingMarket')}</div>}
    </div>
  );
}
