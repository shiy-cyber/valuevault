import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api.js';
import PostCard from './PostCard.jsx';

const MAX = 500;

// Sección Comunidad — Fase 1: identidad pública + feed global.
export default function Community({ user, profile, needsAlias, onEditAlias, onLogin, onProfile, onTicker, toast }) {
  const { t } = useTranslation();
  const [posts, setPosts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [scope, setScope] = useState('global'); // global | following | trending
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [trendTickers, setTrendTickers] = useState([]);

  const loadFirst = useCallback(() => {
    setLoading(true);
    const p = scope === 'trending'
      ? api.trending()
      : api.listPosts(null, 20, scope === 'following' ? 'following' : undefined);
    p.then(r => { setPosts(r.posts); setCursor(scope === 'trending' ? null : r.nextCursor); })
      .catch(e => toast?.(t('toast.error', { message: e.message })))
      .finally(() => setLoading(false));
  }, [toast, scope]);

  useEffect(() => { loadFirst(); }, [loadFirst]);

  // Tickers en tendencia (una vez)
  useEffect(() => { api.trendingTickers().then(r => setTrendTickers(r.tickers || [])).catch(() => {}); }, []);

  // Búsqueda de usuarios (mín. 2 caracteres)
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults([]); return; }
    let alive = true;
    api.searchUsers(query).then(r => { if (alive) setResults(r.users || []); }).catch(() => {});
    return () => { alive = false; };
  }, [q]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.listPosts(cursor, 20, scope === 'following' ? 'following' : undefined);
      setPosts(prev => [...prev, ...r.posts]);
      setCursor(r.nextCursor);
    } catch (e) { toast?.(t('toast.error', { message: e.message })); }
    finally { setLoadingMore(false); }
  };

  const publish = async () => {
    const text = body.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      const post = await api.createPost(text);
      setPosts(prev => [post, ...prev]);
      setBody('');
      toast?.(t('communityPage.publishedToast'));
    } catch (e) { toast?.(t('toast.error', { message: e.message })); }
    finally { setPosting(false); }
  };

  const remove = async (post) => {
    if (!window.confirm(t('tickerPage.confirmDelete'))) return;
    try {
      await api.deletePost(post.id);
      setPosts(prev => prev.filter(p => p.id !== post.id));
      toast?.(t('communityPage.deletedToast'));
    } catch (e) { toast?.(t('toast.error', { message: e.message })); }
  };

  return (
    <div className="section active">
      {/* ── Composer / llamada a la acción según estado de sesión ── */}
      {!user ? (
        <div className="learn-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px' }}>{t('communityPage.loginPrompt')}</div>
          <button className="btn btn-gold" onClick={onLogin}>{t('auth.titles.login')}</button>
        </div>
      ) : needsAlias ? (
        <div className="learn-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px' }}>{t('communityPage.aliasPrompt')}</div>
          <button className="btn btn-gold" onClick={onEditAlias}>{t('thesisPage.createAlias')}</button>
        </div>
      ) : (
        <div className="learn-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px' }}>{profile?.avatar || '📈'}</span>
            <span style={{ fontSize: '12px', color: 'var(--gold)', fontFamily: "'DM Mono',monospace" }}>@{profile?.handle}</span>
            <span style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: '11px', color: 'var(--muted)' }} onClick={onEditAlias}>{t('communityPage.editProfile')}</span>
          </div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value.slice(0, MAX))}
            placeholder={t('communityPage.composerPlaceholder')}
            rows={3}
            style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '11px 12px', color: 'var(--text)', fontFamily: "'DM Sans',sans-serif", fontSize: '13.5px', resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
            <span style={{ fontSize: '11px', color: body.length > MAX - 50 ? 'var(--orange)' : 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>{body.length}/{MAX}</span>
            <button className="btn btn-gold" onClick={publish} disabled={!body.trim() || posting}>{posting ? t('common.busy') : t('communityPage.publish')}</button>
          </div>
        </div>
      )}

      {/* ── Búsqueda de usuarios ── */}
      <div style={{ position: 'relative', marginTop: '16px' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('communityPage.searchPlaceholder')}
          style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', color: 'var(--text)', fontFamily: "'DM Sans',sans-serif", fontSize: '13px', boxSizing: 'border-box' }} />
        {results.length > 0 && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: '10px', boxShadow: '0 8px 24px var(--shadow)', overflow: 'hidden' }}>
            {results.map(u => (
              <div key={u.id} onClick={() => { setQ(''); setResults([]); onProfile?.(u.handle); }}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '18px' }}>{u.avatar || '📈'}</span>
                <span style={{ fontSize: '13px', color: 'var(--text)' }}>{u.displayName}</span>
                <span style={{ fontSize: '11px', color: 'var(--gold)', fontFamily: "'DM Mono',monospace" }}>@{u.handle}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Tickers en tendencia ── */}
      {trendTickers.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('communityPage.trending')}</span>
          {trendTickers.map(tk => (
            <button key={tk.ticker} className="filter-chip" onClick={() => onTicker?.(tk.ticker)} style={{ color: 'var(--gold)' }}>${tk.ticker} · {tk.mentions}</button>
          ))}
        </div>
      )}

      {/* ── Selector de alcance del feed ── */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
        <button className={`filter-chip${scope === 'global' ? ' active' : ''}`} onClick={() => setScope('global')}>{t('communityPage.scope.global')}</button>
        <button className={`filter-chip${scope === 'trending' ? ' active' : ''}`} onClick={() => setScope('trending')}>{t('communityPage.scope.trending')}</button>
        {user && <button className={`filter-chip${scope === 'following' ? ' active' : ''}`} onClick={() => setScope('following')}>{t('communityPage.scope.following')}</button>}
      </div>

      {/* ── Feed ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '18px' }}>
        {loading ? (
          <div className="empty-state"><div className="empty-icon">⏳</div><div className="empty-text">{t('communityPage.loadingPosts')}</div></div>
        ) : posts.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">🗣</div><div className="empty-text">{scope === 'following' ? t('communityPage.emptyFollowing') : t('communityPage.emptyGlobal')}</div></div>
        ) : (
          <>
            {posts.map(p => (
              <PostCard key={p.id} post={p} currentUserId={user?.id}
                canInteract={!!user && !needsAlias} onDelete={remove}
                onTicker={onTicker} onHandle={onProfile} onAuthor={onProfile}
                requireInteract={() => { if (!user) onLogin?.(); else if (needsAlias) onEditAlias?.(); }}
                toast={toast} />
            ))}
            {cursor && (
              <button className="btn btn-outline" onClick={loadMore} disabled={loadingMore} style={{ alignSelf: 'center', marginTop: '4px' }}>
                {loadingMore ? t('common.busy') : t('tickerPage.loadMore')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
