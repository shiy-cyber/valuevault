import React, { useState, useRef, useEffect } from 'react';
import { answer, WELCOME } from '../lib/assistantBrain.js';

// Asistente interno de ValueVault — widget de chat flotante, basado en reglas
// (sin IA externa, sin API, sin coste). Responde sobre la app, definiciones y
// los datos de la cartera del usuario, todo en el navegador.
export default function Assistant({ assets, notes, fxRates, go }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([{ role: 'bot', ...WELCOME }]);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, open]);

  const send = (text) => {
    const t = (text || '').trim();
    if (!t) return;
    const reply = answer(t, { assets, notes, fxRates, go });
    setMessages(m => [...m, { role: 'user', text: t }, { role: 'bot', ...reply }]);
    setInput('');
  };

  const onAction = (section) => { setOpen(false); go && go(section); };

  return (
    <>
      {/* Botón flotante — spark SVG hecho a mano (sin emoji) con pulso dorado */}
      <button
        className="vv-assistant-fab"
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
        title="Asistente de ValueVault"
        style={{
          position: 'fixed', bottom: '20px', right: '20px', zIndex: 1200,
          width: '56px', height: '56px', borderRadius: '50%', cursor: 'pointer',
          border: 'none', color: '#181c22', lineHeight: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'radial-gradient(circle at 32% 28%, #e7cf86 0%, var(--gold) 55%, #b08f3e 100%)',
        }}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6 L18 18 M18 6 L6 18" />
          </svg>
        ) : (
          <svg className="vv-spark" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 1.5 L13.7 8.9 C13.9 9.8 14.2 10.1 15.1 10.3 L22.5 12 L15.1 13.7 C14.2 13.9 13.9 14.2 13.7 15.1 L12 22.5 L10.3 15.1 C10.1 14.2 9.8 13.9 8.9 13.7 L1.5 12 L8.9 10.3 C9.8 10.1 10.1 9.8 10.3 8.9 Z" />
            <path d="M18.5 2.5 L19.2 5.3 C19.3 5.7 19.4 5.8 19.8 5.9 L22.5 6.5 L19.8 7.1 C19.4 7.2 19.3 7.3 19.2 7.7 L18.5 10.5 L17.8 7.7 C17.7 7.3 17.6 7.2 17.2 7.1 L14.5 6.5 L17.2 5.9 C17.6 5.8 17.7 5.7 17.8 5.3 Z" opacity="0.85" />
          </svg>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: '84px', right: '20px', zIndex: 1200,
          width: 'min(370px, calc(100vw - 32px))', height: 'min(540px, calc(100vh - 130px))',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '14px',
          boxShadow: '0 8px 32px rgba(0,0,0,.45)', overflow: 'hidden',
        }}>
          {/* Cabecera */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>🤖 Asistente ValueVault</div>
            <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Local · sin coste · no envía datos fuera</div>
          </div>

          {/* Mensajes */}
          <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
                <div style={{
                  fontSize: '12.5px', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                  padding: '9px 12px', borderRadius: '12px',
                  color: m.role === 'user' ? '#1a1a1a' : 'var(--text)',
                  background: m.role === 'user' ? 'var(--gold)' : 'var(--surface)',
                  border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                }}>{m.text}</div>
                {m.action && (
                  <button className="btn btn-outline" onClick={() => onAction(m.action.section)}
                    style={{ marginTop: '6px', fontSize: '11px', padding: '4px 10px' }}>{m.action.label} ↗</button>
                )}
                {Array.isArray(m.chips) && m.chips.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {m.chips.map((c, j) => (
                      <button key={j} onClick={() => send(c.q)}
                        style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '14px', cursor: 'pointer',
                          background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>{c.label}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Entrada */}
          <div style={{ padding: '10px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', background: 'var(--surface)' }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(input); }}
              placeholder="Pregúntame algo…"
              style={{ flex: 1, fontSize: '12.5px', padding: '8px 11px', borderRadius: '10px',
                background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', outline: 'none' }}
            />
            <button className="btn btn-gold" onClick={() => send(input)} style={{ padding: '8px 14px', fontSize: '13px' }}>➤</button>
          </div>
        </div>
      )}
    </>
  );
}
