import React, { useState, useRef, useEffect } from 'react';
import AssetRow from './AssetRow.jsx';

const STRATS = [['value','Value'],['growth','Growth'],['dividend','Dividend'],['garp','GARP'],['momentum','Momentum'],['hidden','Gemas Ocultas']];
const TIMES = [['short','Corto Plazo'],['medium','Medio Plazo'],['long','Largo Plazo']];
const RISKS = [['low','Riesgo Bajo'],['medium','Riesgo Medio'],['high','Riesgo Alto']];

function Dropdown({ title, items, list, set, open, onOpen }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) onOpen(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, onOpen]);

  const toggle = (val) => set(list.includes(val) ? list.filter(v => v !== val) : [...list, val]);

  return (
    <div className="filter-dd" ref={ref}>
      <button className={`filter-dd-btn${list.length ? ' active' : ''}`} onClick={() => onOpen(open ? null : title)}>
        {title}{list.length ? ` (${list.length})` : ''}<span className="filter-dd-caret">▾</span>
      </button>
      {open ? (
        <div className="filter-dd-panel">
          {items.map(([k, l]) => (
            <button key={k} className={`filter-chip${list.includes(k) ? ' active' : ''}`} onClick={() => toggle(k)}>{l}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Assets({ assets, notes, theme, fxRates, onNotes, onEdit, onDelete, onRefreshData, onRefreshQuality }) {
  const [strats, setStrats] = useState([]);
  const [times, setTimes] = useState([]);
  const [risks, setRisks] = useState([]);
  const [open, setOpen] = useState(null);
  const noteCount = (id) => notes.filter(n => n.assetId === id).length;

  const clearAll = () => { setStrats([]); setTimes([]); setRisks([]); };
  const hasFilters = strats.length || times.length || risks.length;

  const filtered = assets.filter(a => {
    // Dentro de cada categoría: O (cualquiera de los marcados). Entre categorías: Y.
    const ms = !strats.length || strats.some(s => a.strategies.includes(s));
    const mt = !times.length || times.some(t => a.time.includes(t));
    const mr = !risks.length || risks.includes(a.risk);
    return ms && mt && mr;
  });

  return (
    <div className="section active">
      <div className="filter-dds">
        <Dropdown title="Tipo" items={STRATS} list={strats} set={setStrats} open={open === 'Tipo'} onOpen={setOpen} />
        <Dropdown title="Plazo" items={TIMES} list={times} set={setTimes} open={open === 'Plazo'} onOpen={setOpen} />
        <Dropdown title="Riesgo" items={RISKS} list={risks} set={setRisks} open={open === 'Riesgo'} onOpen={setOpen} />
        {hasFilters ? (
          <button className="filter-chip" style={{ borderStyle:'dashed' }} onClick={clearAll}>✕ Limpiar</button>
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
