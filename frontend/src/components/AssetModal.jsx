import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';

const NUM_FIELDS = ['price','current','pe','fpe','pb','peg','evebitda','ps','eps','epsd','epsny','epsg','roe','roa','gm','om','nm','de','cr','qr','dy','pr','beta','w52h','w52l','shares','target','stop'];
const STRATS = ['value','growth','dividend','momentum','garp','hidden'];
const TIMES = ['short','medium','long'];
const RISKS = ['low','medium','high'];
const CCYS = ['USD','EUR','GBP','JPY','HKD','CHF','CAD','AUD','CNY'];
const ENGINES = ['momentum','value','hidden'];

const empty = () => ({
  ticker:'', name:'', sector:'', market:'', mcap:'', thesis:'', description:'',
  price:'', current:'', pe:'', fpe:'', pb:'', peg:'', evebitda:'', ps:'',
  eps:'', epsd:'', epsny:'', epsg:'', roe:'', roa:'', gm:'', om:'', nm:'',
  de:'', cr:'', qr:'', dy:'', pr:'', beta:'', w52h:'', w52l:'',
  shares:'', currency:'USD', engine:'', target:'', stop:'', catalyst:'', catalystDate:'',
  strategies: [], time: [], risk: '', type: 'portfolio',
});

const F = ({ label, id, form, set, type = 'number', placeholder = 'Auto', style }) => (
  <div className="form-group" style={style}>
    <label>{label}</label>
    <input type={type} value={form[id] ?? ''} placeholder={placeholder}
      onChange={e => set(id, e.target.value)} />
  </div>
);

export default function AssetModal({ open, editing, presetType = 'portfolio', onClose, onSave, toast }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(empty());
  const [status, setStatus] = useState({ text: '', color: 'var(--muted)' });
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState([]); // autocompletado de símbolos (Yahoo)
  const searchTimer = useRef(null);

  useEffect(() => {
    if (open) {
      setForm(editing
        ? { ...empty(), ...editing, strategies: editing.strategies || [], time: editing.time || [] }
        : { ...empty(), type: presetType });
      setStatus({ text: '', color: 'var(--muted)' });
      setMatches([]);
    }
  }, [open, editing, presetType]);

  if (!open) return null;
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const toggle = (k, v) => setForm(prev => ({ ...prev, [k]: prev[k].includes(v) ? prev[k].filter(x => x !== v) : [...prev[k], v] }));

  // Autocompletado de ticker (Yahoo, gratis): busca al teclear, con debounce.
  function onTickerChange(v) {
    set('ticker', v.toUpperCase());
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = v.trim();
    if (q.length < 2) { setMatches([]); return; }
    searchTimer.current = setTimeout(async () => {
      try { setMatches(await api.search(q)); } catch { setMatches([]); }
    }, 350);
  }
  function pickMatch(m) {
    set('ticker', (m.symbol || '').toUpperCase());
    if (m.name) set('name', m.name);
    setMatches([]);
  }

  async function lookup() {
    const ticker = (form.ticker || '').trim().toUpperCase();
    if (!ticker) { toast(t('assetModal.errors.needTicker')); return; }
    setBusy(true);
    setStatus({ text: t('assetModal.status.looking'), color: 'var(--muted)' });
    try {
      const d = await api.lookup(ticker);
      setForm(prev => {
        const next = { ...prev, ticker };
        const apply = (k, v) => { if (v !== null && v !== undefined && v !== '') next[k] = v; };
        apply('name', d.name); apply('sector', d.sector); apply('market', d.market);
        if (!prev.description) apply('description', d.description);
        next.current = d.current; if (!prev.price) next.price = d.current;
        ['pe','fpe','pb','peg','evebitda','ps','eps','epsd','epsny','epsg','roe','roa','gm','om','nm','beta','w52h','w52l','mcap','dy'].forEach(k => {
          if (!prev[k] && d[k] !== null && d[k] !== undefined) next[k] = d[k];
        });
        return next;
      });
      setStatus({ text: t('assetModal.status.found', { name: d.name || ticker, price: d.current, change: d.changePercent || '', market: d.market || '' }), color: 'var(--green)' });
    } catch (e) {
      setStatus({ text: t('toast.error', { message: e.message }), color: 'var(--red)' });
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const ticker = (form.ticker || '').trim().toUpperCase();
    if (!ticker || !form.name.trim()) { toast(t('assetModal.errors.needTickerName')); return; }
    const payload = { ...form, ticker,
      strategies: form.strategies.length ? form.strategies : ['value'],
      time: form.time.length ? form.time : ['long'],
      risk: form.risk || 'medium',
      price: form.price || 0, current: form.current || 0 };
    NUM_FIELDS.forEach(k => { payload[k] = payload[k] === '' || payload[k] === null ? null : Number(payload[k]); });
    onSave(payload, editing ? editing.id : null);
  }

  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-title">{editing ? t('assetModal.title.edit', { ticker: editing.ticker }) : t('assetModal.title.new')}</div>
        <div className="form-grid">
          <div className="form-group full" style={{ position:'relative' }}>
            <label>{t('assetModal.tickerLabel')}</label>
            <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
              <input type="text" value={form.ticker} placeholder={t('assetModal.tickerPlaceholder')} style={{ textTransform:'uppercase', flex:1 }}
                autoComplete="off" onChange={e => onTickerChange(e.target.value)} />
              <button type="button" className="btn btn-gold" disabled={busy} onClick={lookup} style={{ whiteSpace:'nowrap', padding:'8px 14px', fontSize:'12px' }}>{busy ? t('common.busy') : t('assetModal.search')}</button>
            </div>
            {matches.length > 0 && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:30, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'8px', marginTop:'3px', maxHeight:'240px', overflowY:'auto', boxShadow:'0 8px 24px rgba(0,0,0,0.35)' }}>
                {matches.map((m, i) => (
                  <div key={i} onMouseDown={e => e.preventDefault()} onClick={() => pickMatch(m)}
                    style={{ padding:'8px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:'8px', borderBottom: i < matches.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontWeight:600, fontFamily:"'DM Mono',monospace", fontSize:'12px' }}>{m.symbol}</span>
                    <span style={{ color:'var(--muted)', fontSize:'11px', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name}</span>
                    <span style={{ color:'var(--muted)', fontSize:'10px', whiteSpace:'nowrap' }}>{m.exchange || ''}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize:'11px', fontFamily:"'DM Mono',monospace", marginTop:'4px', minHeight:'15px', color: status.color }}>{status.text}</div>
          </div>

          <F label={t('assetModal.fields.name')} id="name" form={form} set={set} type="text" placeholder={t('assetModal.autoEditable')} />
          <F label={t('assetModal.fields.sector')} id="sector" form={form} set={set} type="text" placeholder={t('assetModal.autoEditable')} />
          <F label={t('assetModal.fields.priceEntry')} id="price" form={form} set={set} placeholder={t('assetModal.fields.priceEntryPlaceholder')} />
          <F label={t('assetModal.fields.priceCurrent')} id="current" form={form} set={set} placeholder={t('assetModal.autoEditable')} />
          <F label={t('assetModal.fields.market')} id="market" form={form} set={set} type="text" placeholder={t('assetModal.autoEditable')} />

          <F label={t('assetModal.fields.shares')} id="shares" form={form} set={set} placeholder={t('assetModal.fields.sharesPlaceholder')} />
          <div className="form-group">
            <label>{t('assetModal.fields.currency')}</label>
            <select value={form.currency || 'USD'} onChange={e => set('currency', e.target.value)}>
              {CCYS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <F label={t('assetModal.fields.pe')} id="pe" form={form} set={set} />
          <F label={t('assetModal.fields.fpe')} id="fpe" form={form} set={set} />
          <F label={t('assetModal.fields.pb')} id="pb" form={form} set={set} />
          <F label={t('assetModal.fields.peg')} id="peg" form={form} set={set} />
          <F label={t('assetModal.fields.evebitda')} id="evebitda" form={form} set={set} />
          <F label={t('assetModal.fields.ps')} id="ps" form={form} set={set} />

          <F label={t('assetModal.fields.eps')} id="eps" form={form} set={set} />
          <F label={t('assetModal.fields.epsd')} id="epsd" form={form} set={set} />
          <F label={t('assetModal.fields.epsny')} id="epsny" form={form} set={set} />
          <F label={t('assetModal.fields.epsg')} id="epsg" form={form} set={set} />

          <F label={t('assetModal.fields.roe')} id="roe" form={form} set={set} />
          <F label={t('assetModal.fields.roa')} id="roa" form={form} set={set} />
          <F label={t('assetModal.fields.gm')} id="gm" form={form} set={set} />
          <F label={t('assetModal.fields.om')} id="om" form={form} set={set} />
          <F label={t('assetModal.fields.nm')} id="nm" form={form} set={set} />

          <F label={t('assetModal.fields.de')} id="de" form={form} set={set} />
          <F label={t('assetModal.fields.cr')} id="cr" form={form} set={set} />
          <F label={t('assetModal.fields.qr')} id="qr" form={form} set={set} />

          <F label={t('assetModal.fields.dy')} id="dy" form={form} set={set} />
          <F label={t('assetModal.fields.pr')} id="pr" form={form} set={set} />

          <F label={t('assetModal.fields.beta')} id="beta" form={form} set={set} />
          <F label={t('assetModal.fields.w52h')} id="w52h" form={form} set={set} />
          <F label={t('assetModal.fields.w52l')} id="w52l" form={form} set={set} />
          <F label={t('assetModal.fields.mcap')} id="mcap" form={form} set={set} type="text" />

          <div className="form-group full"><label>{t('assetModal.listType')}</label>
            <div className="checkbox-group">
              <label className={`check-item${form.type === 'portfolio' ? ' selected' : ''}`} onClick={() => set('type', 'portfolio')}>{t('assetModal.typePortfolio')}</label>
              <label className={`check-item${form.type === 'watchlist' ? ' selected' : ''}`} onClick={() => set('type', 'watchlist')}>{t('assetModal.typeWatchlist')}</label>
            </div>
          </div>
          <div className="form-group full"><label>{t('assetModal.strategies')}</label>
            <div className="checkbox-group">
              {STRATS.map(v => (
                <label key={v} className={`check-item${form.strategies.includes(v) ? ' selected' : ''}`} onClick={() => toggle('strategies', v)}>{t('assetModal.strats.' + v)}</label>
              ))}
            </div>
          </div>
          <div className="form-group full"><label>{t('assetModal.horizon')}</label>
            <div className="checkbox-group">
              {TIMES.map(v => (
                <label key={v} className={`check-item${form.time.includes(v) ? ' selected' : ''}`} onClick={() => toggle('time', v)}>{t('assetModal.times.' + v)}</label>
              ))}
            </div>
          </div>
          <div className="form-group full"><label>{t('assetModal.riskLevel')}</label>
            <div className="checkbox-group">
              {RISKS.map(v => (
                <label key={v} className={`check-item${form.risk === v ? ' selected' : ''}`} onClick={() => set('risk', v)}>{t('assetModal.risks.' + v)}</label>
              ))}
            </div>
          </div>
          <div className="form-group full"><label>{t('assetModal.alphaEngine')}</label>
            <div className="checkbox-group">
              {ENGINES.map(v => (
                <label key={v} className={`check-item${form.engine === v ? ' selected' : ''}`} onClick={() => set('engine', form.engine === v ? '' : v)}>{t('assetRow.engine.' + v)}</label>
              ))}
            </div>
          </div>
          <F label={t('assetModal.fields.target')} id="target" form={form} set={set} placeholder={t('assetModal.fields.targetPlaceholder')} />
          <F label={t('assetModal.fields.stop')} id="stop" form={form} set={set} placeholder={t('assetModal.fields.stopPlaceholder')} />
          <F label={t('assetModal.fields.catalyst')} id="catalyst" form={form} set={set} type="text" placeholder={t('assetModal.fields.catalystPlaceholder')} />
          <F label={t('assetModal.fields.catalystDate')} id="catalystDate" form={form} set={set} type="date" placeholder="" />

          <div className="form-group full"><label>{t('assetModal.about')}</label>
            <textarea value={form.description} placeholder={t('assetModal.aboutPlaceholder')} onChange={e => set('description', e.target.value)} />
          </div>

          <div className="form-group full"><label>{t('assetModal.thesis')}</label>
            <textarea value={form.thesis} placeholder={t('assetModal.thesisPlaceholder')} onChange={e => set('thesis', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>{t('assetModal.cancel')}</button>
          <button className="btn btn-gold" onClick={save}>{t('assetModal.save')}</button>
        </div>
      </div>
    </div>
  );
}
