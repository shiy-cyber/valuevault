import React, { useState } from 'react';
import { api } from '../lib/api.js';

export default function AuthModal({ open, onClose, onAuth, toast }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;
  const isLogin = mode === 'login';

  const submit = async () => {
    if (busy) return;
    if (!email.trim() || !password) { toast?.('⚠ Introduce email y contraseña'); return; }
    setBusy(true);
    try {
      const r = isLogin ? await api.login(email, password) : await api.register(email, password);
      onAuth(r);
      setEmail(''); setPassword('');
      toast?.(isLogin ? '✓ Sesión iniciada' : '✓ Cuenta creada');
    } catch (e) {
      toast?.('⚠ ' + e.message);
    } finally { setBusy(false); }
  };

  const input = { width: '100%', marginTop: '6px', marginBottom: '14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '11px 12px', color: 'var(--text)', fontFamily: "'DM Mono',monospace", fontSize: '14px', boxSizing: 'border-box' };
  const label = { fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", letterSpacing: '0.5px' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '26px', width: '100%', maxWidth: '380px', boxShadow: '0 20px 60px rgba(0,0,0,.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '19px', fontWeight: 700 }}>{isLogin ? 'Iniciar sesión' : 'Crear cuenta'}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '18px' }}>{isLogin ? 'Accede a tu cartera privada.' : 'Tu cartera y notas serán privadas, solo tuyas.'}</div>

        <label style={label}>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="tucorreo@ejemplo.com" style={input} autoFocus />
        <label style={label}>Contraseña {!isLogin && <span style={{ color: 'var(--muted)' }}>(mín. 6 caracteres)</span>}</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="••••••••" style={input} />

        <button className="btn btn-gold" onClick={submit} disabled={busy} style={{ width: '100%', justifyContent: 'center', padding: '11px' }}>
          {busy ? '⏳…' : (isLogin ? 'Entrar' : 'Crear cuenta')}
        </button>

        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '11px', color: 'var(--muted)' }}>
          {isLogin ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
          <span onClick={() => setMode(isLogin ? 'register' : 'login')} style={{ color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>
            {isLogin ? 'Regístrate' : 'Inicia sesión'}
          </span>
        </div>
      </div>
    </div>
  );
}
