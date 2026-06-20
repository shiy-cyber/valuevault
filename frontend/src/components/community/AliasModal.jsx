import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';

const AVATARS = ['📈', '📊', '💼', '🦅', '🐂', '🐻', '💎', '🚀', '🧠', '🎯', '🛡', '🔭', '⚡', '🌱', '🏦', '🦉'];

// Onboarding / edición del alias público de la comunidad.
// Reutiliza el lenguaje visual de AuthModal (overlay + tarjeta + inputs).
export default function AliasModal({ open, current, onClose, onSaved, toast }) {
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState(null); // null | 'free' | 'taken' | 'self'

  // Precarga al abrir (edición) o limpia (alta nueva)
  useEffect(() => {
    if (!open) return;
    setDisplayName(current?.displayName || '');
    setHandle(current?.handle || '');
    setAvatar(current?.avatar || AVATARS[0]);
    setBio(current?.bio || '');
    setCheck(null);
  }, [open, current]);

  if (!open) return null;

  const normHandle = (h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const handleValid = /^[a-z0-9_]{3,20}$/.test(handle);

  // Disponibilidad del alias al salir del campo (no consume nada pesado)
  const checkHandle = async () => {
    if (!handleValid) { setCheck(null); return; }
    if (current?.handle && handle === current.handle) { setCheck('self'); return; }
    try { await api.getProfile(handle); setCheck('taken'); }
    catch { setCheck('free'); } // 404 → libre
  };

  const submit = async () => {
    if (busy) return;
    if (displayName.trim().length < 2) { toast?.('⚠ El nombre debe tener al menos 2 caracteres'); return; }
    if (!handleValid) { toast?.('⚠ El alias debe tener 3–20 caracteres (minúsculas, números o _)'); return; }
    setBusy(true);
    try {
      const pub = await api.updateProfile({ displayName: displayName.trim(), handle, avatar, bio: bio.trim() });
      toast?.('✓ Alias guardado');
      onSaved?.(pub);
    } catch (e) { toast?.('⚠ ' + e.message); }
    finally { setBusy(false); }
  };

  const input = { width: '100%', marginTop: '6px', marginBottom: '14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '11px 12px', color: 'var(--text)', fontFamily: "'DM Mono',monospace", fontSize: '14px', boxSizing: 'border-box' };
  const label = { fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", letterSpacing: '0.5px' };
  const isEdit = !!current?.handle;

  return (
    <div onClick={() => onClose?.()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '26px', width: '100%', maxWidth: '430px', boxShadow: '0 20px 60px rgba(0,0,0,.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '19px', fontWeight: 700 }}>{isEdit ? 'Editar perfil' : '🗣 Únete a la comunidad'}</div>
          <button onClick={() => onClose?.()} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '18px' }}>
          Elige cómo te verán los demás. Tu <b>email nunca se muestra</b> en la comunidad.
        </div>

        <label style={label}>Nombre visible</label>
        <input value={displayName} onChange={e => setDisplayName(e.target.value.slice(0, 30))} placeholder="Tu nombre o apodo" style={input} autoFocus maxLength={30} />

        <label style={label}>Alias (para @menciones)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', marginBottom: '4px' }}>
          <span style={{ color: 'var(--gold)', fontFamily: "'DM Mono',monospace", fontSize: '15px' }}>@</span>
          <input value={handle} onChange={e => { setHandle(normHandle(e.target.value).slice(0, 20)); setCheck(null); }} onBlur={checkHandle} placeholder="tu_alias" style={{ ...input, marginTop: 0, marginBottom: 0 }} maxLength={20} />
        </div>
        <div style={{ minHeight: '16px', marginBottom: '12px', fontSize: '10.5px', fontFamily: "'DM Mono',monospace" }}>
          {check === 'free' && <span style={{ color: 'var(--green)' }}>✓ Disponible</span>}
          {check === 'taken' && <span style={{ color: 'var(--red)' }}>✕ Ya está en uso</span>}
          {check === 'self' && <span style={{ color: 'var(--muted)' }}>Tu alias actual</span>}
          {handle && !handleValid && <span style={{ color: 'var(--muted)' }}>3–20 caracteres: minúsculas, números o _</span>}
        </div>

        <label style={label}>Avatar</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px', marginBottom: '14px' }}>
          {AVATARS.map(a => (
            <button key={a} onClick={() => setAvatar(a)} style={{ fontSize: '18px', width: '38px', height: '38px', borderRadius: '9px', cursor: 'pointer', background: avatar === a ? 'rgba(201,168,76,.15)' : 'var(--surface2)', border: `1px solid ${avatar === a ? 'var(--gold)' : 'var(--border)'}` }}>{a}</button>
          ))}
        </div>

        <label style={label}>Bio <span style={{ color: 'var(--muted)' }}>(opcional)</span></label>
        <textarea value={bio} onChange={e => setBio(e.target.value.slice(0, 160))} placeholder="Tu enfoque inversor en una línea…" rows={2} style={{ ...input, fontFamily: "'DM Sans',sans-serif", resize: 'vertical' }} maxLength={160} />

        <button className="btn btn-gold" onClick={submit} disabled={busy} style={{ width: '100%', justifyContent: 'center', padding: '11px' }}>
          {busy ? '⏳…' : (isEdit ? 'Guardar cambios' : 'Entrar a la comunidad')}
        </button>
      </div>
    </div>
  );
}
