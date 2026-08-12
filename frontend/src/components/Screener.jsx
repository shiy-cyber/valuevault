import React, { useState } from 'react';
import {
  SC_SECTORS, SC_SECTOR_LABELS, SC_CAP, SC_PE, SC_PB, SC_DIV, SC_ROE, SC_COUNTRY, SC_STRAT,
  SC_FPE, SC_PEG, SC_EVEBITDA, SC_EPS_NEXTY, SC_EPS_5Y, SC_DEBTEQ, SC_RECOM, SC_GROSSMARGIN, SC_OPERMARGIN, SC_NETMARGIN,
  finvizURL, stockAnalysisURL, yahooScreenerURL, SCREENER_TOOLS,
} from '../data/constants.js';

const Field = ({ label, value, onChange, options }) => (
  <div className="form-group">
    <label>{label}</label>
    <select value={value} onChange={e => onChange(e.target.value)}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  </div>
);

export default function Screener() {
  const [f, setF] = useState({
    sector:'', cap:'', pe:'', pb:'', div:'', roe:'', country:'', strat:'',
    fpe:'', peg:'', evebitda:'', epsNextY:'', eps5y:'', debteq:'', recom:'', grossmargin:'', opermargin:'', netmargin:'',
  });
  const set = (k) => (v) => setF(prev => ({ ...prev, [k]: v }));
  const sectorOpts = SC_SECTORS.map(s => [s, SC_SECTOR_LABELS[s] || s]);

  return (
    <div className="section active">
      <div className="screener-controls">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
          <div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'18px' }}>Stock Screener Real</div>
            <div style={{ fontSize:'11px', color:'var(--muted)', fontFamily:"'DM Mono',monospace", marginTop:'3px' }}>Configura los filtros y abre directamente en Finviz con datos en tiempo real</div>
          </div>
        </div>
        <div className="screener-grid">
          <Field label="Sector" value={f.sector} onChange={set('sector')} options={sectorOpts} />
          <Field label="Market Cap" value={f.cap} onChange={set('cap')} options={SC_CAP} />
          <Field label="P/E máximo" value={f.pe} onChange={set('pe')} options={SC_PE} />
          <Field label="P/B máximo" value={f.pb} onChange={set('pb')} options={SC_PB} />
          <Field label="Dividend Yield mín." value={f.div} onChange={set('div')} options={SC_DIV} />
          <Field label="ROE mínimo" value={f.roe} onChange={set('roe')} options={SC_ROE} />
          <Field label="País" value={f.country} onChange={set('country')} options={SC_COUNTRY} />
          <Field label="Estrategia" value={f.strat} onChange={set('strat')} options={SC_STRAT} />
          <Field label="Forward P/E máximo" value={f.fpe} onChange={set('fpe')} options={SC_FPE} />
          <Field label="PEG máximo" value={f.peg} onChange={set('peg')} options={SC_PEG} />
          <Field label="EV/EBITDA máximo" value={f.evebitda} onChange={set('evebitda')} options={SC_EVEBITDA} />
          <Field label="EPS Growth próximo año" value={f.epsNextY} onChange={set('epsNextY')} options={SC_EPS_NEXTY} />
          <Field label="EPS Growth próx. 5 años" value={f.eps5y} onChange={set('eps5y')} options={SC_EPS_5Y} />
          <Field label="Debt/Eq máximo" value={f.debteq} onChange={set('debteq')} options={SC_DEBTEQ} />
          <Field label="Recomendación analistas" value={f.recom} onChange={set('recom')} options={SC_RECOM} />
          <Field label="Gross Margin mínimo" value={f.grossmargin} onChange={set('grossmargin')} options={SC_GROSSMARGIN} />
          <Field label="Operating Margin mínimo" value={f.opermargin} onChange={set('opermargin')} options={SC_OPERMARGIN} />
          <Field label="Profit Margin mínimo" value={f.netmargin} onChange={set('netmargin')} options={SC_NETMARGIN} />
        </div>

        <div style={{ display:'flex', gap:'10px', marginTop:'16px', flexWrap:'wrap' }}>
          <button className="btn btn-gold" style={{ flex:1, padding:'12px' }} onClick={() => window.open(finvizURL(f), '_blank')}>📊 Abrir en Finviz con estos filtros</button>
          <button className="btn btn-outline" style={{ flex:1, padding:'12px' }} onClick={() => window.open(yahooScreenerURL, '_blank')}>📈 Abrir en Yahoo Finance</button>
          <button className="btn btn-outline" style={{ flex:1, padding:'12px' }} onClick={() => window.open(stockAnalysisURL(f), '_blank')}>🔍 Stock Analysis</button>
        </div>

        <div style={{ marginTop:'20px', borderTop:'1px solid var(--border)', paddingTop:'16px' }}>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'12px' }}>Herramientas complementarias</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:'10px' }}>
            {SCREENER_TOOLS.map((t, i) => (
              <a key={i} href={t.url} target="_blank" rel="noreferrer" style={{ textDecoration:'none' }}>
                <div className="screener-tool" style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'14px' }}
                  onMouseOver={e => e.currentTarget.style.borderColor = 'var(--gold)'}
                  onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  <div style={{ fontSize:'18px', marginBottom:'6px' }}>{t.icon}</div>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'11px', color:'var(--gold)', fontWeight:500 }}>{t.name}</div>
                  <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'3px' }}>{t.desc}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
