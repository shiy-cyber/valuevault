import React, { useState } from 'react';
import { TOPIC_MAP } from '../lib/format.js';

const TOPICS = [['all','Todos'],['value','Value Investing'],['growth','Growth'],['analysis','Análisis'],['macro','Macro'],['psychology','Psicología'],['strategy','Estrategia']];

export default function Learning({ notes, assets, onAdd }) {
  const [topic, setTopic] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = notes.filter(n => {
    const mt = topic === 'all' || n.topic === topic;
    const s = search.toLowerCase();
    const ms = !s || n.title.toLowerCase().includes(s) || n.content.toLowerCase().includes(s) || (n.tags || []).join(' ').toLowerCase().includes(s);
    return mt && ms;
  });

  return (
    <div className="section active">
      <div style={{ display:'flex', gap:'8px', marginBottom:'14px', alignItems:'center', flexWrap:'wrap' }}>
        <div className="search-bar" style={{ flex:1, minWidth:'220px', marginBottom:0 }}>
          <span className="search-icon">⌕</span>
          <input type="text" placeholder="Buscar notas, conceptos, activos…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-gold" onClick={() => onAdd(null)}>+ Añadir Nota</button>
      </div>
      <div className="filters-bar">
        {TOPICS.map(([k, l]) => (
          <button key={k} className={`filter-chip${topic === k ? ' active' : ''}`} onClick={() => setTopic(k)}>{l}</button>
        ))}
      </div>
      <div className="learning-grid">
        {filtered.length ? filtered.map(n => {
          const la = n.assetId ? assets.find(a => a.id === n.assetId) : null;
          return (
            <div className="learn-card" key={n.id}>
              <div className="learn-topic">{TOPIC_MAP[n.topic] || n.topic}</div>
              <div className="learn-title">{n.title}</div>
              <div className="learn-excerpt">{n.content}</div>
              {la && <div className="learn-asset-link">🔗 {la.ticker} — {la.name}</div>}
              <div className="learn-footer" style={{ marginTop:'8px' }}>
                <div className="learn-tags">{(n.tags || []).slice(0, 3).map((t, i) => <span key={i} className="tag tag-value" style={{ fontSize:'9px' }}>{t}</span>)}</div>
                <div className="learn-date">{n.date}</div>
              </div>
            </div>
          );
        }) : <div className="empty-state"><div className="empty-icon">◉</div><div className="empty-text">No hay notas con estos criterios</div></div>}
      </div>
    </div>
  );
}
