import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import SparkChart from './shared/SparkChart.jsx';

// Mismos umbrales/colores que la página Macro dedicada (Macro.jsx) — el
// backend siempre devuelve el status de la curva en español.
const statusColor = (s) => s === 'Invertida' ? '#e74c3c' : s === 'Plana' ? '#c9a84c' : s === 'Normal' ? '#2ecc71' : '#7a8694';
const inflColor = (v) => v == null ? '#7a8694' : v <= 2.2 ? '#2ecc71' : v <= 3 ? '#c9a84c' : '#e74c3c';
const unempColor = (v) => v == null ? '#7a8694' : v <= 4 ? '#2ecc71' : v <= 5 ? '#c9a84c' : '#e74c3c';

function Spark({ points, color }) {
  if (!points || points.length < 2) return null;
  return <div style={{ height: '30px', width: '100%' }}><SparkChart points={points} color={color} borderWidth={1.5} /></div>;
}

// Franja compacta de macro (curva 10Y-2Y, Core CPI, tipo Fed, paro) justo
// debajo del Pulso del Mercado — mismo endpoint /api/macro que ya usa la
// página Macro dedicada (snapshot del cron, barato) reducido a los 4 datos
// de más impacto para verlos sin salir del Dashboard.
export default function MacroPulse() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [macro, setMacro] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.macro(false);
      setMacro(d);
      setUpdatedAt(new Date());
    } catch {
      // silencioso: es un resumen informativo, no debe bloquear el resto del Dashboard
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const curve = macro?.curve, infl = macro?.inflation, econ = macro?.economics;
  const spread = curve?.spread10_2;

  const pill = (key, label, value, color, sub, sparkPoints) => (
    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '10px 16px', minWidth: '120px', flex: '1 1 120px' }}>
      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '.5px', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '16px', fontWeight: 700, color }}>{value}</span>
      {sub && <span style={{ fontSize: '9px', color: 'var(--muted)' }}>{sub}</span>}
      <Spark points={sparkPoints} color={color} />
    </div>
  );

  // spread10_2 SIEMPRE llega como objeto (status/history incluidos) aunque a
  // Yahoo le falte el tramo 2Y o 10Y — value puede ser null ahí dentro, así
  // que se comprueba value explícitamente (spread por sí solo es truthy igual).
  const hasData = !!(spread?.value != null || infl?.coreCPI || infl?.fedFunds || econ?.unemployment);

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '4px solid var(--gold)', borderRadius: '12px', marginBottom: '18px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '10px 16px', background: 'var(--surface2)', minWidth: '150px' }}>
        <span style={{ fontFamily: "'Playfair Display',serif", fontSize: '13px' }}>{t('macroPulse.title')}</span>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--gold)', cursor: 'pointer' }} onClick={() => navigate('/macro')}>
          {t('macroPulse.seeMore')}
        </span>
      </div>

      {!loading && hasData && (
        <div style={{ display: 'flex', flexWrap: 'wrap', flex: 1 }}>
          {spread?.value != null && pill('spread', t('macroPulse.spread102'), `${spread.value > 0 ? '+' : ''}${spread.value}%`, statusColor(spread.status), spread.status, (spread.history || []).map(h => h.spread))}
          {infl?.coreCPI && pill('coreCpi', t('macroPulse.coreCpi'), `${infl.coreCPI.value}%`, inflColor(infl.coreCPI.value), t('macroPage.yoy'))}
          {infl?.fedFunds && pill('fedFunds', t('macroPulse.fedRate'), `${infl.fedFunds.value}%`, '#c9a84c', t('macroPage.effr'))}
          {econ?.unemployment && pill('unemployment', t('macroPulse.unemployment'), `${econ.unemployment.value}%`, unempColor(econ.unemployment.value), null)}
        </div>
      )}
      {loading && <div style={{ padding: '10px 16px', fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>{t('marketPulse.loadingMarket')}</div>}
      {!loading && !hasData && <div style={{ padding: '10px 16px', fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>{t('macroPage.notAvailable')}</div>}
    </div>
  );
}
