import React, { useState, useEffect } from 'react';

// Pantalla "en mantenimiento" a pantalla completa. Se muestra cuando el backend
// no responde, en vez de un error técnico. Reintenta sola cada 20 s.
export default function Maintenance({ onRetry }) {
  const [busy, setBusy] = useState(false);

  const retry = async () => {
    if (busy) return;
    setBusy(true);
    try { await onRetry?.(); } finally { setBusy(false); }
  };

  // Reintento automático cada 20 s
  useEffect(() => {
    const iv = setInterval(() => { onRetry?.(); }, 20000);
    return () => clearInterval(iv);
  }, [onRetry]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px', textAlign: 'center' }}>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '26px', fontWeight: 700, color: 'var(--gold)', marginBottom: '4px' }}>ValueVault</div>
      <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '34px' }}>Asset Intelligence</div>

      <div style={{ fontSize: '46px', marginBottom: '18px', animation: 'vv-spin 3s linear infinite' }}>🛠️</div>

      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '20px', fontWeight: 700, marginBottom: '10px' }}>Estamos actualizando la plataforma</div>
      <div style={{ fontSize: '13.5px', color: 'var(--muted)', lineHeight: 1.7, maxWidth: '420px', marginBottom: '24px' }}>
        Estamos haciendo mejoras y volveremos en unos minutos. Tus datos están a salvo. Gracias por tu paciencia.
      </div>

      <button className="btn btn-gold" onClick={retry} disabled={busy} style={{ padding: '11px 22px', justifyContent: 'center' }}>
        {busy ? '⏳ Comprobando…' : '↻ Reintentar'}
      </button>
      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '14px' }}>Se reintenta automáticamente cada 20 segundos.</div>

      <style>{`@keyframes vv-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
