import React, { useState, useEffect } from 'react';
import { TOPIC_SHORT } from '../lib/format.js';
import { api } from '../lib/api.js';

// Recorta el perfil a una introducción breve: hasta ~700 caracteres (la intro
// IA en español ya viene acotada a ~110 palabras; este límite solo recorta el
// perfil largo en inglés de Alpha Vantage), cortando en el final de frase más
// cercano para no truncar a media palabra.
function brief(text, max = 700) {
  const t = (text || '').trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max);
  const dot = slice.lastIndexOf('. ');
  return (dot > max * 0.5 ? slice.slice(0, dot + 1) : slice.trimEnd()) + ' …';
}

export default function DetailModal({ asset, notes, onClose, onAddNote }) {
  // Hooks SIEMPRE antes del guard (reglas de React). `desc` es la descripción
  // mostrada; se sincroniza con el activo abierto y se actualiza al generar IA.
  const [desc, setDesc] = useState(asset?.description || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setDesc(asset?.description || '');
    setErr(null);
  }, [asset?.id, asset?.description]);

  if (!asset) return null;
  const linked = notes.filter(n => n.assetId === asset.id);
  const about = brief(desc);

  // Genera (o regenera con force) la intro en español vía IA y la guarda.
  const generate = async (force) => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.companyIntro(asset.id, force);
      if (r?.description) { setDesc(r.description); asset.description = r.description; }
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width:'740px' }}>
        <div>
          <div className="modal-title" style={{ marginBottom:'6px' }}>{asset.ticker} — {asset.name}</div>
          <div style={{ color:'var(--muted)', fontSize:'11px', fontFamily:"'DM Mono',monospace", marginBottom:'18px' }}>{asset.sector} · {asset.market}</div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'7px' }}>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', letterSpacing:'1px', textTransform:'uppercase' }}>Sobre la Empresa</div>
            <button className="btn btn-outline" disabled={busy} onClick={() => generate(!!about)} style={{ fontSize:'10px', padding:'3px 9px' }}>
              {busy ? '⏳…' : (about ? '🔄 Regenerar 🇪🇸' : '🇪🇸 Generar en español (IA)')}
            </button>
          </div>
          {err && <div style={{ fontSize:'11px', color:'var(--red)', marginBottom:'8px' }}>{err}</div>}
          {about
            ? <div style={{ fontSize:'13px', lineHeight:1.7, color:'var(--text)', marginBottom:'16px', padding:'13px', background:'var(--surface2)', borderRadius:'8px' }}>{about}</div>
            : <div style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'16px', padding:'13px', background:'var(--surface2)', borderRadius:'8px' }}>Sin descripción. Pulsa «Generar en español» para una intro breve de la empresa.</div>}
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
