import React from 'react';
import AssetRow from './AssetRow.jsx';

// Lista de seguimiento: activos que vigilas sin tenerlos en cartera.
export default function Watchlist({ assets, notes, theme, onNotes, onEdit, onDelete, onAdd }) {
  const noteCount = (id) => notes.filter(n => n.assetId === id).length;

  return (
    <div className="section active">
      <div className="section-header">
        <div>
          <div className="section-title">Watchlist</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", marginTop: '3px' }}>Activos en seguimiento — vigilados sin estar en cartera</div>
        </div>
        <button className="btn btn-gold" onClick={onAdd}>+ Añadir a Watchlist</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
        {assets.length
          ? assets.map(a => <AssetRow key={a.id} a={a} noteCount={noteCount(a.id)} theme={theme} onNotes={onNotes} onEdit={onEdit} onDelete={onDelete} />)
          : <div className="empty-state"><div className="empty-icon">★</div><div className="empty-text">Tu watchlist está vacía. Añade activos para seguirlos sin comprarlos.</div></div>}
      </div>
    </div>
  );
}
