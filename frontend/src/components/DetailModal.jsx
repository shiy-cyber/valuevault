import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';

const TOPIC_KEYS = ['value','growth','analysis','macro','psychology','strategy'];

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
  const { t } = useTranslation();
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
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', letterSpacing:'1px', textTransform:'uppercase' }}>{t('assetRow.companyIntro.title')}</div>
            <button className="btn btn-outline" disabled={busy} onClick={() => generate(!!about)} style={{ fontSize:'10px', padding:'3px 9px' }}>
              {busy ? t('common.busy') : (about ? t('assetRow.companyIntro.regenerate') : t('assetRow.companyIntro.generate'))}
            </button>
          </div>
          {err && <div style={{ fontSize:'11px', color:'var(--red)', marginBottom:'8px' }}>{err}</div>}
          {about
            ? <div style={{ fontSize:'13px', lineHeight:1.7, color:'var(--text)', marginBottom:'16px', padding:'13px', background:'var(--surface2)', borderRadius:'8px' }}>{about}</div>
            : <div style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'16px', padding:'13px', background:'var(--surface2)', borderRadius:'8px' }}>{t('assetRow.companyIntro.empty')}</div>}
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'7px' }}>{t('assetRow.sections.thesis')}</div>
          <div style={{ fontSize:'13px', lineHeight:1.7, color:'var(--text)', marginBottom:'16px', padding:'13px', background:'var(--surface2)', borderRadius:'8px' }}>{asset.thesis || t('detailModal.noThesis')}</div>
          <div className="notes-panel">
            <div className="notes-panel-title">{t('detailModal.linkedNotes', { count: linked.length })}</div>
            {linked.length ? linked.map(n => (
              <div className="asset-note-item" key={n.id}>
                <strong>{n.title}</strong>{n.content}
                <div className="asset-note-date">{TOPIC_KEYS.includes(n.topic) ? t('detailModal.topicsShort.' + n.topic) : n.topic} · {n.date}{n.source ? ' · ' + n.source : ''}</div>
              </div>
            )) : <div style={{ color:'var(--muted)', fontSize:'12px', padding:'6px 0' }}>{t('detailModal.noLinkedNotes')}</div>}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>{t('detailModal.close')}</button>
          <button className="btn btn-gold" onClick={() => onAddNote(asset.id)}>{t('detailModal.addNote')}</button>
        </div>
      </div>
    </div>
  );
}
