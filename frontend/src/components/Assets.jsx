import React, { useState } from 'react';
import AssetRow from './AssetRow.jsx';

const STRATS = [['all','Todos'],['value','Value'],['growth','Growth'],['dividend','Dividend'],['garp','GARP'],['momentum','Momentum'],['hidden','Gemas Ocultas']];
const TIMES = [['short','Corto Plazo'],['medium','Medio Plazo'],['long','Largo Plazo']];
const RISKS = [['low','Riesgo Bajo'],['medium','Riesgo Medio'],['high','Riesgo Alto']];

export default function Assets({ assets, notes, theme, onNotes, onEdit, onDelete, onRefreshData }) {
  const [strat, setStrat] = useState('all');
  const [time, setTime] = useState(null);
  const [risk, setRisk] = useState(null);
  const noteCount = (id) => notes.filter(n => n.assetId === id).length;

  const filtered = assets.filter(a => {
    const ms = strat === 'all' || a.strategies.includes(strat);
    const mt = !time || a.time.includes(time);
    const mr = !risk || a.risk === risk;
    return ms && mt && mr;
  });

  const toggle = (cur, val, set) => set(cur === val ? null : val);

  return (
    <div className="section active">
      <div className="filters-bar">
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
          {STRATS.map(([k, l]) => (
            <button key={k} className={`filter-chip${strat === k ? ' active' : ''}`} onClick={() => setStrat(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="filters-bar">
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
          {TIMES.map(([k, l]) => (
            <button key={k} className={`filter-chip${time === k ? ' active' : ''}`} onClick={() => toggle(time, k, setTime)}>{l}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginLeft:'6px' }}>
          {RISKS.map(([k, l]) => (
            <button key={k} className={`filter-chip${risk === k ? ' active' : ''}`} onClick={() => toggle(risk, k, setRisk)}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginTop:'16px' }}>
        {filtered.length
          ? filtered.map(a => <AssetRow key={a.id} a={a} noteCount={noteCount(a.id)} theme={theme} onNotes={onNotes} onEdit={onEdit} onDelete={onDelete} onRefreshData={onRefreshData} />)
          : <div className="empty-state"><div className="empty-icon">◈</div><div className="empty-text">No hay activos con estos filtros</div></div>}
      </div>
    </div>
  );
}
