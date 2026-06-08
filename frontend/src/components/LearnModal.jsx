import React, { useState, useEffect } from 'react';

const TOPICS = [['value','Value Investing'],['growth','Growth'],['analysis','Análisis'],['macro','Macro'],['psychology','Psicología'],['strategy','Estrategia']];

export default function LearnModal({ open, assets, linkedAssetId, onClose, onSave, toast }) {
  const [form, setForm] = useState({ title:'', topic:'value', source:'', content:'', tags:'', assetId:'' });

  useEffect(() => {
    if (open) setForm({ title:'', topic:'value', source:'', content:'', tags:'', assetId: linkedAssetId ? String(linkedAssetId) : '' });
  }, [open, linkedAssetId]);

  if (!open) return null;
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  function save() {
    if (!form.title.trim() || !form.content.trim()) { toast('Introduce título y contenido'); return; }
    onSave({
      title: form.title.trim(), topic: form.topic, source: form.source.trim(),
      content: form.content.trim(),
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      assetId: form.assetId ? Number(form.assetId) : null,
    });
  }

  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-title">Añadir Nota de Aprendizaje</div>
        <div className="form-grid">
          <div className="form-group full"><label>Título</label>
            <input type="text" value={form.title} placeholder="ej. Margen de Seguridad en Graham" onChange={e => set('title', e.target.value)} />
          </div>
          <div className="form-group"><label>Tema / Categoría</label>
            <select value={form.topic} onChange={e => set('topic', e.target.value)}>
              {TOPICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Fuente / Referencia</label>
            <input type="text" value={form.source} placeholder="ej. El Inversor Inteligente" onChange={e => set('source', e.target.value)} />
          </div>
          <div className="form-group"><label>Vincular a Activo (opcional)</label>
            <select value={form.assetId} onChange={e => set('assetId', e.target.value)}>
              <option value="">Sin vincular</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.ticker} — {a.name}</option>)}
            </select>
          </div>
          <div className="form-group full"><label>Contenido</label>
            <textarea style={{ minHeight:'120px' }} value={form.content} placeholder="Escribe tu aprendizaje, insight o resumen…" onChange={e => set('content', e.target.value)} />
          </div>
          <div className="form-group full"><label>Tags (separados por coma)</label>
            <input type="text" value={form.tags} placeholder="ej. Graham, PER, margen, deuda" onChange={e => set('tags', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-gold" onClick={save}>Guardar Nota</button>
        </div>
      </div>
    </div>
  );
}
