import React, { useState } from 'react';
import AssetRow from './AssetRow.jsx';

const STRATS = [['value','Value'],['growth','Growth'],['dividend','Dividend'],['garp','GARP'],['momentum','Momentum'],['hidden','Gemas Ocultas']];
const TIMES = [['short','Corto Plazo'],['medium','Medio Plazo'],['long','Largo Plazo']];
const RISKS = [['low','Riesgo Bajo'],['medium','Riesgo Medio'],['high','Riesgo Alto']];

export default function Assets({ assets, notes, theme, fxRates, onNotes, onEdit, onDelete, onRefreshData, onRefreshQuality }) {
  const [strats, setStrats] = useState([]);
  const [times, setTimes] = useState([]);
  const [risks, setRisks] = useState([]);
  const noteCount = (id) => notes.filter(n => n.assetId === id).length;

  // Activa/desactiva un valor dentro de su categoría (multi-selección)
  const toggle = (val, list, set) => set(list.includes(val) ? list.filter(v => v !== val) : [...list, val]);
  const clearAll = () => { setStrats([]); setTimes([]); setRisks([]); };
  const hasFilters = strats.length || times.length || risks.length;

  const filtered = assets.filter(a => {
    // Dentro de cada categoría: O (cualquiera de los marcados). Entre categorías: Y.
    const ms = !strats.length || strats.some(s => a.strategies.includes(s));
    const mt = !times.length || times.some(t => a.time.includes(t));
    const mr = !risks.length || risks.includes(a.risk);
    return ms && mt && mr;
  });

  const Group = ({ title, items, list, set }) => (
    <div className="filter-group">
      <label>{title}</label>
      <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
        {items.map(([k, l]) => (
          <button key={k} className={`filter-chip${list.includes(k) ? ' active' : ''}`} onClick={() => toggle(k, list, set)}>{l}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="section active">
      <div className="filters-bar" style={{ flexDirection:'column', alignItems:'stretch', gap:'12px' }}>
        <Group title="Tipo de valor" items={STRATS} list={strats} set={setStrats} />
        <Group title="Tiempo de inversión" items={TIMES} list={times} set={setTimes} />
        <Group title="Riesgo" items={RISKS} list={risks} set={setRisks} />
        {hasFilters ? (
          <button className="filter-chip" style={{ alignSelf:'flex-start', borderStyle:'dashed' }} onClick={clearAll}>✕ Limpiar filtros</button>
        ) : null}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginTop:'16px' }}>
        {filtered.length
          ? filtered.map(a => <AssetRow key={a.id} a={a} noteCount={noteCount(a.id)} theme={theme} fxRates={fxRates} onNotes={onNotes} onEdit={onEdit} onDelete={onDelete} onRefreshData={onRefreshData} onRefreshQuality={onRefreshQuality} />)
          : <div className="empty-state"><div className="empty-icon">◈</div><div className="empty-text">No hay activos con estos filtros</div></div>}
      </div>
    </div>
  );
}
