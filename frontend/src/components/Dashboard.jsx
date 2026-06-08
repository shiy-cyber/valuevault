import React from 'react';
import AssetRow from './AssetRow.jsx';
import { avgPnl } from '../lib/format.js';

export default function Dashboard({ assets, notes, theme, onNotes, onEdit, onDelete, onRefreshData, goAssets, onRefresh, refreshing, lastRefresh }) {
  const noteCount = (id) => notes.filter(n => n.assetId === id).length;
  const lowRisk = assets.filter(a => a.risk === 'low').length;
  const recent = assets.slice(-5).reverse();
  const pnl = avgPnl(assets);
  const pnlColor = pnl === null ? 'var(--text)' : pnl >= 0 ? 'var(--green)' : 'var(--red)';

  return (
    <div className="section active">
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Total Activos</div><div className="kpi-value">{assets.length}</div><div className="kpi-sub">en cartera</div></div>
        <div className="kpi-card">
          <div className="kpi-label">Rendimiento Medio</div>
          <div className="kpi-value" style={{ color: pnlColor }}>{pnl === null ? '—' : (pnl >= 0 ? '+' : '') + pnl.toFixed(2) + '%'}</div>
          <div className="kpi-sub">desde precio de entrada</div>
        </div>
        <div className="kpi-card"><div className="kpi-label">Riesgo Bajo</div><div className="kpi-value kpi-pos">{lowRisk}</div><div className="kpi-sub">en cartera</div></div>
        <div className="kpi-card"><div className="kpi-label">Notas</div><div className="kpi-value">{notes.length}</div><div className="kpi-sub">de aprendizaje</div></div>
      </div>
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
          ? recent.map(a => <AssetRow key={a.id} a={a} noteCount={noteCount(a.id)} theme={theme} onNotes={onNotes} onEdit={onEdit} onDelete={onDelete} onRefreshData={onRefreshData} />)
          : <div className="empty-state"><div className="empty-icon">◈</div><div className="empty-text">Añade tu primer activo</div></div>}
      </div>
    </div>
  );
}
