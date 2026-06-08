import React, { useState } from 'react';
import { MACRO_SOURCES, MACRO_CATS } from '../data/constants.js';

export default function Macro() {
  const [cat, setCat] = useState('all');
  const sources = cat === 'all' ? MACRO_SOURCES : MACRO_SOURCES.filter(s => s.cat === cat);

  return (
    <div className="section active">
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'20px 24px', marginBottom:'22px', borderLeft:'4px solid var(--gold)' }}>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'16px', marginBottom:'6px' }}>Investigación Macro</div>
        <div style={{ fontSize:'12px', color:'var(--muted)', lineHeight:1.7 }}>Fuentes clave para analizar el entorno macroeconómico global: tipos de interés, inflación, ciclos económicos, divisas, commodities y flujos de capital. Esenciales para contextualizar cualquier tesis de inversión.</div>
      </div>

      <div className="filters-bar" style={{ marginBottom:'18px' }}>
        {MACRO_CATS.map(c => (
          <button key={c.key} className={`filter-chip${cat === c.key ? ' active' : ''}`} onClick={() => setCat(c.key)}>{c.label}</button>
        ))}
      </div>

      <div id="macro-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:'14px' }}>
        {sources.map((s, i) => (
          <a key={i} href={s.url} target="_blank" rel="noreferrer" style={{ textDecoration:'none' }}>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'18px', transition:'all .2s', height:'100%', display:'flex', flexDirection:'column', gap:'8px' }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px var(--shadow)'; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px' }}>
                <div style={{ fontSize:'24px' }}>{s.icon}</div>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'9px', color:'var(--gold)', border:'1px solid rgba(201,168,76,.3)', padding:'2px 7px', borderRadius:'10px', whiteSpace:'nowrap' }}>{s.tag}</span>
              </div>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'14px', fontWeight:700, color:'var(--text)', lineHeight:1.3 }}>{s.name}</div>
              <div style={{ fontSize:'11px', color:'var(--muted)', lineHeight:1.7, flex:1 }}>{s.desc}</div>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--gold)', marginTop:'4px' }}>Abrir ↗</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
