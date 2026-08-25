import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, setToken, setNetworkStatusHandler } from './lib/api.js';
import { NAV } from './data/constants.js';
import { SUPPORTED_LANGS } from './i18n/index.js';
import { timeAgo } from './lib/format.js';
import { usePageMeta } from './lib/usePageMeta.js';

// Páginas de cartera privada del usuario: sin valor público, se marcan
// noindex (Fase 1 SEO — el resto de secciones sí es indexable).
const PRIVATE_SECTIONS = new Set(['dashboard', 'assets', 'watchlist', 'compare', 'charts', 'learning']);

// Componentes de página, cargados bajo demanda (uno por ruta): con rutas
// reales ya no hace falta empaquetar Gamma/SMC/Valuation/etc. en el bundle
// inicial — solo se descarga el código de la página que se está viendo.
const Dashboard = lazy(() => import('./components/Dashboard.jsx'));
const Assets = lazy(() => import('./components/Assets.jsx'));
const Watchlist = lazy(() => import('./components/Watchlist.jsx'));
const Compare = lazy(() => import('./components/Compare.jsx'));
const Charts = lazy(() => import('./components/Charts.jsx'));
const Screener = lazy(() => import('./components/Screener.jsx'));
const Valuation = lazy(() => import('./components/Valuation.jsx'));
const VolProfile = lazy(() => import('./components/VolProfile.jsx'));
const SMC = lazy(() => import('./components/SMC.jsx'));
const Gamma = lazy(() => import('./components/Gamma.jsx'));
const TrendFollowing = lazy(() => import('./components/TrendFollowing.jsx'));
const Knowledge = lazy(() => import('./components/Knowledge.jsx'));
const Trends = lazy(() => import('./components/Trends.jsx'));
const Indices = lazy(() => import('./components/Indices.jsx'));
const Sentiment = lazy(() => import('./components/Sentiment.jsx'));
const MarketMap = lazy(() => import('./components/MarketMap.jsx'));
const Macro = lazy(() => import('./components/Macro.jsx'));
const Community = lazy(() => import('./components/community/Community.jsx'));
const Thesis = lazy(() => import('./components/community/Thesis.jsx'));
const Profile = lazy(() => import('./components/community/Profile.jsx'));
const TickerPage = lazy(() => import('./components/community/TickerPage.jsx'));
const AboutUs = lazy(() => import('./components/AboutUs.jsx'));

// Siempre montados (modales/overlays globales, no dependen de la ruta) —
// se quedan en el bundle principal, no tiene sentido diferirlos.
import AssetModal from './components/AssetModal.jsx';
import LearnModal from './components/LearnModal.jsx';
import DetailModal from './components/DetailModal.jsx';
import AuthModal from './components/AuthModal.jsx';
import Notifications from './components/community/Notifications.jsx';
import AliasModal from './components/community/AliasModal.jsx';
import Assistant from './components/Assistant.jsx';
import Maintenance from './components/Maintenance.jsx';

// Fallback de Suspense mientras se descarga el chunk de una página.
function RouteFallback() {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", fontSize: '12px' }}>
      {t('common.loading')}
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  // Sección "lógica" derivada de la URL (sustituye al viejo useState('dashboard')).
  // /comunidad/u/:handle y /comunidad/ticker/:symbol se mapean a los mismos ids
  // pseudo-sección que usaba el código antiguo (profile/ticker) para no tocar
  // el resto de la lógica (PAGE_TITLES, resaltado de NAV, etc.).
  const path = location.pathname;
  const section = path === '/' ? 'dashboard'
    : path.startsWith('/comunidad/u/') ? 'profile'
    : path.startsWith('/comunidad/ticker/') ? 'ticker'
    : path.split('/')[1] || 'dashboard';

  const { t, i18n } = useTranslation();
  const [assets, setAssets] = useState([]);
  const [notes, setNotes] = useState([]);
  const [theme, setTheme] = useState('dark');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const [assetModal, setAssetModal] = useState({ open: false, editing: null, presetType: 'portfolio' });
  const [learnModal, setLearnModal] = useState({ open: false, linkedAssetId: null });
  const [detailId, setDetailId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [presetCode, setPresetCode] = useState(null);
  const [resetLink, setResetLink] = useState(null); // { email, token } — enlace de recuperación por email
  const [fxRates, setFxRates] = useState({ EUR: 1 });
  // Comunidad: perfil público propio (null si anónimo o sin alias aún)
  const [community, setCommunity] = useState(null);
  const [aliasOpen, setAliasOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  // Backend caído → mostramos pantalla de "en mantenimiento" en vez de errores
  const [backendDown, setBackendDown] = useState(false);
  const needsAlias = !!user && !community?.handle;
  const canInteract = !!user && !needsAlias;
  const requireInteract = () => { if (!user) setAuthOpen(true); else if (needsAlias) setAliasOpen(true); };

  // Cartera vs seguimiento
  // Memoizado: sin esto, cada render de App (toasts, sondeo de notificaciones
  // cada 60s, sidebarOpen…) generaba arrays nuevos y propagaba re-render a
  // todo Dashboard/Assets/Watchlist/Charts aunque `assets` no hubiera cambiado.
  const portfolio = useMemo(() => assets.filter(a => a.type !== 'watchlist'), [assets]);
  const watchlist = useMemo(() => assets.filter(a => a.type === 'watchlist'), [assets]);

  // ─── Toast ──────────────────────────────────────────────
  const toast = useCallback((msg) => {
    setToastMsg(msg);
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => setToastMsg(''), 2800);
  }, []);

  // ─── Carga de la cartera (del usuario o demo) ───────────
  // Guarda de secuencia: login/logout rápidos (o cambio de cuenta) pueden
  // dejar dos llamadas en vuelo con distinto token; sin esto, la que responde
  // más tarde "gana" y puede pisar el estado con datos de la sesión anterior.
  // Solo se aplica la respuesta si sigue siendo la llamada más reciente.
  const portfolioSeq = useRef(0);
  const reloadPortfolio = useCallback(() => {
    const seq = ++portfolioSeq.current;
    return Promise.all([api.getAssets(), api.getNotes()])
      .then(([a, n]) => {
        if (seq !== portfolioSeq.current) return; // respuesta obsoleta, descartada
        setAssets(a); setNotes(n);
        const stamps = a.map(x => x.priceUpdatedAt).filter(Boolean).sort();
        setLastRefresh(stamps.length ? timeAgo(stamps[stamps.length - 1], t) : null);
        // Demo sin precios refrescados (datos semilla) → traer precios en vivo
        if (a.length && a.every(x => !x.priceUpdatedAt)) {
          api.refreshPrices()
            .then(r => { if (seq === portfolioSeq.current && r.assets) { setAssets(r.assets); setLastRefresh(timeAgo(r.at, t)); } })
            .catch(() => {});
        }
      })
      // Fallo de conexión con el backend → pantalla de mantenimiento (no error)
      .catch(() => { if (seq === portfolioSeq.current) setBackendDown(true); });
  }, [t]);

  // ─── Perfil público de comunidad (del usuario logueado) ─
  const loadCommunity = useCallback(() => {
    return api.communityMe()
      .then(r => setCommunity(r.user))
      .catch(() => setCommunity(null));
  }, []);

  // ─── Arranque: comprueba el backend; si responde, carga todo;
  //     si no, muestra "en mantenimiento" (con reintento) ─────
  const boot = useCallback(async () => {
    // Carrera contra 8 s para no esperar el timeout largo del backend (502)
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000));
    try {
      await Promise.race([api.health(), timeout]);
    } catch {
      setBackendDown(true);
      return;
    }
    setBackendDown(false);
    api.getConfig().then(c => setTheme(c.theme || 'dark')).catch(() => {});
    api.me().then(r => setUser(r.user)).catch(() => {});
    reloadPortfolio();
    loadCommunity();
  }, [reloadPortfolio, loadCommunity]);

  useEffect(() => { boot(); }, [boot]);

  // Cualquier fetch de la app (no solo el de boot) que falle a nivel de red
  // activa la misma pantalla de Mantenimiento; se desactiva sola en cuanto
  // vuelve a llegar cualquier respuesta.
  useEffect(() => {
    setNetworkStatusHandler(setBackendDown);
    return () => setNetworkStatusHandler(null);
  }, []);

  // Enlace de recuperación de contraseña por email: ?reset=<token>&email=<email>
  // Se limpia de la URL enseguida (no dejar el token visible/reutilizable en el historial).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset');
    const email = params.get('email');
    if (token && email) {
      setResetLink({ email, token });
      setAuthOpen(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Al entrar en Comunidad/Tesis sin alias fijado → abrir onboarding
  useEffect(() => {
    if ((section === 'community' || section === 'thesis') && needsAlias) setAliasOpen(true);
  }, [section, needsAlias]);

  // Notificaciones no leídas: sondeo ligero cada 60 s mientras hay sesión
  useEffect(() => {
    if (!user) { setUnread(0); return; }
    let alive = true;
    const tick = () => api.unreadCount().then(r => { if (alive) setUnread(r.count); }).catch(() => {});
    tick();
    const iv = setInterval(tick, 60000);
    return () => { alive = false; clearInterval(iv); };
  }, [user]);

  // ─── Tipos de cambio (FX) → divisa base EUR ─────────────
  // Refresca cuando cambian las divisas presentes en la cartera.
  const ccyKey = [...new Set(assets.map(a => (a.currency || 'USD').toUpperCase()))].sort().join(',');
  useEffect(() => {
    const ccys = ccyKey ? ccyKey.split(',') : [];
    if (!ccys.length) return;
    api.fx(ccys).then(r => setFxRates({ EUR: 1, ...(r.rates || {}) })).catch(() => {});
  }, [ccyKey]);

  // ─── Autenticación ──────────────────────────────────────
  const onAuth = ({ token, user: u }) => {
    setToken(token); setUser(u); setAuthOpen(false);
    reloadPortfolio();
    loadCommunity();
  };
  const logout = () => {
    setToken(null); setUser(null); setCommunity(null);
    toast(t('toast.sessionClosed'));
    reloadPortfolio();
  };
  const showRecoveryCode = async () => {
    if (!window.confirm(t('confirm.regenerateCode'))) return;
    try { const r = await api.regenerateCode(); setPresetCode(r.recoveryCode); setAuthOpen(true); }
    catch (e) { toast(t('toast.error', { message: e.message })); }
  };
  // Exige sesión para acciones de escritura; si no, abre el modal
  const requireAuth = () => {
    if (user) return true;
    setAuthOpen(true);
    toast(t('toast.needAccount'));
    return false;
  };

  // ─── Tema ───────────────────────────────────────────────
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    setTheme(t);
    api.setConfig('theme', t).catch(() => {});
  };

  // ─── Idioma ─────────────────────────────────────────────
  useEffect(() => { document.documentElement.setAttribute('lang', i18n.language); }, [i18n.language]);
  const changeLang = (code) => {
    i18n.changeLanguage(code);
    localStorage.setItem('vv_lang', code);
  };

  const go = (id) => { navigate(id === 'dashboard' ? '/' : '/' + id); setSidebarOpen(false); };
  const goProfile = (handle) => { navigate('/comunidad/u/' + encodeURIComponent(handle)); setSidebarOpen(false); };
  const goTicker = (ticker) => { navigate('/comunidad/ticker/' + encodeURIComponent(ticker)); setSidebarOpen(false); };

  // ─── CRUD activos ───────────────────────────────────────
  const saveAsset = async (payload, editId) => {
    try {
      if (editId) {
        const updated = await api.updateAsset(editId, payload);
        setAssets(prev => prev.map(a => a.id === editId ? updated : a));
        toast(t('toast.assetUpdated', { ticker: updated.ticker }));
      } else {
        // Fija el FX de entrada (EUR por 1 ud. de su divisa) para poder
        // separar después retorno de activo vs retorno de divisa.
        if (!payload.fxEntry) {
          const ccy = (payload.currency || 'USD').toUpperCase();
          let rate = fxRates[ccy];
          if (rate == null) { try { rate = (await api.fx([ccy])).rates?.[ccy]; } catch {} }
          if (rate != null) payload.fxEntry = rate;
        }
        const created = await api.createAsset(payload);
        setAssets(prev => [...prev, created]);
        toast(t('toast.assetCreated', { ticker: created.ticker }));
      }
      closeAssetModal();
    } catch (e) { toast(t('toast.error', { message: e.message })); }
  };

  const deleteAsset = async (a) => {
    if (!requireAuth()) return;
    if (!window.confirm(t('confirm.deleteAsset', { ticker: a.ticker }))) return;
    try {
      await api.deleteAsset(a.id);
      setAssets(prev => prev.filter(x => x.id !== a.id));
      setNotes(prev => prev.map(n => n.assetId === a.id ? { ...n, assetId: null } : n));
      toast(t('toast.assetDeleted', { ticker: a.ticker }));
    } catch (e) { toast(t('toast.error', { message: e.message })); }
  };

  // ─── Refresco de precios en vivo (Yahoo) ────────────────
  const refreshPrices = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const r = await api.refreshPrices();
      if (r.assets) setAssets(r.assets);
      setLastRefresh(timeAgo(r.at, t));
      toast(t('toast.pricesUpdated', { updated: r.updated, total: r.total }));
    } catch (e) { toast(t('toast.error', { message: e.message })); }
    finally { setRefreshing(false); }
  };

  // Actualiza precio + fundamentales de UN activo (Alpha Vantage, Yahoo de respaldo)
  const refreshAssetData = async (id) => {
    try {
      const r = await api.refreshAssetData(id);
      setAssets(prev => prev.map(x => (x.id === id ? r.asset : x)));
      toast(r.source === 'alphavantage'
        ? t('toast.assetDataUpdated', { ticker: r.asset.ticker })
        : t('toast.assetPriceOnly', { ticker: r.asset.ticker }));
    } catch (e) { toast(t('toast.error', { message: e.message })); }
  };

  // Calcula calidad del capital (ROIC/FCF/WACC) bajo demanda (Alpha Vantage)
  const refreshQuality = async (id) => {
    if (!requireAuth()) return;
    try {
      const r = await api.refreshQuality(id);
      setAssets(prev => prev.map(x => (x.id === id ? r.asset : x)));
      const a = r.asset, est = r.estimates;
      const parts = [];
      if (a.roic != null) parts.push(t('toast.qualityRoic', { roic: a.roic, wacc: a.wacc ?? '—' }));
      if (est?.targetUpside != null) parts.push(t('toast.qualityTarget', { upside: (est.targetUpside >= 0 ? '+' : '') + est.targetUpside, rec: est.recommendation || '—' }));
      toast(parts.length
        ? t('toast.qualityUpdated', { ticker: a.ticker, parts: parts.join(' · ') })
        : t('toast.qualityNoData', { ticker: a.ticker, errors: (r.errors || []).join(' · ') || t('common.noData') }));
    } catch (e) { toast(t('toast.error', { message: e.message })); }
  };

  // ─── Notas ──────────────────────────────────────────────
  const saveNote = async (payload) => {
    try {
      const created = await api.createNote(payload);
      setNotes(prev => [created, ...prev]);
      setLearnModal({ open: false, linkedAssetId: null });
      toast(t('toast.noteSaved'));
    } catch (e) { toast(t('toast.error', { message: e.message })); }
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
      toast(t('toast.backupExported'));
    } catch (e) { toast(t('toast.error', { message: e.message })); }
  };

  const resetData = async () => {
    if (!requireAuth()) return;
    if (!window.confirm(t('confirm.resetData'))) return;
    try {
      await Promise.all(assets.map(a => api.deleteAsset(a.id)));
      await Promise.all(notes.map(n => api.deleteNote(n.id)));
      setAssets([]); setNotes([]);
      toast(t('toast.dataDeleted'));
    } catch (e) { toast(t('toast.error', { message: e.message })); }
  };

  const openNotes = (id) => setDetailId(id);
  const openEdit = (a) => { if (!requireAuth()) return; setAssetModal({ open: true, editing: a, presetType: a.type || 'portfolio' }); };
  const newAsset = (presetType = 'portfolio') => { if (!requireAuth()) return; setAssetModal({ open: true, editing: null, presetType }); };
  const addNote = (id) => { if (!requireAuth()) return; setLearnModal({ open: true, linkedAssetId: id }); };
  const closeAssetModal = () => setAssetModal({ open: false, editing: null, presetType: 'portfolio' });
  const detailAsset = detailId ? assets.find(a => a.id === detailId) : null;

  const navHandlers = { onNotes: openNotes, onEdit: openEdit, onDelete: deleteAsset, onRefreshData: refreshAssetData, onRefreshQuality: refreshQuality };

  usePageMeta(t('pageTitles.' + section), !PRIVATE_SECTIONS.has(section));

  return (
    <>
      {backendDown && <Maintenance onRetry={boot} />}
      {sidebarOpen && <div className="sidebar-overlay open" onClick={() => setSidebarOpen(false)} />}

      <nav className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="logo">
          <div className="logo-title">ValueVault</div>
          <div className="logo-sub">Asset Intelligence</div>
        </div>
        <div className="nav">
          {NAV.map((item, i) => item.section
            ? <div className="nav-section" key={'s' + i}>{t('navSection.' + item.section)}</div>
            : <div key={item.id} className={`nav-item${section === item.id ? ' active' : ''}`} onClick={() => go(item.id)}><span className="nav-icon">{item.icon}</span>{t('nav.' + item.id)}</div>
          )}
        </div>
        <div className="sidebar-bottom">
          {user ? (
            <>
              <div className="stat-row" style={{ alignItems: 'center' }}>
                <span className="stat-label" title={user.email} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>👤 {user.email}</span>
                <button className="sb-btn" onClick={logout} style={{ padding: '3px 9px', flex: 'none' }}>{t('sidebar.logout')}</button>
              </div>
              <button className="sb-btn" style={{ width: '100%', marginBottom: '10px', fontSize: '11px' }} onClick={showRecoveryCode}>{t('sidebar.recoveryCode')}</button>
            </>
          ) : (
            <button className="sb-btn" style={{ width: '100%', marginBottom: '10px' }} onClick={() => setAuthOpen(true)}>{t('sidebar.login')}</button>
          )}
          <div className="stat-row"><span className="stat-label">{t('sidebar.assets')}</span><span className="stat-val">{assets.length}</span></div>
          <div className="stat-row"><span className="stat-label">{t('sidebar.notes')}</span><span className="stat-val">{notes.length}</span></div>
          <div className="sb-btns">
            <button className="sb-btn" onClick={exportData}>{t('sidebar.export')}</button>
            <button className="sb-btn" onClick={resetData}>{t('sidebar.reset')}</button>
          </div>
        </div>
      </nav>

      <div className="main">
        <div className="topbar">
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <button className="menu-btn" onClick={() => setSidebarOpen(true)}>☰</button>
            <div className="page-title">{t('pageTitles.' + section)}</div>
          </div>
          <div className="topbar-right">
            {user && (
              <button className="theme-toggle" onClick={() => setNotifOpen(true)} title={t('topbar.notifications')} style={{ position: 'relative' }}>
                🔔
                {unread > 0 && <span style={{ position: 'absolute', top: '-3px', right: '-3px', background: 'var(--red)', color: '#fff', fontSize: '9px', fontWeight: 700, minWidth: '15px', height: '15px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{unread > 9 ? '9+' : unread}</span>}
              </button>
            )}
            <select
              className="theme-toggle"
              value={i18n.language}
              onChange={(e) => changeLang(e.target.value)}
              title={t('topbar.language')}
              style={{ cursor: 'pointer' }}
            >
              {SUPPORTED_LANGS.map(l => (
                <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
              ))}
            </select>
            <button className="theme-toggle" onClick={toggleTheme}>{theme === 'dark' ? '☀️' : '🌙'}</button>
            <button className="btn btn-outline" onClick={() => newAsset('portfolio')}>{t('topbar.newAsset')}</button>
            <button className="btn btn-gold" onClick={() => go('screener')}>{t('topbar.screener')}</button>
          </div>
        </div>

        <div className="content">
          {!user && ['dashboard', 'assets', 'watchlist', 'compare', 'charts', 'learning'].includes(section) && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '4px solid var(--gold)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '12px', color: 'var(--muted)', lineHeight: 1.6 }}>
              {t('demoBanner.prefix')} <b>DEMO</b> {t('demoBanner.suffix')} <span onClick={() => setAuthOpen(true)} style={{ color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>{t('demoBanner.cta')}</span> {t('demoBanner.after')}
            </div>
          )}
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Dashboard assets={portfolio} notes={notes} theme={theme} fxRates={fxRates} {...navHandlers} goAssets={() => go('assets')} onRefresh={refreshPrices} refreshing={refreshing} lastRefresh={lastRefresh} />} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="/assets" element={<Assets assets={portfolio} notes={notes} theme={theme} fxRates={fxRates} {...navHandlers} />} />
            <Route path="/watchlist" element={<Watchlist assets={watchlist} notes={notes} theme={theme} fxRates={fxRates} {...navHandlers} onAdd={() => newAsset('watchlist')} />} />
            <Route path="/compare" element={<Compare assets={assets} />} />
            <Route path="/charts" element={<Charts assets={portfolio} theme={theme} fxRates={fxRates} />} />
            <Route path="/screener" element={<Screener assets={assets} />} />
            <Route path="/valuation" element={<Valuation toast={toast} />} />
            <Route path="/volprofile" element={<VolProfile theme={theme} toast={toast} />} />
            <Route path="/smc" element={<SMC theme={theme} toast={toast} />} />
            <Route path="/gamma" element={<Gamma theme={theme} toast={toast} />} />
            <Route path="/trendfollow" element={<TrendFollowing theme={theme} toast={toast} />} />
            <Route path="/community" element={<Community user={user} profile={community} needsAlias={needsAlias} onEditAlias={() => setAliasOpen(true)} onLogin={() => setAuthOpen(true)} onProfile={goProfile} onTicker={goTicker} toast={toast} />} />
            <Route path="/thesis" element={<Thesis user={user} needsAlias={needsAlias} onEditAlias={() => setAliasOpen(true)} onLogin={() => setAuthOpen(true)} onTicker={goTicker} toast={toast} />} />
            <Route path="/comunidad/u/:handle" element={<Profile currentUser={user} canInteract={canInteract} onBack={() => navigate(-1)} onAuthor={goProfile} onTicker={goTicker} requireInteract={requireInteract} toast={toast} />} />
            <Route path="/comunidad/ticker/:symbol" element={<TickerPage currentUser={user} canInteract={canInteract} onBack={() => navigate(-1)} onProfile={goProfile} onTicker={goTicker} requireInteract={requireInteract} toast={toast} />} />
            <Route path="/learning" element={<Knowledge notes={notes} assets={assets} onAdd={addNote} go={go} />} />
            <Route path="/trends" element={<Trends theme={theme} toast={toast} />} />
            <Route path="/indices" element={<Indices theme={theme} toast={toast} />} />
            <Route path="/sentiment" element={<Sentiment theme={theme} toast={toast} />} />
            <Route path="/marketmap" element={<MarketMap theme={theme} toast={toast} />} />
            <Route path="/macro" element={<Macro theme={theme} toast={toast} />} />
            <Route path="/about" element={<AboutUs />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </div>
      </div>

      <AssetModal open={assetModal.open} editing={assetModal.editing} presetType={assetModal.presetType} onClose={closeAssetModal} onSave={saveAsset} toast={toast} />
      <LearnModal open={learnModal.open} assets={assets} linkedAssetId={learnModal.linkedAssetId} onClose={() => setLearnModal({ open: false, linkedAssetId: null })} onSave={saveNote} toast={toast} />
      <DetailModal asset={detailAsset} notes={notes} onClose={() => setDetailId(null)} onAddNote={(id) => { setDetailId(null); addNote(id); }} />
      <AuthModal open={authOpen} presetCode={presetCode} resetLink={resetLink} onClose={() => { setAuthOpen(false); setPresetCode(null); setResetLink(null); }} onAuth={onAuth} toast={toast} />
      <AliasModal open={aliasOpen} current={community} onClose={() => setAliasOpen(false)} onSaved={(pub) => { setCommunity(pub); setUser(u => u ? { ...u, displayName: pub.displayName, handle: pub.handle, avatar: pub.avatar } : u); setAliasOpen(false); }} toast={toast} />
      <Notifications open={notifOpen} onClose={() => setNotifOpen(false)} onProfile={goProfile} onRead={() => setUnread(0)} toast={toast} />

      <Assistant assets={assets} notes={notes} fxRates={fxRates} go={go} />

      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </>
  );
}
