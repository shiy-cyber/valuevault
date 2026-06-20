import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import { timeAgo } from '../../lib/format.js';
import RichText from './RichText.jsx';

const toIso = (s) => (s ? String(s).replace(' ', 'T') + 'Z' : null);

// Panel de comentarios de una publicación. Carga perezosa al expandir.
export default function CommentsPanel({ postId, canComment, currentUserId, postAuthorId, onCount, onTicker, onHandle, toast }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.listComments(postId)
      .then(r => { if (alive) setComments(r.comments); })
      .catch(e => toast?.('⚠ ' + e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [postId, toast]);

  const send = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const c = await api.addComment(postId, text);
      setComments(prev => [...prev, c]);
      setBody('');
      onCount?.(1);
    } catch (e) { toast?.('⚠ ' + e.message); }
    finally { setBusy(false); }
  };

  const remove = async (c) => {
    try {
      await api.deleteComment(c.id);
      setComments(prev => prev.filter(x => x.id !== c.id));
      onCount?.(-1);
    } catch (e) { toast?.('⚠ ' + e.message); }
  };

  return (
    <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
      {loading ? (
        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Cargando comentarios…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {comments.map(c => {
            const a = c.author || {};
            const canDelete = currentUserId && (a.id === currentUserId || postAuthorId === currentUserId);
            return (
              <div key={c.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '16px', lineHeight: 1.2 }}>{a.avatar || '📈'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>
                    <b style={{ color: 'var(--text)' }}>{a.displayName || 'Anónimo'}</b>
                    <span onClick={a.handle && onHandle ? () => onHandle(a.handle) : undefined} style={{ color: 'var(--gold)', cursor: a.handle && onHandle ? 'pointer' : 'default' }}> @{a.handle || '—'}</span>
                    <span> · {timeAgo(toIso(c.createdAt)) || ''}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text)', marginTop: '2px', lineHeight: 1.5 }}>
                    <RichText text={c.body} onTicker={onTicker} onHandle={onHandle} />
                  </div>
                </div>
                {canDelete && <button className="card-btn" title="Eliminar" onClick={() => remove(c)} style={{ flex: 'none', padding: '2px 6px' }}>🗑</button>}
              </div>
            );
          })}
          {comments.length === 0 && <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Sé el primero en comentar.</div>}
        </div>
      )}

      {canComment && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <input
            value={body}
            onChange={e => setBody(e.target.value.slice(0, 300))}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Escribe un comentario…"
            style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 11px', color: 'var(--text)', fontFamily: "'DM Sans',sans-serif", fontSize: '13px' }}
          />
          <button className="btn btn-gold" onClick={send} disabled={!body.trim() || busy} style={{ flex: 'none' }}>{busy ? '⏳' : 'Enviar'}</button>
        </div>
      )}
    </div>
  );
}
