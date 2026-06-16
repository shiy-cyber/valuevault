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
      {/* Botón flotante */}
      <button
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
        title="Asistente de ValueVault"
        style={{
          position: 'fixed', bottom: '20px', right: '20px', zIndex: 1200,
          width: '54px', height: '54px', borderRadius: '50%', cursor: 'pointer',
          border: '1px solid var(--gold)', background: 'var(--gold)', color: '#1a1a1a',
          fontSize: '24px', boxShadow: '0 4px 16px rgba(0,0,0,.35)', lineHeight: 1,
        }}
      >{open ? '✕' : '🤖'}</button>

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
