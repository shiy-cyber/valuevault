import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api.js';
import PostCard from './PostCard.jsx';

// Página de un $TICKER: todas las publicaciones que lo mencionan. Ruta /comunidad/ticker/:symbol.
export default function TickerPage({ currentUser, canInteract, onBack, onProfile, onTicker, requireInteract, toast }) {
  const { t } = useTranslation();
  const { symbol: ticker } = useParams();
  const [posts, setPosts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.tickerPosts(ticker)
      .then(r => { setPosts(r.posts); setCursor(r.nextCursor); })
      .catch(e => toast?.(t('toast.error', { message: e.message })))
      .finally(() => setLoading(false));
  }, [ticker, toast]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    try { const r = await api.tickerPosts(ticker, cursor); setPosts(prev => [...prev, ...r.posts]); setCursor(r.nextCursor); }
    catch (e) { toast?.(t('toast.error', { message: e.message })); }
  };

  const removePost = async (post) => {
    if (!window.confirm(t('tickerPage.confirmDelete'))) return;
    try { await api.deletePost(post.id); setPosts(prev => prev.filter(p => p.id !== post.id)); }
    catch (e) { toast?.(t('toast.error', { message: e.message })); }
  };

  return (
    <div className="section active">
      <button className="btn btn-outline" onClick={onBack} style={{ marginBottom: '14px' }}>{t('tickerPage.back')}</button>
      <div className="learn-card" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ fontSize: '26px' }}>📈</div>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--gold)', fontFamily: "'DM Mono',monospace" }}>${ticker}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('tickerPage.subtitle')}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '18px' }}>
        {loading ? (
          <div className="empty-state"><div className="empty-icon">⏳</div><div className="empty-text">{t('common.loadingPlain')}</div></div>
        ) : posts.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">🗣</div><div className="empty-text">{t('tickerPage.empty', { ticker })}</div></div>
        ) : (
          <>
            {posts.map(p => (
              <PostCard key={p.id} post={p} currentUserId={currentUser?.id} canInteract={canInteract}
                onDelete={removePost} onTicker={onTicker} onHandle={onProfile} onAuthor={onProfile}
                requireInteract={requireInteract} toast={toast} />
            ))}
            {cursor && <button className="btn btn-outline" onClick={loadMore} style={{ alignSelf: 'center' }}>{t('tickerPage.loadMore')}</button>}
          </>
        )}
      </div>
    </div>
  );
}
