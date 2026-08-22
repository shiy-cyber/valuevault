import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api.js';
import PostCard from './PostCard.jsx';

// Perfil público de un usuario — ruta /comunidad/u/:handle.
export default function Profile({ currentUser, canInteract, onBack, onTicker, onAuthor, requireInteract, toast }) {
  const { t } = useTranslation();
  const { handle } = useParams();
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
    catch (e) { toast?.(t('toast.error', { message: e.message })); }
  };

  const toggleFollow = async () => {
    if (!canInteract) { requireInteract?.(); return; }
    if (followBusy || !profile) return;
    setFollowBusy(true);
    try {
      const r = profile.followedByMe ? await api.unfollow(handle) : await api.follow(handle);
      setProfile(p => ({ ...p, followedByMe: r.followedByMe, followerCount: r.followerCount }));
    } catch (e) { toast?.(t('toast.error', { message: e.message })); }
    finally { setFollowBusy(false); }
  };

  const removePost = async (post) => {
    if (!window.confirm(t('tickerPage.confirmDelete'))) return;
    try { await api.deletePost(post.id); setPosts(prev => prev.filter(p => p.id !== post.id)); toast?.(t('profilePage.deletedToast')); }
    catch (e) { toast?.(t('toast.error', { message: e.message })); }
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
        <button className="btn btn-outline" onClick={onBack} style={{ marginBottom: '14px' }}>{t('tickerPage.back')}</button>
        <div className="empty-state"><div className="empty-icon">🚫</div><div className="empty-text">{t('profilePage.notFound', { handle })}</div></div>
      </div>
    );
  }

  const isMe = currentUser && profile && profile.id === currentUser.id;

  return (
    <div className="section active">
      <button className="btn btn-outline" onClick={onBack} style={{ marginBottom: '14px' }}>{t('tickerPage.back')}</button>

      {loading || !profile ? (
        <div className="empty-state"><div className="empty-icon">⏳</div><div className="empty-text">{t('profilePage.loadingProfile')}</div></div>
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
                  {profile.followedByMe ? t('profilePage.following') : t('profilePage.follow')}
                </button>
              )}
            </div>
            {profile.bio && <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '12px', lineHeight: 1.5 }}>{profile.bio}</div>}
            <div style={{ display: 'flex', gap: '28px', marginTop: '16px' }}>
              <Stat n={profile.postCount} l={t('profilePage.stats.posts')} />
              <Stat n={profile.followerCount} l={t('profilePage.stats.followers')} />
              <Stat n={profile.followingCount} l={t('profilePage.stats.following')} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '18px' }}>
            {posts.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">🗣</div><div className="empty-text">{t('profilePage.noPosts')}</div></div>
            ) : (
              <>
                {posts.map(p => (
                  <PostCard key={p.id} post={p} currentUserId={currentUser?.id} canInteract={canInteract}
                    onDelete={removePost} onTicker={onTicker} onHandle={onAuthor} onAuthor={onAuthor}
                    requireInteract={requireInteract} toast={toast} />
                ))}
                {cursor && <button className="btn btn-outline" onClick={loadMore} style={{ alignSelf: 'center' }}>{t('tickerPage.loadMore')}</button>}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
