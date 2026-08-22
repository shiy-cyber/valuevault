import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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

// Construye [valor, etiqueta] a partir de una lista de claves 'uN'/'oN' (bajo/sobre
// un umbral numérico N) más '', 'low' o etiquetas especiales — la fase (u/o) y la
// unidad (%, ratio o ninguna) codifican el patrón; el texto real sale de i18next.
function buildThresholdOpts(keys, unit, t) {
  return keys.map(k => {
    if (k === '') return ['', t('screenerPage.any')];
    if (k === 'low') return ['low', t('screenerPage.negative')];
    const n = k.slice(1);
    if (k[0] === 'u') return [k, t('screenerPage.lessThan', { n })];
    return [k, unit === 'pct' ? t('screenerPage.morePct', { n }) : t('screenerPage.moreRatio', { n })];
  });
}

export default function Screener() {
  const { t } = useTranslation();
  const [f, setF] = useState({
    sector:'', cap:'', pe:'', pb:'', div:'', roe:'', country:'', strat:'',
    fpe:'', peg:'', evebitda:'', epsNextY:'', eps5y:'', debteq:'', recom:'', grossmargin:'', opermargin:'', netmargin:'',
  });
  const set = (k) => (v) => setF(prev => ({ ...prev, [k]: v }));
  const sectorOpts = SC_SECTORS.map(s => [s, s === '' ? t('screenerPage.allM') : (SC_SECTOR_LABELS[s] || s)]);
  const capOpts = SC_CAP.map(([k, name, range]) => [k, k === '' ? t('screenerPage.allM') : `${t('screenerPage.cap.' + k)} ${range}`]);
  const countryOpts = SC_COUNTRY.map(c => [c, c === '' ? t('screenerPage.allM') : t('screenerPage.countries.' + c)]);
  const stratOpts = SC_STRAT.map(s => [s, s === '' ? t('screenerPage.allF') : t('screenerPage.strats.' + s)]);
  const recomOpts = SC_RECOM.map(r => [r, r === '' ? t('screenerPage.any') : t('screenerPage.recom.' + r)]);
  const peOpts = buildThresholdOpts(SC_PE, 'plain', t);
  const pbOpts = buildThresholdOpts(SC_PB, 'plain', t);
  const divOpts = buildThresholdOpts(SC_DIV, 'pct', t);
  const roeOpts = buildThresholdOpts(SC_ROE, 'pct', t);
  const fpeOpts = buildThresholdOpts(SC_FPE, 'plain', t);
  const pegOpts = buildThresholdOpts(SC_PEG, 'plain', t);
  const evebitdaOpts = buildThresholdOpts(SC_EVEBITDA, 'plain', t);
  const epsNextYOpts = buildThresholdOpts(SC_EPS_NEXTY, 'pct', t);
  const eps5yOpts = buildThresholdOpts(SC_EPS_5Y, 'pct', t);
  const debteqOpts = buildThresholdOpts(SC_DEBTEQ, 'ratio', t);
  const grossmarginOpts = buildThresholdOpts(SC_GROSSMARGIN, 'pct', t);
  const opermarginOpts = buildThresholdOpts(SC_OPERMARGIN, 'pct', t);
  const netmarginOpts = buildThresholdOpts(SC_NETMARGIN, 'pct', t);

  return (
    <div className="section active">
      <div className="screener-controls">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
          <div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'18px' }}>{t('screenerPage.title')}</div>
            <div style={{ fontSize:'11px', color:'var(--muted)', fontFamily:"'DM Mono',monospace", marginTop:'3px' }}>{t('screenerPage.subtitle')}</div>
          </div>
        </div>
        <div className="screener-grid">
          <Field label={t('screenerPage.fields.sector')} value={f.sector} onChange={set('sector')} options={sectorOpts} />
          <Field label={t('screenerPage.fields.cap')} value={f.cap} onChange={set('cap')} options={capOpts} />
          <Field label={t('screenerPage.fields.pe')} value={f.pe} onChange={set('pe')} options={peOpts} />
          <Field label={t('screenerPage.fields.pb')} value={f.pb} onChange={set('pb')} options={pbOpts} />
          <Field label={t('screenerPage.fields.div')} value={f.div} onChange={set('div')} options={divOpts} />
          <Field label={t('screenerPage.fields.roe')} value={f.roe} onChange={set('roe')} options={roeOpts} />
          <Field label={t('screenerPage.fields.country')} value={f.country} onChange={set('country')} options={countryOpts} />
          <Field label={t('screenerPage.fields.strat')} value={f.strat} onChange={set('strat')} options={stratOpts} />
          <Field label={t('screenerPage.fields.fpe')} value={f.fpe} onChange={set('fpe')} options={fpeOpts} />
          <Field label={t('screenerPage.fields.peg')} value={f.peg} onChange={set('peg')} options={pegOpts} />
          <Field label={t('screenerPage.fields.evebitda')} value={f.evebitda} onChange={set('evebitda')} options={evebitdaOpts} />
          <Field label={t('screenerPage.fields.epsNextY')} value={f.epsNextY} onChange={set('epsNextY')} options={epsNextYOpts} />
          <Field label={t('screenerPage.fields.eps5y')} value={f.eps5y} onChange={set('eps5y')} options={eps5yOpts} />
          <Field label={t('screenerPage.fields.debteq')} value={f.debteq} onChange={set('debteq')} options={debteqOpts} />
          <Field label={t('screenerPage.fields.recom')} value={f.recom} onChange={set('recom')} options={recomOpts} />
          <Field label={t('screenerPage.fields.grossmargin')} value={f.grossmargin} onChange={set('grossmargin')} options={grossmarginOpts} />
          <Field label={t('screenerPage.fields.opermargin')} value={f.opermargin} onChange={set('opermargin')} options={opermarginOpts} />
          <Field label={t('screenerPage.fields.netmargin')} value={f.netmargin} onChange={set('netmargin')} options={netmarginOpts} />
        </div>

        <div style={{ display:'flex', gap:'10px', marginTop:'16px', flexWrap:'wrap' }}>
          <button className="btn btn-gold" style={{ flex:1, padding:'12px' }} onClick={() => window.open(finvizURL(f), '_blank')}>{t('screenerPage.openFinviz')}</button>
          <button className="btn btn-outline" style={{ flex:1, padding:'12px' }} onClick={() => window.open(yahooScreenerURL, '_blank')}>{t('screenerPage.openYahoo')}</button>
          <button className="btn btn-outline" style={{ flex:1, padding:'12px' }} onClick={() => window.open(stockAnalysisURL(f), '_blank')}>{t('screenerPage.openStockAnalysis')}</button>
        </div>

        <div style={{ marginTop:'20px', borderTop:'1px solid var(--border)', paddingTop:'16px' }}>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'12px' }}>{t('screenerPage.moreTools')}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:'10px' }}>
            {SCREENER_TOOLS.map((tool, i) => (
              <a key={i} href={tool.url} target="_blank" rel="noreferrer" style={{ textDecoration:'none' }}>
                <div className="screener-tool" style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'14px' }}
                  onMouseOver={e => e.currentTarget.style.borderColor = 'var(--gold)'}
                  onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  <div style={{ fontSize:'18px', marginBottom:'6px' }}>{tool.icon}</div>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'11px', color:'var(--gold)', fontWeight:500 }}>{tool.name}</div>
                  <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'3px' }}>{t('screenerPage.tools.' + tool.key)}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
