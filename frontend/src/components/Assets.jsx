import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import AssetRow from './AssetRow.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

const STRAT_KEYS = ['value','growth','dividend','garp','momentum','hidden'];
const TIME_KEYS = ['short','medium','long'];
const RISK_KEYS = ['low','medium','high'];

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
  const { t } = useTranslation();
  const [strats, setStrats] = useState([]);
  const [times, setTimes] = useState([]);
  const [risks, setRisks] = useState([]);
  const [open, setOpen] = useState(null);
  const noteCount = (id) => notes.filter(n => n.assetId === id).length;

  const clearAll = () => { setStrats([]); setTimes([]); setRisks([]); };
  const hasFilters = strats.length || times.length || risks.length;
  const STRATS = STRAT_KEYS.map(k => [k, t('assetsPage.strats.' + k)]);
  const TIMES = TIME_KEYS.map(k => [k, t('assetsPage.times.' + k)]);
  const RISKS = RISK_KEYS.map(k => [k, t('assetsPage.risks.' + k)]);

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
        <Dropdown title={t('assetsPage.filters.type')} items={STRATS} list={strats} set={setStrats} open={open === t('assetsPage.filters.type')} onOpen={setOpen} />
        <Dropdown title={t('assetsPage.filters.term')} items={TIMES} list={times} set={setTimes} open={open === t('assetsPage.filters.term')} onOpen={setOpen} />
        <Dropdown title={t('assetsPage.filters.risk')} items={RISKS} list={risks} set={setRisks} open={open === t('assetsPage.filters.risk')} onOpen={setOpen} />
        {hasFilters ? (
          <button className="filter-chip" style={{ borderStyle:'dashed' }} onClick={clearAll}>{t('assetsPage.filters.clear')}</button>
        ) : null}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginTop:'16px' }}>
        {filtered.length
          ? filtered.map(a => <ErrorBoundary key={a.id}><AssetRow a={a} noteCount={noteCount(a.id)} theme={theme} fxRates={fxRates} onNotes={onNotes} onEdit={onEdit} onDelete={onDelete} onRefreshData={onRefreshData} onRefreshQuality={onRefreshQuality} /></ErrorBoundary>)
          : <div className="empty-state"><div className="empty-icon">◈</div><div className="empty-text">{t('assetsPage.emptyFiltered')}</div></div>}
      </div>
    </div>
  );
}
