import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api.js';
import PostCard from './PostCard.jsx';

// Perfil público de un usuario (navegado por estado: section='profile').
export default function Profile({ handle, currentUser, canInteract, onBack, onTicker, onAuthor, requireInteract, toast }) {
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setNotFound(false);
    Promise.all([api.getProfile(handle), api.userPosts(handle)])
      .then(([p, r]) => { setProfile(p); setPosts(r.posts); setCursor(r.nextCursor); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [handle]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    try { const r = await api.userPosts(handle, cursor); setPosts(prev => [...prev, ...r.posts]); setCursor(r.nextCursor); }
    catch (e) { toast?.('⚠ ' + e.message); }
  };

  const toggleFollow = async () => {
    if (!canInteract) { requireInteract?.(); return; }
    if (followBusy || !profile) return;
    setFollowBusy(true);
    try {
      const r = profile.followedByMe ? await api.unfollow(handle) : await api.follow(handle);
      setProfile(p => ({ ...p, followedByMe: r.followedByMe, followerCount: r.followerCount }));
    } catch (e) { toast?.('⚠ ' + e.message); }
    finally { setFollowBusy(false); }
  };

  const removePost = async (post) => {
    if (!window.confirm('¿Eliminar esta publicación?')) return;
    try { await api.deletePost(post.id); setPosts(prev => prev.filter(p => p.id !== post.id)); toast?.('🗑 Eliminada'); }
    catch (e) { toast?.('⚠ ' + e.message); }
  };

  const Stat = ({ n, l }) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{n}</div>
      <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{l}</div>
    </div>
  );

  if (notFound) {
    return (
      <div className="section active">
        <button className="btn btn-outline" onClick={onBack} style={{ marginBottom: '14px' }}>← Volver</button>
        <div className="empty-state"><div className="empty-icon">🚫</div><div className="empty-text">No existe el usuario @{handle}.</div></div>
      </div>
    );
  }

  const isMe = currentUser && profile && profile.id === currentUser.id;

  return (
    <div className="section active">
      <button className="btn btn-outline" onClick={onBack} style={{ marginBottom: '14px' }}>← Volver</button>

      {loading || !profile ? (
        <div className="empty-state"><div className="empty-icon">⏳</div><div className="empty-text">Cargando perfil…</div></div>
      ) : (
        <>
          <div className="learn-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ fontSize: '44px', lineHeight: 1 }}>{profile.avatar || '📈'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '19px', fontWeight: 700, color: 'var(--text)' }}>{profile.displayName}</div>
                <div style={{ fontSize: '12px', color: 'var(--gold)', fontFamily: "'DM Mono',monospace" }}>@{profile.handle}</div>
              </div>
              {!isMe && (
                <button className={profile.followedByMe ? 'btn btn-outline' : 'btn btn-gold'} onClick={toggleFollow} disabled={followBusy} style={{ flex: 'none' }}>
                  {profile.followedByMe ? '✓ Siguiendo' : '+ Seguir'}
                </button>
              )}
            </div>
            {profile.bio && <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '12px', lineHeight: 1.5 }}>{profile.bio}</div>}
            <div style={{ display: 'flex', gap: '28px', marginTop: '16px' }}>
              <Stat n={profile.postCount} l="Posts" />
              <Stat n={profile.followerCount} l="Seguidores" />
              <Stat n={profile.followingCount} l="Siguiendo" />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '18px' }}>
            {posts.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">🗣</div><div className="empty-text">Sin publicaciones todavía.</div></div>
            ) : (
              <>
                {posts.map(p => (
                  <PostCard key={p.id} post={p} currentUserId={currentUser?.id} canInteract={canInteract}
                    onDelete={removePost} onTicker={onTicker} onHandle={onAuthor} onAuthor={onAuthor}
                    requireInteract={requireInteract} toast={toast} />
                ))}
                {cursor && <button className="btn btn-outline" onClick={loadMore} style={{ alignSelf: 'center' }}>Cargar más</button>}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
