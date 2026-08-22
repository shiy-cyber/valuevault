import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api.js';
import { timeAgo } from '../../lib/format.js';

const toIso = (s) => (s ? String(s).replace(' ', 'T') + 'Z' : null);
const fmtBytes = (n) => n > 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
const MAX_MB = 4;

// Sección Tesis de Inversión — PDFs subidos por usuarios registrados,
// con vista pública. Coherente con el patrón de Comunidad (login/alias gate).
export default function Thesis({ user, needsAlias, onEditAlias, onLogin, onTicker, toast }) {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [title, setTitle] = useState('');
  const [ticker, setTicker] = useState('');
  const [summary, setSummary] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.listTheses().then(r => { setItems(r.theses); setCursor(r.nextCursor); })
      .catch(e => toast?.(t('toast.error', { message: e.message })))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.listTheses(cursor);
      setItems(prev => [...prev, ...r.theses]);
      setCursor(r.nextCursor);
    } catch (e) { toast?.(t('toast.error', { message: e.message })); }
    finally { setLoadingMore(false); }
  };

  const onPickFile = (e) => {
    const f = e.target.files?.[0] || null;
    if (f && f.size > MAX_MB * 1024 * 1024) {
      toast?.(t('thesisPage.fileTooLarge', { mb: MAX_MB }));
      e.target.value = '';
      setFile(null);
      return;
    }
    setFile(f);
  };

  const upload = async () => {
    if (!title.trim() || !file || uploading) return;
    setUploading(true);
    try {
      const thesis = await api.uploadThesis({ title: title.trim(), ticker: ticker.trim(), summary: summary.trim(), file });
      setItems(prev => [thesis, ...prev]);
      setTitle(''); setTicker(''); setSummary(''); setFile(null);
      const el = document.getElementById('thesisFileInput');
      if (el) el.value = '';
      toast?.(t('thesisPage.publishedToast'));
    } catch (e) { toast?.(t('toast.error', { message: e.message })); }
    finally { setUploading(false); }
  };

  const remove = async (thesis) => {
    if (!window.confirm(t('thesisPage.confirmDelete'))) return;
    try {
      await api.deleteThesis(thesis.id);
      setItems(prev => prev.filter(x => x.id !== thesis.id));
      toast?.(t('thesisPage.deletedToast'));
    } catch (e) { toast?.(t('toast.error', { message: e.message })); }
  };

  return (
    <div className="section active">
      {!user ? (
        <div className="learn-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px' }}>{t('thesisPage.loginPrompt')}</div>
          <button className="btn btn-gold" onClick={onLogin}>{t('auth.titles.login')}</button>
        </div>
      ) : needsAlias ? (
        <div className="learn-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px' }}>{t('thesisPage.aliasPrompt')}</div>
          <button className="btn btn-gold" onClick={onEditAlias}>{t('thesisPage.createAlias')}</button>
        </div>
      ) : (
        <div className="learn-card">
          <div className="label" style={{ marginBottom: '8px' }}>{t('thesisPage.uploadLabel', { mb: MAX_MB })}</div>
          <input type="text" placeholder={t('thesisPage.titlePlaceholder')} value={title} onChange={e => setTitle(e.target.value)}
            maxLength={140} style={{ width: '100%', marginBottom: '8px' }} />
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input type="text" placeholder={t('thesisPage.tickerPlaceholder')} value={ticker} onChange={e => setTicker(e.target.value)}
              maxLength={12} style={{ width: '140px' }} />
            <input id="thesisFileInput" type="file" accept="application/pdf,.pdf" onChange={onPickFile} style={{ flex: 1 }} />
          </div>
          <textarea placeholder={t('thesisPage.summaryPlaceholder')} value={summary} onChange={e => setSummary(e.target.value)}
            maxLength={500} rows={2} style={{ width: '100%', marginBottom: '8px', resize: 'vertical' }} />
          <button className="btn btn-gold" disabled={!title.trim() || !file || uploading} onClick={upload}>
            {uploading ? t('thesisPage.uploading') : t('thesisPage.publish')}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '12px', marginTop: '20px' }}>{t('common.loadingPlain')}</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '12px', marginTop: '20px' }}>{t('thesisPage.empty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>
          {items.map(th => {
            const a = th.author || {};
            const mine = user && a.id === user.id;
            return (
              <div key={th.id} className="learn-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ fontSize: '24px', lineHeight: 1 }}>{a.avatar || '📄'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{a.displayName || t('postCard.anonymous')}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>
                      @{a.handle || '—'} · {timeAgo(toIso(th.createdAt), t) || ''}
                    </div>
                  </div>
                  {mine && <button className="card-btn" title={t('postCard.deleteTitle')} onClick={() => remove(th)} style={{ flex: 'none' }}>🗑</button>}
                </div>

                <div style={{ marginTop: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{th.title}</span>
                    {th.ticker && (
                      <span onClick={onTicker ? () => onTicker(th.ticker) : undefined}
                        style={{ fontSize: '11px', fontFamily: "'DM Mono',monospace", color: 'var(--gold)', cursor: onTicker ? 'pointer' : 'default', border: '1px solid var(--border)', borderRadius: '999px', padding: '1px 8px' }}>
                        ${th.ticker}
                      </span>
                    )}
                  </div>
                  {th.summary && <div style={{ fontSize: '12.5px', color: 'var(--text)', marginTop: '6px', lineHeight: 1.55 }}>{th.summary}</div>}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                  <a href={api.thesisPdfUrl(th.id)} target="_blank" rel="noreferrer" className="btn btn-outline" style={{ fontSize: '11px', padding: '6px 12px' }}>
                    {t('thesisPage.viewPdf')}
                  </a>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{th.fileName} · {fmtBytes(th.fileSize)}</span>
                </div>
              </div>
            );
          })}
          {cursor && (
            <button className="btn btn-outline" onClick={loadMore} disabled={loadingMore} style={{ alignSelf: 'center', fontSize: '12px' }}>
              {loadingMore ? t('common.loadingPlain') : t('tickerPage.loadMore')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
