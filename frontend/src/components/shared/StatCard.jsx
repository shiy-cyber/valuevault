import React from 'react';

// Tarjeta de estadística compacta (etiqueta + valor + subtexto opcional).
// Antes copiada carácter a carácter como `stat()` local en VolProfile,
// Gamma, TrendFollowing y SMC — un solo sitio para el estilo real.
export default function StatCard({ label, value, sub, color, size = 16 }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '12px 14px' }}>
      <div style={{ fontSize: '9px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: `${size}px`, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: '9px', color: 'var(--muted)' }}>{sub}</div>}
    </div>
  );
}
