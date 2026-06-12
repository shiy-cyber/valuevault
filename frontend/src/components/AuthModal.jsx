import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

export default function AuthModal({ open, onClose, onAuth, toast, presetCode }) {
  const [mode, setMode] = useState('login');      // login | register | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [displayCode, setDisplayCode] = useState(null); // código a mostrar
  const [pendingAuth, setPendingAuth] = useState(null); // sesión a aplicar tras mostrar el código

  // Regenerar código desde la cuenta: se abre el modal directamente en la vista de código
  useEffect(() => {
    if (open && presetCode) { setDisplayCode(presetCode); setPendingAuth(null); }
  }, [open, presetCode]);

  if (!open) return null;

  const close = () => {
    setDisplayCode(null); setPendingAuth(null); setMode('login');
    setEmail(''); setPassword(''); setCode('');
    onClose();
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (mode === 'login') {
        if (!email.trim() || !password) throw new Error('Introduce email y contraseña');
        onAuth(await api.login(email, password)); toast?.('✓ Sesión iniciada'); close();
      } else if (mode === 'register') {
        if (!email.trim() || !password) throw new Error('Introduce email y contraseña');
        const r = await api.register(email, password);
        setDisplayCode(r.recoveryCode); setPendingAuth({ token: r.token, user: r.user });
        toast?.('✓ Cuenta creada');
      } else { // reset
        if (!email.trim() || !code.trim() || !password) throw new Error('Rellena email, código y nueva contraseña');
        onAuth(await api.reset(email, code, password)); toast?.('✓ Contraseña restablecida'); close();
      }
    } catch (e) { toast?.('⚠ ' + e.message); }
    finally { setBusy(false); }
  };

  const continueFromCode = () => {
    const auth = pendingAuth;
    setDisplayCode(null); setPendingAuth(null);
    if (auth) { onAuth(auth); close(); } else { close(); }
  };

  const input = { width: '100%', marginTop: '6px', marginBottom: '14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '11px 12px', color: 'var(--text)', fontFamily: "'DM Mono',monospace", fontSize: '14px', boxSizing: 'border-box' };
  const label = { fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", letterSpacing: '0.5px' };
  const titles = { login: 'Iniciar sesión', register: 'Crear cuenta', reset: 'Restablecer contraseña' };

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '26px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,.4)' }}>

        {displayCode ? (
          /* ─── Pantalla del código de recuperación ─── */
          <>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '19px', fontWeight: 700, marginBottom: '8px' }}>🔑 Tu código de recuperación</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '16px' }}>
              Guárdalo en un lugar seguro. Es la <b>única forma</b> de recuperar tu cuenta si olvidas la contraseña. <b>No volverá a mostrarse.</b>
            </div>
            <div style={{ background: 'var(--surface2)', border: '1px dashed var(--gold)', borderRadius: '10px', padding: '16px', textAlign: 'center', fontFamily: "'DM Mono',monospace", fontSize: '20px', fontWeight: 700, color: 'var(--gold)', letterSpacing: '2px', wordBreak: 'break-all' }}>{displayCode}</div>
            <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}
              onClick={() => { navigator.clipboard?.writeText(displayCode); toast?.('✓ Código copiado'); }}>📋 Copiar código</button>
            <button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center', marginTop: '10px', padding: '11px' }} onClick={continueFromCode}>Lo he guardado, continuar</button>
          </>
        ) : (
          /* ─── Login / Registro / Reset ─── */
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '19px', fontWeight: 700 }}>{titles[mode]}</div>
              <button onClick={close} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '18px' }}>
              {mode === 'login' ? 'Accede a tu cartera privada.' : mode === 'register' ? 'Tu cartera y notas serán privadas, solo tuyas.' : 'Introduce tu código de recuperación y una nueva contraseña.'}
            </div>

            <label style={label}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="tucorreo@ejemplo.com" style={input} autoFocus />

            {mode === 'reset' && (
              <>
                <label style={label}>Código de recuperación</label>
                <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="XXXX-XXXX-XXXX-XXXX" style={input} />
              </>
            )}

            <label style={label}>{mode === 'reset' ? 'Nueva contraseña' : 'Contraseña'} {mode !== 'login' && <span style={{ color: 'var(--muted)' }}>(mín. 6)</span>}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="••••••••" style={input} />

            <button className="btn btn-gold" onClick={submit} disabled={busy} style={{ width: '100%', justifyContent: 'center', padding: '11px' }}>
              {busy ? '⏳…' : (mode === 'login' ? 'Entrar' : mode === 'register' ? 'Crear cuenta' : 'Restablecer')}
            </button>

            <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.9 }}>
              {mode === 'login' && <>¿No tienes cuenta? <span onClick={() => setMode('register')} style={{ color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>Regístrate</span><br /><span onClick={() => setMode('reset')} style={{ color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline' }}>¿Olvidaste tu contraseña?</span></>}
              {mode === 'register' && <>¿Ya tienes cuenta? <span onClick={() => setMode('login')} style={{ color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>Inicia sesión</span></>}
              {mode === 'reset' && <span onClick={() => setMode('login')} style={{ color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>← Volver a iniciar sesión</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
