import React from 'react';

// Sección Comunidad — Fase 0: identidad pública.
// (Fase 1 añadirá aquí el composer y el feed de publicaciones.)
export default function Community({ user, profile, needsAlias, onEditAlias, onLogin }) {
  return (
    <div className="section active">
      {!user ? (
        <div className="empty-state">
          <div className="empty-icon">🗣</div>
          <div className="empty-text">Inicia sesión para unirte a la comunidad y compartir tus ideas.</div>
          <button className="btn btn-gold" style={{ marginTop: '14px' }} onClick={onLogin}>Iniciar sesión</button>
        </div>
      ) : needsAlias ? (
        <div className="empty-state">
          <div className="empty-icon">🪪</div>
          <div className="empty-text">Elige tu alias público para participar. Tu email nunca se mostrará.</div>
          <button className="btn btn-gold" style={{ marginTop: '14px' }} onClick={onEditAlias}>Crear mi alias</button>
        </div>
      ) : (
        <>
          <div className="learn-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '40px', lineHeight: 1 }}>{profile?.avatar || '📈'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>{profile?.displayName}</div>
              <div style={{ fontSize: '12px', color: 'var(--gold)', fontFamily: "'DM Mono',monospace" }}>@{profile?.handle}</div>
              {profile?.bio && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '6px', lineHeight: 1.5 }}>{profile.bio}</div>}
            </div>
            <button className="btn btn-outline" onClick={onEditAlias}>Editar perfil</button>
          </div>

          <div className="empty-state" style={{ marginTop: '20px' }}>
            <div className="empty-icon">✍️</div>
            <div className="empty-text">El muro de la comunidad llegará muy pronto. Ya tienes tu identidad pública lista.</div>
          </div>
        </>
      )}
    </div>
  );
}
