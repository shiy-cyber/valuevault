import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const TOPICS = ['value','growth','analysis','macro','psychology','strategy'];

export default function LearnModal({ open, assets, linkedAssetId, onClose, onSave, toast }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ title:'', topic:'value', source:'', content:'', tags:'', assetId:'' });

  useEffect(() => {
    if (open) setForm({ title:'', topic:'value', source:'', content:'', tags:'', assetId: linkedAssetId ? String(linkedAssetId) : '' });
  }, [open, linkedAssetId]);

  if (!open) return null;
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  function save() {
    if (!form.title.trim() || !form.content.trim()) { toast(t('learnModal.errors.needTitleContent')); return; }
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
        <div className="modal-title">{t('learnModal.title')}</div>
        <div className="form-grid">
          <div className="form-group full"><label>{t('learnModal.fields.title')}</label>
            <input type="text" value={form.title} placeholder={t('learnModal.fields.titlePlaceholder')} onChange={e => set('title', e.target.value)} />
          </div>
          <div className="form-group"><label>{t('learnModal.fields.topic')}</label>
            <select value={form.topic} onChange={e => set('topic', e.target.value)}>
              {TOPICS.map(v => <option key={v} value={v}>{t('learnModal.topics.' + v)}</option>)}
            </select>
          </div>
          <div className="form-group"><label>{t('learnModal.fields.source')}</label>
            <input type="text" value={form.source} placeholder={t('learnModal.fields.sourcePlaceholder')} onChange={e => set('source', e.target.value)} />
          </div>
          <div className="form-group"><label>{t('learnModal.fields.linkAsset')}</label>
            <select value={form.assetId} onChange={e => set('assetId', e.target.value)}>
              <option value="">{t('learnModal.fields.noLink')}</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.ticker} — {a.name}</option>)}
            </select>
          </div>
          <div className="form-group full"><label>{t('learnModal.fields.content')}</label>
            <textarea style={{ minHeight:'120px' }} value={form.content} placeholder={t('learnModal.fields.contentPlaceholder')} onChange={e => set('content', e.target.value)} />
          </div>
          <div className="form-group full"><label>{t('learnModal.fields.tags')}</label>
            <input type="text" value={form.tags} placeholder={t('learnModal.fields.tagsPlaceholder')} onChange={e => set('tags', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>{t('learnModal.cancel')}</button>
          <button className="btn btn-gold" onClick={save}>{t('learnModal.save')}</button>
        </div>
      </div>
    </div>
  );
}
