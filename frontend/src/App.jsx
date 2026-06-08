import React, { useState, useEffect, useCallback } from 'react';
import { api } from './lib/api.js';
import { NAV, PAGE_TITLES } from './data/constants.js';
import { timeAgo } from './lib/format.js';
import Dashboard from './components/Dashboard.jsx';
import Assets from './components/Assets.jsx';
import Watchlist from './components/Watchlist.jsx';
import Compare from './components/Compare.jsx';
import Charts from './components/Charts.jsx';
import Screener from './components/Screener.jsx';
import Learning from './components/Learning.jsx';
import Trends from './components/Trends.jsx';
import MarketMap from './components/MarketMap.jsx';
import Macro from './components/Macro.jsx';
import AssetModal from './components/AssetModal.jsx';
import LearnModal from './components/LearnModal.jsx';
import DetailModal from './components/DetailModal.jsx';

export default function App() {
  const [assets, setAssets] = useState([]);
  const [notes, setNotes] = useState([]);
  const [theme, setTheme] = useState('dark');
  const [section, setSection] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const [assetModal, setAssetModal] = useState({ open: false, editing: null, presetType: 'portfolio' });
  const [learnModal, setLearnModal] = useState({ open: false, linkedAssetId: null });
  const [detailId, setDetailId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Cartera vs seguimiento
  const portfolio = assets.filter(a => a.type !== 'watchlist');
  const watchlist = assets.filter(a => a.type === 'watchlist');

  // ─── Toast ──────────────────────────────────────────────
  const toast = useCallback((msg) => {
    setToastMsg(msg);
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => setToastMsg(''), 2800);
  }, []);

  // ─── Carga inicial ──────────────────────────────────────
  useEffect(() => {
    Promise.all([api.getAssets(), api.getNotes(), api.getConfig()])
      .then(([a, n, c]) => {
        setAssets(a); setNotes(n);
        const t = c.theme || 'dark'; setTheme(t);
        const stamps = a.map(x => x.priceUpdatedAt).filter(Boolean).sort();
        if (stamps.length) setLastRefresh(timeAgo(stamps[stamps.length - 1]));
        // Primera carga sin precios refrescados (datos semilla) → traer precios en vivo
        if (a.length && a.every(x => !x.priceUpdatedAt)) {
          api.refreshPrices()
            .then(r => { if (r.assets) { setAssets(r.assets); setLastRefresh(timeAgo(r.at)); } })
            .catch(() => {});
        }
      })
      .catch(e => toast('⚠ No se pudo conectar con el backend: ' + e.message));
  }, [toast]);

  // ─── Tema ───────────────────────────────────────────────
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    setTheme(t);
    api.setConfig('theme', t).catch(() => {});
  };

  const go = (id) => { setSection(id); setSidebarOpen(false); };

  // ─── CRUD activos ───────────────────────────────────────
  const saveAsset = async (payload, editId) => {
    try {
      if (editId) {
        const updated = await api.updateAsset(editId, payload);
        setAssets(prev => prev.map(a => a.id === editId ? updated : a));
        toast(`✓ ${updated.ticker} actualizado`);
      } else {
        const created = await api.createAsset(payload);
        setAssets(prev => [...prev, created]);
        toast(`✓ ${created.ticker} registrado`);
      }
      closeAssetModal();
    } catch (e) { toast('⚠ ' + e.message); }
  };

  const deleteAsset = async (a) => {
    if (!window.confirm(`¿Eliminar ${a.ticker}?`)) return;
    try {
      await api.deleteAsset(a.id);
      setAssets(prev => prev.filter(x => x.id !== a.id));
      setNotes(prev => prev.map(n => n.assetId === a.id ? { ...n, assetId: null } : n));
      toast(`🗑 ${a.ticker} eliminado`);
    } catch (e) { toast('⚠ ' + e.message); }
  };

  // ─── Refresco de precios en vivo (Yahoo) ────────────────
  const refreshPrices = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const r = await api.refreshPrices();
      if (r.assets) setAssets(r.assets);
      setLastRefresh(timeAgo(r.at));
      toast(`↻ ${r.updated}/${r.total} precios actualizados`);
    } catch (e) { toast('⚠ ' + e.message); }
    finally { setRefreshing(false); }
  };

  // Actualiza precio + fundamentales de UN activo (Alpha Vantage, Yahoo de respaldo)
  const refreshAssetData = async (id) => {
    try {
      const r = await api.refreshAssetData(id);
      setAssets(prev => prev.map(x => (x.id === id ? r.asset : x)));
      toast(r.source === 'alphavantage'
        ? `✓ ${r.asset.ticker}: datos actualizados`
        : `↻ ${r.asset.ticker}: solo precio (Alpha Vantage sin cuota hoy)`);
    } catch (e) { toast('⚠ ' + e.message); }
  };

  // ─── Notas ──────────────────────────────────────────────
  const saveNote = async (payload) => {
    try {
      const created = await api.createNote(payload);
      setNotes(prev => [created, ...prev]);
      setLearnModal({ open: false, linkedAssetId: null });
      toast('✓ Nota guardada');
    } catch (e) { toast('⚠ ' + e.message); }
  };

  // ─── Export / Reset ─────────────────────────────────────
  const exportData = async () => {
    try {
      const data = await api.getExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `valuevault-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
      toast('✓ Backup exportado');
    } catch (e) { toast('⚠ ' + e.message); }
  };

  const resetData = async () => {
    if (!window.confirm('¿Borrar todos los activos y notas? No se puede deshacer.')) return;
    try {
      await Promise.all(assets.map(a => api.deleteAsset(a.id)));
      await Promise.all(notes.map(n => api.deleteNote(n.id)));
      setAssets([]); setNotes([]);
      toast('🗑 Datos borrados');
    } catch (e) { toast('⚠ ' + e.message); }
  };

  const openNotes = (id) => setDetailId(id);
  const openEdit = (a) => setAssetModal({ open: true, editing: a, presetType: a.type || 'portfolio' });
  const newAsset = (presetType = 'portfolio') => setAssetModal({ open: true, editing: null, presetType });
  const closeAssetModal = () => setAssetModal({ open: false, editing: null, presetType: 'portfolio' });
  const detailAsset = detailId ? assets.find(a => a.id === detailId) : null;

  const navHandlers = { onNotes: openNotes, onEdit: openEdit, onDelete: deleteAsset, onRefreshData: refreshAssetData };

  return (
    <>
      {sidebarOpen && <div className="sidebar-overlay open" onClick={() => setSidebarOpen(false)} />}

      <nav className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="logo">
          <div className="logo-title">ValueVault</div>
          <div className="logo-sub">Asset Intelligence</div>
        </div>
        <div className="nav">
          {NAV.map((item, i) => item.section
            ? <div className="nav-section" key={'s' + i}>{item.section}</div>
            : <div key={item.id} className={`nav-item${section === item.id ? ' active' : ''}`} onClick={() => go(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}</div>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="stat-row"><span className="stat-label">Activos</span><span className="stat-val">{assets.length}</span></div>
          <div className="stat-row"><span className="stat-label">Notas</span><span className="stat-val">{notes.length}</span></div>
          <div className="sb-btns">
            <button className="sb-btn" onClick={exportData}>💾 Export</button>
            <button className="sb-btn" onClick={resetData}>🗑 Reset</button>
          </div>
        </div>
      </nav>

      <div className="main">
        <div className="topbar">
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <button className="menu-btn" onClick={() => setSidebarOpen(true)}>☰</button>
            <div className="page-title">{PAGE_TITLES[section]}</div>
          </div>
          <div className="topbar-right">
            <button className="theme-toggle" onClick={toggleTheme}>{theme === 'dark' ? '☀️' : '🌙'}</button>
            <button className="btn btn-outline" onClick={() => newAsset('portfolio')}>+ Nuevo Activo</button>
            <button className="btn btn-gold" onClick={() => go('screener')}>Screener ↗</button>
          </div>
        </div>

        <div className="content">
          {section === 'dashboard' && <Dashboard assets={portfolio} notes={notes} theme={theme} {...navHandlers} goAssets={() => go('assets')} onRefresh={refreshPrices} refreshing={refreshing} lastRefresh={lastRefresh} />}
          {section === 'assets' && <Assets assets={portfolio} notes={notes} theme={theme} {...navHandlers} />}
          {section === 'watchlist' && <Watchlist assets={watchlist} notes={notes} theme={theme} {...navHandlers} onAdd={() => newAsset('watchlist')} />}
          {section === 'compare' && <Compare assets={assets} />}
          {section === 'charts' && <Charts assets={portfolio} theme={theme} />}
          {section === 'screener' && <Screener />}
          {section === 'learning' && <Learning notes={notes} assets={assets} onAdd={(id) => setLearnModal({ open: true, linkedAssetId: id })} />}
          {section === 'trends' && <Trends theme={theme} toast={toast} />}
          {section === 'marketmap' && <MarketMap theme={theme} toast={toast} />}
          {section === 'macro' && <Macro />}
        </div>
      </div>

      <AssetModal open={assetModal.open} editing={assetModal.editing} presetType={assetModal.presetType} onClose={closeAssetModal} onSave={saveAsset} toast={toast} />
      <LearnModal open={learnModal.open} assets={assets} linkedAssetId={learnModal.linkedAssetId} onClose={() => setLearnModal({ open: false, linkedAssetId: null })} onSave={saveNote} toast={toast} />
      <DetailModal asset={detailAsset} notes={notes} onClose={() => setDetailId(null)} onAddNote={(id) => { setDetailId(null); setLearnModal({ open: true, linkedAssetId: id }); }} />

      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </>
  );
}
