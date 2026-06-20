import React from 'react';
import { timeAgo } from '../../lib/format.js';
import RichText from './RichText.jsx';

// createdAt viene como UTC "YYYY-MM-DD HH:MM:SS" → ISO con Z para timeAgo.
const toIso = (s) => (s ? String(s).replace(' ', 'T') + 'Z' : null);

export default function PostCard({ post, currentUserId, onDelete, onTicker, onHandle, onAuthor }) {
  const a = post.author || {};
  const mine = currentUserId && a.id === currentUserId;
  return (
    <div className="learn-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ fontSize: '24px', lineHeight: 1 }}>{a.avatar || '📈'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{a.displayName || 'Anónimo'}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>
            <span onClick={a.handle && onAuthor ? () => onAuthor(a.handle) : undefined} style={{ color: 'var(--gold)', cursor: a.handle && onAuthor ? 'pointer' : 'default' }}>@{a.handle || '—'}</span>
            <span> · {timeAgo(toIso(post.createdAt)) || ''}</span>
          </div>
        </div>
        {mine && (
          <button className="card-btn" title="Eliminar" onClick={() => onDelete?.(post)} style={{ flex: 'none' }}>🗑</button>
        )}
      </div>
      <div style={{ fontSize: '13.5px', color: 'var(--text)', marginTop: '10px', lineHeight: 1.55 }}>
        <RichText text={post.body} onTicker={onTicker} onHandle={onHandle} />
      </div>
    </div>
  );
}
