import React from 'react';

// Resalta $TICKER y @handle dentro de un texto de usuario.
// Trocea el string y devuelve nodos React (cada trozo es texto que React
// escapa por defecto) → sin dangerouslySetInnerHTML, contenido inerte.
const TOKEN_RE = /(\$[A-Za-z]{1,6}(?:\.[A-Za-z]{1,2})?|@[a-z0-9_]{3,20})/g;

export default function RichText({ text, onTicker, onHandle }) {
  const parts = String(text || '').split(TOKEN_RE);
  return (
    <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {parts.map((part, i) => {
        if (/^\$[A-Za-z]/.test(part)) {
          const t = part.slice(1).toUpperCase();
          return <span key={i} onClick={onTicker ? () => onTicker(t) : undefined}
            style={{ color: 'var(--gold)', fontWeight: 600, cursor: onTicker ? 'pointer' : 'default' }}>{part}</span>;
        }
        if (/^@[a-z0-9_]/i.test(part)) {
          const hndl = part.slice(1).toLowerCase();
          return <span key={i} onClick={onHandle ? () => onHandle(hndl) : undefined}
            style={{ color: 'var(--blue)', fontWeight: 600, cursor: onHandle ? 'pointer' : 'default' }}>{part}</span>;
        }
        return part;
      })}
    </span>
  );
}
