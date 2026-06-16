import React, { useState, useEffect } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { api } from '../lib/api.js';
import { fmt, getRiskW, riskLabel, riskColor, mvColor, tagList, changePct, insiderLinks, timeAgo, compositeScore, positionMetrics, fmtBase, fmtUsdCompact } from '../lib/format.js';

const ENGINE_LABEL = { momentum: 'A · Momentum', value: 'B · Valor', hidden: 'C · Gema oculta' };
const scoreColor = (s) => s == null ? 'var(--muted)' : s >= 67 ? 'var(--green)' : s >= 45 ? 'var(--orange)' : 'var(--red)';
// Recomendación de consenso → etiqueta + color
const REC_MAP = {
  strong_buy: ['Compra fuerte', 'var(--green)'], buy: ['Compra', 'var(--green)'],
  hold: ['Mantener', 'var(--orange)'], underperform: ['Infraponderar', 'var(--red)'],
  sell: ['Venta', 'var(--red)'], strong_sell: ['Venta fuerte', 'var(--red)'],
};

// Barra de un pilar del score (0-100)
function ScoreBar({ label, score }) {
  return (
    <div className="mv-item">
      <div className="mv-label">{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ flex: 1, height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${score ?? 0}%`, background: scoreColor(score), borderRadius: '3px' }} />
        </div>
        <div className="mv-val" style={{ color: scoreColor(score), minWidth: '28px', textAlign: 'right' }}>{score ?? '—'}</div>
      </div>
    </div>
  );
}

function MV({ label, val, suffix = '', good, warn }) {
  const v = parseFloat(val);
  const empty = val === null || val === undefined || val === '' || isNaN(v);
  const display = empty ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + suffix;
  return (
    <div className="mv-item">
      <div className="mv-label">{label}</div>
      <div className="mv-val" style={{ color: mvColor(val, good, warn) }}>{display}</div>
    </div>
  );
}

const RANGES = [['1mo','1M'],['6mo','6M'],['1y','1A'],['5y','5A']];

// Gráfico histórico de precio (carga perezosa)
function PriceHistory({ ticker, theme }) {
  const [range, setRange] = useState('6mo');
  const [points, setPoints] = useState(null);
  const [err, setErr] = useState(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    let alive = true;
    setPoints(null); setErr(null);
    api.history(ticker, range)
      .then(d => { if (alive) setPoints(d.points || []); })
      .catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [ticker, range]);

  const textColor = isDark ? '#7a8694' : '#6b7280';
  const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';
  const up = points && points.length > 1 && points.at(-1).close >= points[0].close;
  const color = up ? '#2ecc71' : '#e74c3c';

  const data = points && {
    labels: points.map(p => new Date(p.t).toISOString().slice(0, 10)),
    datasets: [{ data: points.map(p => p.close), borderColor: color, backgroundColor: color + '18', borderWidth: 2, pointRadius: 0, tension: 0.25, fill: true }],
  };
  const opts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, backgroundColor: isDark ? '#181c22' : '#fff', titleColor: textColor, bodyColor: textColor, borderColor: isDark ? '#2d3540' : '#e2e4e8', borderWidth: 1, callbacks: { label: c => '$' + c.parsed.y } } },
    scales: {
      x: { type: 'category', grid: { display: false }, ticks: { color: textColor, font: { family: 'DM Mono', size: 8 }, maxTicksLimit: 6, callback(i) { const v = this.getLabelForValue(i); return typeof v === 'string' ? v.slice(0, 7) : v; } } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 }, callback: v => '$' + v } },
    },
  };

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
        <div className="mv-section-label" style={{ margin: 0 }}>Evolución de Precio</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {RANGES.map(([k, l]) => (
            <button key={k} className={`filter-chip${range === k ? ' active' : ''}`} style={{ padding: '2px 9px', fontSize: '10px' }} onClick={() => setRange(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ position: 'relative', height: '160px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px' }}>
        {err ? <div style={{ color: 'var(--muted)', fontSize: '11px', textAlign: 'center', paddingTop: '60px' }}>Sin histórico disponible</div>
          : !points ? <div style={{ color: 'var(--muted)', fontSize: '11px', textAlign: 'center', paddingTop: '60px' }}>Cargando…</div>
          : <Line data={data} options={opts} />}
      </div>
    </div>
  );
}

// Mini-gráfico de barras del histórico de CapEx (5 años). AV devuelve los años
// de más reciente a más antiguo → se invierte para mostrar cronológico.
function CapexChart({ history, theme }) {
  const isDark = theme === 'dark';
  if (!Array.isArray(history) || history.length < 2) return null;
  const rows = [...history].reverse();
  const textColor = isDark ? '#7a8694' : '#6b7280';
  const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';
  const data = {
    labels: rows.map(r => r.year),
    datasets: [{ label: 'CapEx', data: rows.map(r => r.capex), backgroundColor: '#3a8eff', borderRadius: 3 }],
  };
  const opts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: isDark ? '#181c22' : '#fff', titleColor: textColor, bodyColor: textColor, borderColor: isDark ? '#2d3540' : '#e2e4e8', borderWidth: 1, callbacks: { label: c => fmtUsdCompact(c.parsed.y) } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: textColor, font: { family: 'DM Mono', size: 9 } } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'DM Mono', size: 8 }, callback: v => fmtUsdCompact(v) } },
    },
  };
  return (
    <div style={{ position: 'relative', height: '140px', marginTop: '8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px' }}>
      <Bar data={data} options={opts} />
    </div>
  );
}

// Narrativa IA: "en qué invierte la empresa" (categorías reales del 10-K).
// MEMORIA por ejercicio fiscal: se genera una vez por informe anual y se
// reutiliza SIN coste hasta que haya un informe más reciente (latestFiscalYear
// avanza al refrescar «📊 Fundamentales»). No hay regenerar de pago repetido.
function CapexNarrative({ assetId, cached, latestFiscalYear }) {
  const [data, setData] = useState(cached || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    try { setData(await api.capexNarrative(assetId)); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const fy = data?.fiscalYear;
  // Hay un informe anual más reciente que el guardado → ofrecer actualizar
  const needsUpdate = !!data && latestFiscalYear != null && String(fy ?? '') !== String(latestFiscalYear);

  return (
    <div style={{ marginTop: '8px', marginBottom: '12px' }}>
      {!data && (
        <button className="btn btn-outline" disabled={busy} onClick={load} style={{ fontSize: '11px', padding: '6px 12px' }}>
          {busy ? '⏳ Analizando…' : '🏭 ¿En qué invierte? (IA)'}
        </button>
      )}
      {err && <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '6px' }}>{err}</div>}
      {data && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
            <span title="Guardado en memoria: no se vuelve a cobrar hasta el próximo informe anual" style={{ fontSize: '9px', padding: '1px 8px', borderRadius: '10px', color: '#fff', background: needsUpdate ? 'var(--orange)' : 'var(--green)' }}>
              {needsUpdate ? '🧠 memoria (informe nuevo disponible)' : '🧠 en memoria · sin coste'}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.7, padding: '12px', background: 'var(--surface)', borderRadius: '8px', borderLeft: '3px solid var(--gold)', whiteSpace: 'pre-wrap' }}>
            {data.narrative}
          </div>
          {data.grounded === false && (
            <div style={{ fontSize: '10px', color: 'var(--orange)', marginTop: '4px' }}>⚠️ Generado sin acceso al informe anual — orientativo.</div>
          )}
          {Array.isArray(data.sources) && data.sources.length > 0 && (
            <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginTop: '6px' }}>
              {data.sources.map((s, i) => <a key={i} className="insider-link" href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a>)}
            </div>
          )}
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {needsUpdate ? (
              <>
                <span>📅 En memoria del ejercicio FY{fy || '—'} · hay un informe más reciente (FY{latestFiscalYear})</span>
                <button className="btn btn-outline" disabled={busy} onClick={load} style={{ fontSize: '10px', padding: '3px 9px' }}>
                  {busy ? '⏳…' : `🆕 Actualizar a FY${latestFiscalYear}`}
                </button>
              </>
            ) : (
              <span>📅 {fy ? `Informe FY${fy} · ` : ''}guardado en memoria · sin coste hasta el próximo informe anual</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Introducción breve de la empresa. Alpha Vantage rellena un perfil en inglés
// al buscar el ticker; el botón genera/regenera una intro en ESPAÑOL con IA
// (Haiku, sin web_search) y la cachea en la columna `description` (sin coste
// repetido al reabrir). brief() recorta solo el perfil largo en inglés.
function aboutBrief(text, max = 700) {
  const t = (text || '').trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max);
  const dot = slice.lastIndexOf('. ');
  return (dot > max * 0.5 ? slice.slice(0, dot + 1) : slice.trimEnd()) + ' …';
}

function CompanyIntro({ a }) {
  const [desc, setDesc] = useState(a.description || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => { setDesc(a.description || ''); setErr(null); }, [a.id, a.description]);

  const about = aboutBrief(desc);
  const generate = async (force) => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.companyIntro(a.id, force);
      if (r?.description) { setDesc(r.description); a.description = r.description; }
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginBottom: '12px' }}>
      <div className="mv-section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Sobre la Empresa</span>
        <button className="btn btn-outline" disabled={busy} onClick={() => generate(!!about)} style={{ fontSize: '10px', padding: '3px 9px' }}>
          {busy ? '⏳…' : (about ? '🔄 Regenerar 🇪🇸' : '🇪🇸 Generar en español (IA)')}
        </button>
      </div>
      {err && <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '4px' }}>{err}</div>}
      {about
        ? <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.7, padding: '12px', background: 'var(--surface)', borderRadius: '8px', borderLeft: '3px solid var(--gold)', marginTop: '6px' }}>{about}</div>
        : <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>Sin descripción. Pulsa «Generar en español» para una intro breve de la empresa (IA).</div>}
    </div>
  );
}

// Fila expandible de activo (usada en Dashboard, Mis Activos y Watchlist)
export default function AssetRow({ a, noteCount, theme, fxRates, onNotes, onEdit, onDelete, onRefreshData, onRefreshQuality }) {
  const [open, setOpen] = useState(false);
  const [busyData, setBusyData] = useState(false);
  const [busyQual, setBusyQual] = useState(false);
  const chg = changePct(a).toFixed(2);
  const isPos = chg >= 0;
  const live = timeAgo(a.priceUpdatedAt);
  const sc = compositeScore(a);
  const pos = positionMetrics(a, fxRates || {});
  const spread = (a.roic != null && a.wacc != null) ? +(a.roic - a.wacc).toFixed(1) : null;
  const rec = REC_MAP[a.recommendation] || null;
  const upside = (a.targetMean > 0 && a.current > 0) ? +((a.targetMean / a.current - 1) * 100).toFixed(1) : null;

  const doRefresh = async () => {
    if (busyData || !onRefreshData) return;
    setBusyData(true);
    try { await onRefreshData(a.id); } finally { setBusyData(false); }
  };
  const doQuality = async () => {
    if (busyQual || !onRefreshQuality) return;
    setBusyQual(true);
    try { await onRefreshQuality(a.id); } finally { setBusyQual(false); }
  };

  return (
    <div className="asset-row">
      <div className="arow-head" onClick={() => setOpen(o => !o)}>
        <div className="arow-left">
          <div className="arow-arrow" style={{ transform: open ? 'rotate(90deg)' : 'none', color: open ? 'var(--gold)' : 'var(--muted)' }}>▶</div>
          <div>
            <div className="arow-ticker">{a.ticker}{a.type === 'watchlist' && <span title="En seguimiento" style={{ color: 'var(--gold)', fontSize: '11px', marginLeft: '5px' }}>★</span>}</div>
            <div className="arow-name">{a.name}</div>
          </div>
        </div>
        <div className="arow-mid">
          <div className="arow-price">${fmt(a.current)}{live && <span title={`Precio actualizado ${live}`} style={{ color: 'var(--green)', fontSize: '8px', marginLeft: '4px', verticalAlign: 'middle' }}>●</span>}</div>
          <div className="arow-chg" style={{ color: isPos ? 'var(--green)' : 'var(--red)' }}>{isPos ? '+' : ''}{chg}%</div>
        </div>
        <div className="arow-tags">
          {tagList(a.strategies, a.time).map((t, i) => <span key={i} className={`tag ${t.cls}`}>{t.label}</span>)}
        </div>
        <div className="arow-risk">
          <div className="arow-risk-bar"><div style={{ height:'100%', borderRadius:'2px', width:`${getRiskW(a.risk)}%`, background: riskColor(a.risk) }} /></div>
          <div className="arow-risk-label">{riskLabel(a.risk)}</div>
        </div>
        <div className="arow-actions" onClick={(e) => e.stopPropagation()}>
          <button className="card-btn notes-btn" style={{ padding:'5px 9px', fontSize:'10px' }} onClick={() => onNotes(a.id)}>📝{noteCount > 0 ? ' ' + noteCount : ''}</button>
          <button className="card-btn" style={{ padding:'5px 9px', fontSize:'10px' }} onClick={() => onEdit(a)}>✏️</button>
          <button className="card-btn del" style={{ padding:'5px 9px', fontSize:'10px' }} onClick={() => onDelete(a)}>🗑</button>
        </div>
      </div>

      {open && (
        <div className="arow-panel">
          {(onRefreshData || onRefreshQuality) && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '10px' }}>
              {onRefreshQuality && (
                <button className="btn btn-outline" disabled={busyQual} onClick={doQuality} style={{ fontSize: '11px', padding: '6px 12px' }}>
                  {busyQual ? '⏳ Calculando…' : '📊 Fundamentales'}
                </button>
              )}
              {onRefreshData && (
                <button className="btn btn-outline" disabled={busyData} onClick={doRefresh} style={{ fontSize: '11px', padding: '6px 12px' }}>
                  {busyData ? '⏳ Actualizando…' : '🔄 Actualizar datos de mercado'}
                </button>
              )}
            </div>
          )}
          <PriceHistory ticker={a.ticker} theme={theme} />

          <CompanyIntro a={a} />

          <div className="mv-section-label">Score Compuesto <span style={{ color: scoreColor(sc.total) }}>· {sc.total ?? '—'}/100</span></div>
          <div className="mv-grid">
            <ScoreBar label="Valor" score={sc.value} />
            <ScoreBar label="Calidad" score={sc.quality} />
            <ScoreBar label={a.epsRev != null ? 'Momentum' : 'Momentum*'} score={sc.momentum} />
          </div>
          {a.epsRev == null && (
            <div style={{ fontSize: '10px', color: 'var(--muted)', margin: '-4px 0 12px' }}>*Momentum = proxy (rango 52s + crecimiento EPS). Pulsa «📊 Fundamentales» para añadir revisiones de analistas.</div>
          )}

          <div className="mv-section-label">Posición & Proceso</div>
          <div className="mv-grid">
            <div className="mv-item"><div className="mv-label">Tamaño</div><div className="mv-val">{a.shares > 0 ? `${fmt(a.shares)} ${a.currency || ''}` : '—'}</div></div>
            <div className="mv-item"><div className="mv-label">Valor (EUR)</div><div className="mv-val">{pos.sized ? fmtBase(pos.valueBase) : '—'}</div></div>
            <div className="mv-item"><div className="mv-label">P&L (EUR)</div><div className="mv-val" style={{ color: pos.sized && pos.pnlBase >= 0 ? 'var(--green)' : pos.sized ? 'var(--red)' : 'var(--muted)' }}>{pos.sized ? fmtBase(pos.pnlBase) : '—'}</div></div>
            <div className="mv-item"><div className="mv-label">Ret. divisa</div><div className="mv-val">{pos.curRet != null ? `${pos.curRet >= 0 ? '+' : ''}${(pos.curRet * 100).toFixed(1)}%` : '—'}</div></div>
            <div className="mv-item"><div className="mv-label">Motor α</div><div className="mv-val">{ENGINE_LABEL[a.engine] || '—'}</div></div>
            <MV label="Objetivo" val={a.target} suffix={a.currency ? ' ' + a.currency : ''} />
            <MV label="Stop" val={a.stop} suffix={a.currency ? ' ' + a.currency : ''} />
            <div className="mv-item"><div className="mv-label">Catalizador</div><div className="mv-val" style={{ fontSize: '11px' }}>{a.catalyst ? a.catalyst + (a.catalystDate ? ` (${a.catalystDate})` : '') : '—'}</div></div>
          </div>

          <div className="mv-section-label">Valoración</div>
          <div className="mv-grid">
            <MV label="P/E" val={a.pe} suffix="x" /><MV label="Fwd P/E" val={a.fpe} suffix="x" /><MV label="P/B" val={a.pb} suffix="x" />
            <MV label="PEG" val={a.peg} /><MV label="EV/EBITDA" val={a.evebitda} suffix="x" /><MV label="P/Sales" val={a.ps} suffix="x" />
          </div>

          <div className="mv-section-label">EPS & Revisiones</div>
          <div className="mv-grid">
            <MV label="EPS" val={a.eps} suffix="$" /><MV label="EPS Diluted" val={a.epsd} suffix="$" /><MV label="EPS Next Y" val={a.epsny} suffix="$" />
            <MV label="EPS Gr.5Y" val={a.epsg} suffix="%" good={10} warn={5} />
            <div className="mv-item"><div className="mv-label">Rev. EPS 30d</div><div className="mv-val" style={{ color: a.epsRev == null ? 'var(--muted)' : a.epsRev > 0 ? 'var(--green)' : a.epsRev < 0 ? 'var(--red)' : 'var(--text)' }}>{a.epsRev == null ? '—' : (a.epsRev > 0 ? '+' : '') + a.epsRev + '%'}</div></div>
          </div>

          <div className="mv-section-label">
            Consenso de Analistas
            {rec && <span style={{ marginLeft: '8px', fontSize: '10px', padding: '1px 7px', borderRadius: '10px', color: '#fff', background: rec[1] }}>{rec[0]}</span>}
          </div>
          <div className="mv-grid">
            <div className="mv-item"><div className="mv-label">Precio Objetivo</div><div className="mv-val">{a.targetMean > 0 ? fmt(a.targetMean) + (a.currency ? ' ' + a.currency : '') : '—'}</div></div>
            <div className="mv-item"><div className="mv-label">Potencial</div><div className="mv-val" style={{ color: upside == null ? 'var(--muted)' : upside >= 0 ? 'var(--green)' : 'var(--red)' }}>{upside == null ? '—' : (upside >= 0 ? '+' : '') + upside + '%'}</div></div>
            <div className="mv-item"><div className="mv-label">Recomendación</div><div className="mv-val" style={{ color: rec ? rec[1] : 'var(--muted)' }}>{rec ? rec[0] : '—'}</div></div>
            <div className="mv-item"><div className="mv-label">Nº Analistas</div><div className="mv-val">{a.numAnalysts > 0 ? a.numAnalysts : '—'}</div></div>
          </div>
          {a.targetMean == null && (
            <div style={{ fontSize: '10px', color: 'var(--muted)', margin: '-4px 0 12px' }}>Pulsa «📊 Fundamentales» para traer el consenso de analistas.</div>
          )}

          <div className="mv-section-label">Calidad del Negocio</div>
          <div className="mv-grid">
            <MV label="ROE" val={a.roe} suffix="%" good={15} warn={8} /><MV label="ROA" val={a.roa} suffix="%" good={10} warn={5} /><MV label="Gross Mg." val={a.gm} suffix="%" good={40} warn={20} />
            <MV label="Mg.Operativo" val={a.om} suffix="%" good={20} warn={10} /><MV label="Mg.Neto" val={a.nm} suffix="%" good={15} warn={8} />
          </div>

          <div className="mv-section-label">
            Calidad del Capital
            {spread != null && (
              <span style={{ marginLeft: '8px', fontSize: '10px', padding: '1px 7px', borderRadius: '10px', color: '#fff',
                background: spread > 0 ? 'var(--green)' : 'var(--red)' }}>
                {spread > 0 ? `✓ crea valor (+${spread})` : `✗ destruye valor (${spread})`}
              </span>
            )}
          </div>
          <div className="mv-grid">
            <MV label="ROIC" val={a.roic} suffix="%" good={15} warn={8} />
            <MV label="WACC" val={a.wacc} suffix="%" />
            <div className="mv-item"><div className="mv-label">ROIC − WACC</div><div className="mv-val" style={{ color: spread == null ? 'var(--muted)' : spread > 0 ? 'var(--green)' : 'var(--red)' }}>{spread == null ? '—' : (spread > 0 ? '+' : '') + spread + ' pp'}</div></div>
            <MV label="FCF Yield" val={a.fcfy} suffix="%" good={5} warn={3} />
          </div>
          {a.roic == null && (
            <div style={{ fontSize: '10px', color: 'var(--muted)', margin: '-4px 0 12px' }}>Pulsa «📊 ROIC / FCF» para calcularlo (Alpha Vantage).</div>
          )}

          <div className="mv-section-label">
            Gastos de Capital (CapEx)
            {a.capexProfile && (
              <span style={{ marginLeft: '8px', fontSize: '10px', padding: '1px 7px', borderRadius: '10px', color: '#fff', background: 'var(--gold)' }}>{a.capexProfile}</span>
            )}
          </div>
          <div className="mv-grid">
            <div className="mv-item"><div className="mv-label">CapEx anual</div><div className="mv-val">{fmtUsdCompact(a.capex)}</div></div>
            <MV label="CapEx / Ingresos" val={a.capexToRevenue} suffix="%" />
            <MV label="CapEx / Caja oper." val={a.capexToOCF} suffix="%" />
            <MV label="CapEx / Amortización" val={a.capexToDA} suffix="x" />
          </div>
          <CapexChart history={a.capexHistory} theme={theme} />
          {a.capex == null && (
            <div style={{ fontSize: '10px', color: 'var(--muted)', margin: '6px 0 0' }}>Pulsa «📊 Fundamentales» para calcular los gastos de capital.</div>
          )}
          <CapexNarrative assetId={a.id} cached={a.capexNarrative} latestFiscalYear={a.capexHistory?.[0]?.year} />

          <div className="mv-section-label">Solidez Financiera</div>
          <div className="mv-grid">
            <MV label="Deuda/Equity" val={a.de} /><MV label="Current Ratio" val={a.cr} good={1.5} warn={1} /><MV label="Quick Ratio" val={a.qr} good={1} warn={0.7} />
          </div>

          <div className="mv-section-label">Dividendo</div>
          <div className="mv-grid">
            <MV label="Div. Yield" val={a.dy} suffix="%" good={3} warn={1} /><MV label="Payout Ratio" val={a.pr} suffix="%" />
          </div>

          <div className="mv-section-label">Mercado</div>
          <div className="mv-grid">
            <MV label="Beta" val={a.beta} /><MV label="52W High" val={a.w52h} suffix="$" /><MV label="52W Low" val={a.w52l} suffix="$" />
            <div className="mv-item"><div className="mv-label">Mkt Cap</div><div className="mv-val">{a.mcap || '—'}</div></div>
          </div>

          <div className="mv-section-label">Tesis de Inversión</div>
          <div style={{ fontSize:'12px', color:'var(--muted)', lineHeight:1.7, padding:'12px', background:'var(--surface)', borderRadius:'8px', borderLeft:'3px solid var(--gold)', marginBottom:'12px' }}>
            {a.thesis || 'Sin tesis registrada.'}
          </div>

          <div className="mv-section-label">Insiders & Institucionales</div>
          <div style={{ display:'flex', gap:'7px', flexWrap:'wrap' }}>
            {insiderLinks(a.ticker).map((l, i) => <a key={i} className="insider-link" href={l.url} target="_blank" rel="noreferrer">{l.label}</a>)}
          </div>
        </div>
      )}
    </div>
  );
}
