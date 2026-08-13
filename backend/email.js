// ─────────────────────────────────────────────────────────────
// Envío de email transaccional (Resend). Único uso actual: enlace de
// recuperación de contraseña. Si RESEND_API_KEY no está configurada (dev
// local sin clave), no falla: registra un aviso y sigue — el código de
// recuperación existente sigue funcionando como alternativa.
// ─────────────────────────────────────────────────────────────
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
// Hasta verificar el dominio valuevault.es en Resend, se envía desde su
// dominio de pruebas (onboarding@resend.dev, sin verificación DNS).
const FROM = process.env.RESEND_FROM_EMAIL || 'ValueVault <onboarding@resend.dev>';
const APP_URL = process.env.PUBLIC_APP_URL || 'https://valuevault.es';

export async function sendPasswordResetEmail(to, email, token) {
  if (!resend) { console.warn('[email] RESEND_API_KEY no configurada — email de recuperación no enviado'); return; }
  const link = `${APP_URL}/?reset=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Restablece tu contraseña — ValueVault',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1a1d23;">
        <h2 style="color:#c9a84c;">ValueVault</h2>
        <p>Has pedido restablecer tu contraseña. Este enlace caduca en <b>1 hora</b> y solo sirve una vez.</p>
        <p style="margin:24px 0;">
          <a href="${link}" style="background:#c9a84c;color:#0a0c0f;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Restablecer contraseña</a>
        </p>
        <p style="font-size:12px;color:#6b7280;">Si no has sido tú, ignora este email — tu contraseña actual sigue siendo válida.</p>
      </div>
    `,
  });
}
