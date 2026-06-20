import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import { timeAgo } from '../../lib/format.js';

const toIso = (s) => (s ? String(s).replace(' ', 'T') + 'Z' : null);

const VERB = {
  like: 'le dio me gusta a tu publicación',
  comment: 'comentó tu publicación',
  follow: 'te empezó a seguir',
  mention: 'te mencionó',
};

// Panel de notificaciones. Al abrir, carga y marca todas como leídas.
export default function Notifications({ open, onClose, onProfile, onRead, toast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.notifications()
      .then(r => {
        setItems(r.notifications);
        return api.markRead();          // marcar todas leídas al abrir
      })
      .then(() => onRead?.())            // resetea el badge en App
      .catch(e => toast?.('⚠ ' + e.message))
      .finally(() => setLoading(false));
  }, [open, onRead, toast]);

  if (!open) return null;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '70px 16px 16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', width: '100%', maxWidth: '420px', maxHeight: '70vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)' }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '17px', fontWeight: 700 }}>🔔 Notificaciones</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer' }}>×</button>
        </div>

        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>Cargando…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: '36px 24px', textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: '30px', marginBottom: '8px' }}>🔕</div>
            <div style={{ fontSize: '13px' }}>No tienes notificaciones todavía.</div>
          </div>
        ) : (
          items.map(n => {
            const a = n.actor || {};
            return (
              <div key={n.id} onClick={() => { if (a.handle && onProfile) { onProfile(a.handle); onClose?.(); } }}
                style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px 18px', borderBottom: '1px solid var(--border)', cursor: a.handle ? 'pointer' : 'default', background: n.isRead ? 'transparent' : 'rgba(201,168,76,.06)' }}>
                <div style={{ fontSize: '22px', lineHeight: 1 }}>{a.avatar || '📈'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5 }}>
                    <b>{a.displayName || 'Alguien'}</b> <span style={{ color: 'var(--muted)' }}>{VERB[n.type] || 'interactuó contigo'}</span>
                  </div>
                  {n.postSnippet && <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '3px', fontStyle: 'italic' }}>“{n.postSnippet}”</div>}
                  <div style={{ fontSize: '10.5px', color: 'var(--muted)', marginTop: '3px', fontFamily: "'DM Mono',monospace" }}>{timeAgo(toIso(n.createdAt)) || ''}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
