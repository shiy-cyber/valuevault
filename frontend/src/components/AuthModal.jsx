import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';

export default function AuthModal({ open, onClose, onAuth, toast, presetCode, resetLink }) {
  const { t } = useTranslation();
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
        if (!email.trim() || !password) throw new Error(t('auth.errors.emailPassword'));
        onAuth(await api.login(email, password)); toast?.(t('auth.toast.loggedIn')); close();
      } else if (mode === 'register') {
        if (!email.trim() || !password) throw new Error(t('auth.errors.emailPassword'));
        const r = await api.register(email, password);
        setDisplayCode(r.recoveryCode); setPendingAuth({ token: r.token, user: r.user });
        toast?.(t('auth.toast.accountCreated'));
      } else if (resetStep === 'email') {
        if (!email.trim()) throw new Error(t('auth.errors.email'));
        await api.forgotPassword(email);
        setResetStep('sent');
      } else if (resetStep === 'link') {
        if (!password) throw new Error(t('auth.errors.newPassword'));
        onAuth(await api.resetWithLink(resetLink.email, resetLink.token, password));
        toast?.(t('auth.toast.passwordReset')); close();
      } else { // resetStep === 'code'
        if (!email.trim() || !code.trim() || !password) throw new Error(t('auth.errors.resetFields'));
        onAuth(await api.reset(email, code, password)); toast?.(t('auth.toast.passwordReset')); close();
      }
    } catch (e) { toast?.(t('toast.error', { message: e.message })); }
    finally { setBusy(false); }
  };

  const continueFromCode = () => {
    const auth = pendingAuth;
    setDisplayCode(null); setPendingAuth(null);
    if (auth) { onAuth(auth); close(); } else { close(); }
  };

  const input = { width: '100%', marginTop: '6px', marginBottom: '14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '11px 12px', color: 'var(--text)', fontFamily: "'DM Mono',monospace", fontSize: '14px', boxSizing: 'border-box' };
  const label = { fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", letterSpacing: '0.5px' };
  const titles = { login: t('auth.titles.login'), register: t('auth.titles.register'), reset: t('auth.titles.reset') };
  const submitLabel = mode === 'login' ? t('auth.submit.login') : mode === 'register' ? t('auth.submit.register')
    : resetStep === 'email' ? t('auth.submit.sendLink') : t('auth.submit.reset');

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '26px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,.4)' }}>

        {displayCode ? (
          /* ─── Pantalla del código de recuperación ─── */
          <>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '19px', fontWeight: 700, marginBottom: '8px' }}>{t('auth.recoveryCode.title')}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '16px' }}>
              {t('auth.recoveryCode.desc')} <b>{t('auth.recoveryCode.neverShownAgain')}</b>
            </div>
            <div style={{ background: 'var(--surface2)', border: '1px dashed var(--gold)', borderRadius: '10px', padding: '16px', textAlign: 'center', fontFamily: "'DM Mono',monospace", fontSize: '20px', fontWeight: 700, color: 'var(--gold)', letterSpacing: '2px', wordBreak: 'break-all' }}>{displayCode}</div>
            <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}
              onClick={() => { navigator.clipboard?.writeText(displayCode); toast?.(t('auth.toast.codeCopied')); }}>{t('auth.recoveryCode.copy')}</button>
            <button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center', marginTop: '10px', padding: '11px' }} onClick={continueFromCode}>{t('auth.recoveryCode.continue')}</button>
          </>
        ) : (
          /* ─── Login / Registro / Reset ─── */
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '19px', fontWeight: 700 }}>{titles[mode]}</div>
              <button onClick={close} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '18px' }}>
              {mode === 'login' ? t('auth.subtitle.login')
                : mode === 'register' ? t('auth.subtitle.register')
                : resetStep === 'email' ? t('auth.subtitle.resetEmail')
                : resetStep === 'sent' ? t('auth.subtitle.resetSent')
                : resetStep === 'link' ? t('auth.subtitle.resetLink')
                : t('auth.subtitle.resetCode')}
            </div>

            {mode === 'register' && (
              <div style={{ display: 'flex', gap: '8px', background: 'var(--surface2)', borderRadius: '8px', padding: '10px 12px', marginBottom: '16px', fontSize: '10.5px', color: 'var(--muted)', lineHeight: 1.6 }}>
                <span>📭</span>
                <span>{t('auth.registerNote.prefix')} <b>{t('auth.registerNote.bold')}</b> {t('auth.registerNote.suffix')}</span>
              </div>
            )}

            {mode === 'reset' && resetStep === 'sent' ? (
              <div style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '14px', marginBottom: '10px', fontSize: '12px', color: 'var(--text)', lineHeight: 1.7 }}>
                {t('auth.resetSentNotice.before')} <b>{email}</b> {t('auth.resetSentNotice.after')}{' '}
                <span onClick={() => setResetStep('code')} style={{ color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>{t('auth.resetSentNotice.link')}</span>.
              </div>
            ) : (
              <>
                {!(mode === 'reset' && resetStep === 'link') && (
                  <>
                    <label style={label}>{t('auth.labels.email')}</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder={t('auth.placeholders.email')} style={input} autoFocus />
                  </>
                )}

                {mode === 'reset' && resetStep === 'code' && (
                  <>
                    <label style={label}>{t('auth.labels.recoveryCode')}</label>
                    <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && submit()} placeholder={t('auth.placeholders.code')} style={input} />
                  </>
                )}

                {!(mode === 'reset' && resetStep === 'email') && (
                  <>
                    <label style={label}>{mode === 'reset' ? t('auth.labels.newPassword') : t('auth.labels.password')} {mode !== 'login' && <span style={{ color: 'var(--muted)' }}>{t('auth.labels.minChars')}</span>}</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="••••••••" style={input} autoFocus={mode === 'reset' && resetStep === 'link'} />
                  </>
                )}

                <button className="btn btn-gold" onClick={submit} disabled={busy} style={{ width: '100%', justifyContent: 'center', padding: '11px' }}>
                  {busy ? t('common.busy') : submitLabel}
                </button>
              </>
            )}

            {mode === 'register' && (
              <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '10px', color: 'var(--muted)' }}>
                {t('auth.registerTerms.prefix')}{' '}
                <a href="/privacidad.html" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>{t('auth.registerTerms.link')}</a>.
              </div>
            )}

            <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.9 }}>
              {mode === 'login' && <>{t('auth.footer.noAccount')} <span onClick={() => setMode('register')} style={{ color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>{t('auth.footer.register')}</span><br /><span onClick={() => { setMode('reset'); setResetStep('email'); }} style={{ color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline' }}>{t('auth.footer.forgotPassword')}</span></>}
              {mode === 'register' && <>{t('auth.footer.haveAccount')} <span onClick={() => setMode('login')} style={{ color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>{t('auth.footer.login')}</span></>}
              {mode === 'reset' && resetStep === 'code' && <span onClick={() => setResetStep('email')} style={{ color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>{t('auth.footer.backToEmailLink')}</span>}
              {mode === 'reset' && (resetStep === 'email' || resetStep === 'sent') && <span onClick={() => setMode('login')} style={{ color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>{t('auth.footer.backToLogin')}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
