import React from 'react';
import { TOPIC_SHORT } from '../lib/format.js';

export default function DetailModal({ asset, notes, onClose, onAddNote }) {
  if (!asset) return null;
  const linked = notes.filter(n => n.assetId === asset.id);

  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width:'740px' }}>
        <div>
          <div className="modal-title" style={{ marginBottom:'6px' }}>{asset.ticker} — {asset.name}</div>
          <div style={{ color:'var(--muted)', fontSize:'11px', fontFamily:"'DM Mono',monospace", marginBottom:'18px' }}>{asset.sector} · {asset.market}</div>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'7px' }}>Tesis de Inversión</div>
          <div style={{ fontSize:'13px', lineHeight:1.7, color:'var(--text)', marginBottom:'16px', padding:'13px', background:'var(--surface2)', borderRadius:'8px' }}>{asset.thesis || 'Sin tesis.'}</div>
          <div className="notes-panel">
            <div className="notes-panel-title">📝 Notas vinculadas ({linked.length})</div>
            {linked.length ? linked.map(n => (
              <div className="asset-note-item" key={n.id}>
                <strong>{n.title}</strong>{n.content}
                <div className="asset-note-date">{TOPIC_SHORT[n.topic] || n.topic} · {n.date}{n.source ? ' · ' + n.source : ''}</div>
              </div>
            )) : <div style={{ color:'var(--muted)', fontSize:'12px', padding:'6px 0' }}>Sin notas vinculadas aún.</div>}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
          <button className="btn btn-gold" onClick={() => onAddNote(asset.id)}>+ Añadir Nota</button>
        </div>
      </div>
    </div>
  );
}
