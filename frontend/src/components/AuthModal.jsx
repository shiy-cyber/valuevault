import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

export default function AuthModal({ open, onClose, onAuth, toast, presetCode, resetLink }) {
  const [mode, setMode] = useState('login');        // login | register | reset
  const [resetStep, setResetStep] = useState('email'); // email | sent | code | link
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

  // Enlace de recuperación por email (?reset=&email= en la URL): entra directo
  // al paso final, sin pedir código — solo la nueva contraseña.
  useEffect(() => {
    if (open && resetLink) { setMode('reset'); setResetStep('link'); setEmail(resetLink.email); }
  }, [open, resetLink]);

  if (!open) return null;

  const close = () => {
    setDisplayCode(null); setPendingAuth(null); setMode('login'); setResetStep('email');
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
      } else if (resetStep === 'email') {
        if (!email.trim()) throw new Error('Introduce tu email');
        await api.forgotPassword(email);
        setResetStep('sent');
      } else if (resetStep === 'link') {
        if (!password) throw new Error('Introduce la nueva contraseña');
        onAuth(await api.resetWithLink(resetLink.email, resetLink.token, password));
        toast?.('✓ Contraseña restablecida'); close();
      } else { // resetStep === 'code'
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
  const submitLabel = mode === 'login' ? 'Entrar' : mode === 'register' ? 'Crear cuenta'
    : resetStep === 'email' ? 'Enviar enlace por email' : 'Restablecer';

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '26px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,.4)' }}>

        {displayCode ? (
          /* ─── Pantalla del código de recuperación ─── */
          <>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '19px', fontWeight: 700, marginBottom: '8px' }}>🔑 Tu código de recuperación</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '16px' }}>
              Guárdalo en un lugar seguro. Es la alternativa si no tienes acceso a tu email al recuperar la cuenta. <b>No volverá a mostrarse.</b>
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
              {mode === 'login' ? 'Accede a tu cartera privada.'
                : mode === 'register' ? 'Tu cartera y notas serán privadas, solo tuyas.'
                : resetStep === 'email' ? 'Te enviaremos un enlace de un solo uso para restablecerla.'
                : resetStep === 'sent' ? 'Revisa tu bandeja de entrada.'
                : resetStep === 'link' ? 'Elige tu nueva contraseña.'
                : 'Introduce tu código de recuperación y una nueva contraseña.'}
            </div>

            {mode === 'register' && (
              <div style={{ display: 'flex', gap: '8px', background: 'var(--surface2)', borderRadius: '8px', padding: '10px 12px', marginBottom: '16px', fontSize: '10.5px', color: 'var(--muted)', lineHeight: 1.6 }}>
                <span>📭</span>
                <span>Guardamos también un <b>código de recuperación</b> que verás justo después, por si alguna vez no tienes acceso a tu email.</span>
              </div>
            )}

            {mode === 'reset' && resetStep === 'sent' ? (
              <div style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '14px', marginBottom: '10px', fontSize: '12px', color: 'var(--text)', lineHeight: 1.7 }}>
                Si <b>{email}</b> está registrado, te hemos enviado un enlace válido durante 1 hora. Si no te llega,{' '}
                <span onClick={() => setResetStep('code')} style={{ color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>usa tu código de recuperación</span>.
              </div>
            ) : (
              <>
                {!(mode === 'reset' && resetStep === 'link') && (
                  <>
                    <label style={label}>Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="tucorreo@ejemplo.com" style={input} autoFocus />
                  </>
                )}

                {mode === 'reset' && resetStep === 'code' && (
                  <>
                    <label style={label}>Código de recuperación</label>
                    <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="XXXX-XXXX-XXXX-XXXX" style={input} />
                  </>
                )}

                {!(mode === 'reset' && resetStep === 'email') && (
                  <>
                    <label style={label}>{mode === 'reset' ? 'Nueva contraseña' : 'Contraseña'} {mode !== 'login' && <span style={{ color: 'var(--muted)' }}>(mín. 6)</span>}</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="••••••••" style={input} autoFocus={mode === 'reset' && resetStep === 'link'} />
                  </>
                )}

                <button className="btn btn-gold" onClick={submit} disabled={busy} style={{ width: '100%', justifyContent: 'center', padding: '11px' }}>
                  {busy ? '⏳…' : submitLabel}
                </button>
              </>
            )}

            {mode === 'register' && (
              <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '10px', color: 'var(--muted)' }}>
                Al crear una cuenta aceptas nuestra{' '}
                <a href="/privacidad.html" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>Política de Privacidad</a>.
              </div>
            )}

            <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.9 }}>
              {mode === 'login' && <>¿No tienes cuenta? <span onClick={() => setMode('register')} style={{ color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>Regístrate</span><br /><span onClick={() => { setMode('reset'); setResetStep('email'); }} style={{ color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline' }}>¿Olvidaste tu contraseña?</span></>}
              {mode === 'register' && <>¿Ya tienes cuenta? <span onClick={() => setMode('login')} style={{ color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>Inicia sesión</span></>}
              {mode === 'reset' && resetStep === 'code' && <span onClick={() => setResetStep('email')} style={{ color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>← Enviar enlace por email en su lugar</span>}
              {mode === 'reset' && (resetStep === 'email' || resetStep === 'sent') && <span onClick={() => setMode('login')} style={{ color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>← Volver a iniciar sesión</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
