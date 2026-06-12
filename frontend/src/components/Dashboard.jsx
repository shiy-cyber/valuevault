import React from 'react';
import AssetRow from './AssetRow.jsx';
import RiskPanel from './RiskPanel.jsx';
import { portfolioStats, fmtBase } from '../lib/format.js';

export default function Dashboard({ assets, notes, theme, fxRates, onNotes, onEdit, onDelete, onRefreshData, onRefreshQuality, goAssets, onRefresh, refreshing, lastRefresh }) {
  const noteCount = (id) => notes.filter(n => n.assetId === id).length;
  const lowRisk = assets.filter(a => a.risk === 'low').length;
  const recent = assets.slice(-5).reverse();
  const st = portfolioStats(assets, fxRates);
  const ret = st.returnPct;
  const retColor = ret === null ? 'var(--text)' : ret >= 0 ? 'var(--green)' : 'var(--red)';

  return (
    <div className="section active">
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Valor Cartera</div>
          <div className="kpi-value">{fmtBase(st.valueBase)}</div>
          <div className="kpi-sub">{st.sized} con tamaño{st.unsized ? ` · ${st.unsized} sin definir` : ''}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Rendimiento (ponderado, €)</div>
          <div className="kpi-value" style={{ color: retColor }}>{ret === null ? '—' : (ret >= 0 ? '+' : '') + ret.toFixed(2) + '%'}</div>
          <div className="kpi-sub">
            {st.pnlBase === null ? 'añade tamaño de posición' : `P&L ${fmtBase(st.pnlBase)}`}
            {st.currencyPct != null ? ` · divisa ${st.currencyPct >= 0 ? '+' : ''}${st.currencyPct.toFixed(1)}%` : ''}
          </div>
        </div>
        <div className="kpi-card"><div className="kpi-label">Riesgo Bajo</div><div className="kpi-value kpi-pos">{lowRisk}</div><div className="kpi-sub">percibido (manual)</div></div>
        <div className="kpi-card"><div className="kpi-label">Total Activos</div><div className="kpi-value">{assets.length}</div><div className="kpi-sub">en cartera</div></div>
      </div>

      <RiskPanel assets={assets} fxRates={fxRates} />

      <div className="section-header">
        <div className="section-title">Últimos Activos</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {lastRefresh && <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>↻ {lastRefresh}</span>}
          <button className="btn btn-outline" onClick={onRefresh} disabled={refreshing}>{refreshing ? '⏳ Actualizando…' : '↻ Actualizar precios'}</button>
          <button className="btn btn-outline" onClick={goAssets}>Ver todos →</button>
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
        {recent.length
          ? recent.map(a => <AssetRow key={a.id} a={a} noteCount={noteCount(a.id)} theme={theme} fxRates={fxRates} onNotes={onNotes} onEdit={onEdit} onDelete={onDelete} onRefreshData={onRefreshData} onRefreshQuality={onRefreshQuality} />)
          : <div className="empty-state"><div className="empty-icon">◈</div><div className="empty-text">Añade tu primer activo</div></div>}
      </div>
    </div>
  );
}
