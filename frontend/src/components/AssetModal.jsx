import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const NUM_FIELDS = ['price','current','pe','fpe','pb','peg','evebitda','ps','eps','epsd','epsny','epsg','roe','roa','gm','om','nm','de','cr','qr','dy','pr','beta','w52h','w52l'];
const STRATS = [['value','Value'],['growth','Growth'],['dividend','Dividend'],['momentum','Momentum'],['garp','GARP'],['hidden','Gema Oculta']];
const TIMES = [['short','Corto Plazo'],['medium','Medio Plazo'],['long','Largo Plazo']];
const RISKS = [['low','Bajo'],['medium','Medio'],['high','Alto']];

const empty = () => ({
  ticker:'', name:'', sector:'', market:'', mcap:'', thesis:'',
  price:'', current:'', pe:'', fpe:'', pb:'', peg:'', evebitda:'', ps:'',
  eps:'', epsd:'', epsny:'', epsg:'', roe:'', roa:'', gm:'', om:'', nm:'',
  de:'', cr:'', qr:'', dy:'', pr:'', beta:'', w52h:'', w52l:'',
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
  const [form, setForm] = useState(empty());
  const [status, setStatus] = useState({ text: '', color: 'var(--muted)' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(editing
        ? { ...empty(), ...editing, strategies: editing.strategies || [], time: editing.time || [] }
        : { ...empty(), type: presetType });
      setStatus({ text: '', color: 'var(--muted)' });
    }
  }, [open, editing, presetType]);

  if (!open) return null;
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const toggle = (k, v) => setForm(prev => ({ ...prev, [k]: prev[k].includes(v) ? prev[k].filter(x => x !== v) : [...prev[k], v] }));

  async function lookup() {
    const ticker = (form.ticker || '').trim().toUpperCase();
    if (!ticker) { toast('Introduce un ticker primero'); return; }
    setBusy(true);
    setStatus({ text: 'Consultando Alpha Vantage…', color: 'var(--muted)' });
    try {
      const d = await api.lookup(ticker);
      setForm(prev => {
        const next = { ...prev, ticker };
        const apply = (k, v) => { if (v !== null && v !== undefined && v !== '') next[k] = v; };
        apply('name', d.name); apply('sector', d.sector); apply('market', d.market);
        next.current = d.current; if (!prev.price) next.price = d.current;
        ['pe','fpe','pb','peg','evebitda','ps','eps','epsd','epsny','epsg','roe','roa','gm','om','nm','beta','w52h','w52l','mcap'].forEach(k => {
          if (!prev[k] && d[k] !== null && d[k] !== undefined) next[k] = d[k];
        });
        return next;
      });
      setStatus({ text: `✓ ${d.name || ticker} · $${d.current} ${d.changePercent || ''} · ${d.market || ''}`, color: 'var(--green)' });
    } catch (e) {
      setStatus({ text: '⚠ ' + e.message, color: 'var(--red)' });
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const ticker = (form.ticker || '').trim().toUpperCase();
    if (!ticker || !form.name.trim()) { toast('Introduce ticker y nombre'); return; }
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
        <div className="modal-title">{editing ? `Editar — ${editing.ticker}` : 'Registrar Nuevo Activo'}</div>
        <div className="form-grid">
          <div className="form-group full">
            <label>Ticker / Símbolo</label>
            <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
              <input type="text" value={form.ticker} placeholder="ej. AAPL" style={{ textTransform:'uppercase', flex:1 }}
                onChange={e => set('ticker', e.target.value.toUpperCase())} />
              <button type="button" className="btn btn-gold" disabled={busy} onClick={lookup} style={{ whiteSpace:'nowrap', padding:'8px 14px', fontSize:'12px' }}>{busy ? '⏳…' : '🔍 Buscar'}</button>
            </div>
            <div style={{ fontSize:'11px', fontFamily:"'DM Mono',monospace", marginTop:'4px', minHeight:'15px', color: status.color }}>{status.text}</div>
          </div>

          <F label="Nombre Empresa" id="name" form={form} set={set} type="text" placeholder="Auto · editable" />
          <F label="Sector" id="sector" form={form} set={set} type="text" placeholder="Auto · editable" />
          <F label="Precio Entrada ($)" id="price" form={form} set={set} placeholder="Tu precio de compra" />
          <F label="Precio Actual ($)" id="current" form={form} set={set} placeholder="Auto · editable" />
          <F label="Mercado" id="market" form={form} set={set} type="text" placeholder="Auto · editable" />

          <F label="P/E Ratio" id="pe" form={form} set={set} />
          <F label="Forward P/E" id="fpe" form={form} set={set} />
          <F label="P/B Ratio" id="pb" form={form} set={set} />
          <F label="PEG Ratio" id="peg" form={form} set={set} />
          <F label="EV/EBITDA" id="evebitda" form={form} set={set} />
          <F label="Price/Sales" id="ps" form={form} set={set} />

          <F label="EPS" id="eps" form={form} set={set} />
          <F label="EPS Diluted" id="epsd" form={form} set={set} />
          <F label="EPS Next Year" id="epsny" form={form} set={set} />
          <F label="EPS Growth 5Y (%)" id="epsg" form={form} set={set} />

          <F label="ROE (%)" id="roe" form={form} set={set} />
          <F label="ROA (%)" id="roa" form={form} set={set} />
          <F label="Gross Margin (%)" id="gm" form={form} set={set} />
          <F label="Margen Operativo (%)" id="om" form={form} set={set} />
          <F label="Margen Neto (%)" id="nm" form={form} set={set} />

          <F label="Deuda/Equity" id="de" form={form} set={set} />
          <F label="Current Ratio" id="cr" form={form} set={set} />
          <F label="Quick Ratio" id="qr" form={form} set={set} />

          <F label="Dividend Yield (%)" id="dy" form={form} set={set} />
          <F label="Payout Ratio (%)" id="pr" form={form} set={set} />

          <F label="Beta" id="beta" form={form} set={set} />
          <F label="52W High" id="w52h" form={form} set={set} />
          <F label="52W Low" id="w52l" form={form} set={set} />
          <F label="Market Cap" id="mcap" form={form} set={set} type="text" />

          <div className="form-group full"><label>Tipo de lista</label>
            <div className="checkbox-group">
              <label className={`check-item${form.type === 'portfolio' ? ' selected' : ''}`} onClick={() => set('type', 'portfolio')}>◆ En cartera</label>
              <label className={`check-item${form.type === 'watchlist' ? ' selected' : ''}`} onClick={() => set('type', 'watchlist')}>★ Watchlist (seguimiento)</label>
            </div>
          </div>
          <div className="form-group full"><label>Estrategias</label>
            <div className="checkbox-group">
              {STRATS.map(([v, l]) => (
                <label key={v} className={`check-item${form.strategies.includes(v) ? ' selected' : ''}`} onClick={() => toggle('strategies', v)}>{l}</label>
              ))}
            </div>
          </div>
          <div className="form-group full"><label>Horizonte de Inversión</label>
            <div className="checkbox-group">
              {TIMES.map(([v, l]) => (
                <label key={v} className={`check-item${form.time.includes(v) ? ' selected' : ''}`} onClick={() => toggle('time', v)}>{l}</label>
              ))}
            </div>
          </div>
          <div className="form-group full"><label>Nivel de Riesgo</label>
            <div className="checkbox-group">
              {RISKS.map(([v, l]) => (
                <label key={v} className={`check-item${form.risk === v ? ' selected' : ''}`} onClick={() => set('risk', v)}>{l}</label>
              ))}
            </div>
          </div>
          <div className="form-group full"><label>Tesis de Inversión / Fundamentos de Valor</label>
            <textarea value={form.thesis} placeholder="Ventajas competitivas, catalizadores, métricas clave, margen de seguridad…" onChange={e => set('thesis', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-gold" onClick={save}>Guardar Activo</button>
        </div>
      </div>
    </div>
  );
}
