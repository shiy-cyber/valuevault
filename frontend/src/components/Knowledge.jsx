import React, { useState } from 'react';
import Learning from './Learning.jsx';
import Guide from './Guide.jsx';

// Sección "Aprendizaje" unificada: tus notas + el manual de uso, en pestañas.
export default function Knowledge({ notes, assets, onAdd, go }) {
  const [tab, setTab] = useState('notas'); // notas | manual

  return (
    <div className="section active">
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button className={`filter-chip${tab === 'notas' ? ' active' : ''}`} onClick={() => setTab('notas')}>◉ Mis notas</button>
        <button className={`filter-chip${tab === 'manual' ? ' active' : ''}`} onClick={() => setTab('manual')}>📖 Manual de uso</button>
      </div>
      {tab === 'notas'
        ? <Learning notes={notes} assets={assets} onAdd={onAdd} embed />
        : <Guide go={go} embed />}
    </div>
  );
}
