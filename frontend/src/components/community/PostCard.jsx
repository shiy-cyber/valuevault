import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { timeAgo } from '../../lib/format.js';
import { api } from '../../lib/api.js';
import RichText from './RichText.jsx';
import CommentsPanel from './CommentsPanel.jsx';

// createdAt viene como UTC "YYYY-MM-DD HH:MM:SS" → ISO con Z para timeAgo.
const toIso = (s) => (s ? String(s).replace(' ', 'T') + 'Z' : null);

export default function PostCard({ post, currentUserId, canInteract, onDelete, onTicker, onHandle, onAuthor, requireInteract, toast }) {
  const { t } = useTranslation();
  const a = post.author || {};
  const mine = currentUserId && a.id === currentUserId;
  const [liked, setLiked] = useState(!!post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount || 0);
  const [commentCount, setCommentCount] = useState(post.commentCount || 0);
  const [showComments, setShowComments] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);

  const toggleLike = async () => {
    if (!canInteract) { requireInteract?.(); return; }
    if (likeBusy) return;
    setLikeBusy(true);
    const next = !liked;
    setLiked(next); setLikeCount(c => c + (next ? 1 : -1)); // optimista
    try {
      const r = next ? await api.likePost(post.id) : await api.unlikePost(post.id);
      setLikeCount(r.likeCount); setLiked(r.likedByMe);
    } catch (e) {
      setLiked(!next); setLikeCount(c => c + (next ? -1 : 1)); // revertir
      toast?.(t('toast.error', { message: e.message }));
    } finally { setLikeBusy(false); }
  };

  const onComments = () => {
    if (!showComments && !canInteract && commentCount === 0) { /* permitir leer aun sin sesión */ }
    setShowComments(s => !s);
  };

  const actionBtn = { display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--muted)', padding: '4px 6px', fontFamily: 'inherit' };

  return (
    <div className="learn-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ fontSize: '24px', lineHeight: 1 }}>{a.avatar || '📈'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{a.displayName || t('postCard.anonymous')}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>
            <span onClick={a.handle && onAuthor ? () => onAuthor(a.handle) : undefined} style={{ color: 'var(--gold)', cursor: a.handle && onAuthor ? 'pointer' : 'default' }}>@{a.handle || '—'}</span>
            <span> · {timeAgo(toIso(post.createdAt), t) || ''}</span>
          </div>
        </div>
        {mine && <button className="card-btn" title={t('postCard.deleteTitle')} onClick={() => onDelete?.(post)} style={{ flex: 'none' }}>🗑</button>}
      </div>

      <div style={{ fontSize: '13.5px', color: 'var(--text)', marginTop: '10px', lineHeight: 1.55 }}>
        <RichText text={post.body} onTicker={onTicker} onHandle={onHandle} />
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <button onClick={toggleLike} style={{ ...actionBtn, color: liked ? 'var(--red)' : 'var(--muted)' }}>
          {liked ? '❤' : '🤍'} {likeCount > 0 ? likeCount : ''}
        </button>
        <button onClick={onComments} style={{ ...actionBtn, color: showComments ? 'var(--gold)' : 'var(--muted)' }}>
          💬 {commentCount > 0 ? commentCount : ''}
        </button>
      </div>

      {showComments && (
        <CommentsPanel
          postId={post.id}
          canComment={canInteract}
          currentUserId={currentUserId}
          postAuthorId={a.id}
          onCount={(d) => setCommentCount(c => Math.max(0, c + d))}
          onTicker={onTicker}
          onHandle={onHandle}
          toast={toast}
        />
      )}
    </div>
  );
}
