import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api.js';
import PostCard from './PostCard.jsx';

const MAX = 500;

// Sección Comunidad — Fase 1: identidad pública + feed global.
export default function Community({ user, profile, needsAlias, onEditAlias, onLogin, onProfile, onTicker, toast }) {
  const [posts, setPosts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [scope, setScope] = useState('global'); // global | following

  const loadFirst = useCallback(() => {
    setLoading(true);
    api.listPosts(null, 20, scope === 'following' ? 'following' : undefined)
      .then(r => { setPosts(r.posts); setCursor(r.nextCursor); })
      .catch(e => toast?.('⚠ ' + e.message))
      .finally(() => setLoading(false));
  }, [toast, scope]);

  useEffect(() => { loadFirst(); }, [loadFirst]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.listPosts(cursor, 20, scope === 'following' ? 'following' : undefined);
      setPosts(prev => [...prev, ...r.posts]);
      setCursor(r.nextCursor);
    } catch (e) { toast?.('⚠ ' + e.message); }
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
      toast?.('✓ Publicado');
    } catch (e) { toast?.('⚠ ' + e.message); }
    finally { setPosting(false); }
  };

  const remove = async (post) => {
    if (!window.confirm('¿Eliminar esta publicación?')) return;
    try {
      await api.deletePost(post.id);
      setPosts(prev => prev.filter(p => p.id !== post.id));
      toast?.('🗑 Publicación eliminada');
    } catch (e) { toast?.('⚠ ' + e.message); }
  };

  return (
    <div className="section active">
      {/* ── Composer / llamada a la acción según estado de sesión ── */}
      {!user ? (
        <div className="learn-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px' }}>Lee lo que comparte la comunidad. Para publicar, inicia sesión.</div>
          <button className="btn btn-gold" onClick={onLogin}>Iniciar sesión</button>
        </div>
      ) : needsAlias ? (
        <div className="learn-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px' }}>Elige tu alias público para empezar a publicar. Tu email nunca se muestra.</div>
          <button className="btn btn-gold" onClick={onEditAlias}>Crear mi alias</button>
        </div>
      ) : (
        <div className="learn-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px' }}>{profile?.avatar || '📈'}</span>
            <span style={{ fontSize: '12px', color: 'var(--gold)', fontFamily: "'DM Mono',monospace" }}>@{profile?.handle}</span>
            <span style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: '11px', color: 'var(--muted)' }} onClick={onEditAlias}>Editar perfil</span>
          </div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value.slice(0, MAX))}
            placeholder="Comparte una idea… Menciona valores con $TICKER y a otros con @alias"
            rows={3}
            style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '11px 12px', color: 'var(--text)', fontFamily: "'DM Sans',sans-serif", fontSize: '13.5px', resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
            <span style={{ fontSize: '11px', color: body.length > MAX - 50 ? 'var(--orange)' : 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>{body.length}/{MAX}</span>
            <button className="btn btn-gold" onClick={publish} disabled={!body.trim() || posting}>{posting ? '⏳…' : '+ Publicar'}</button>
          </div>
        </div>
      )}

      {/* ── Selector de alcance del feed ── */}
      {user && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button className={`filter-chip${scope === 'global' ? ' active' : ''}`} onClick={() => setScope('global')}>🌐 Global</button>
          <button className={`filter-chip${scope === 'following' ? ' active' : ''}`} onClick={() => setScope('following')}>👤 Siguiendo</button>
        </div>
      )}

      {/* ── Feed ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '18px' }}>
        {loading ? (
          <div className="empty-state"><div className="empty-icon">⏳</div><div className="empty-text">Cargando publicaciones…</div></div>
        ) : posts.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">🗣</div><div className="empty-text">{scope === 'following' ? 'Aún no sigues a nadie, o no han publicado. Explora el feed global.' : 'Aún no hay publicaciones. ¡Sé el primero en compartir una idea!'}</div></div>
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
                {loadingMore ? '⏳…' : 'Cargar más'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
