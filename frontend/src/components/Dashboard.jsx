import React from 'react';
import { useTranslation } from 'react-i18next';
import AssetRow from './AssetRow.jsx';
import RiskPanel from './RiskPanel.jsx';
import MarketPulse from './MarketPulse.jsx';
import { portfolioStats, fmtBase } from '../lib/format.js';

export default function Dashboard({ assets, notes, theme, fxRates, onNotes, onEdit, onDelete, onRefreshData, onRefreshQuality, goAssets, onRefresh, refreshing, lastRefresh }) {
  const { t } = useTranslation();
  const noteCount = (id) => notes.filter(n => n.assetId === id).length;
  const lowRisk = assets.filter(a => a.risk === 'low').length;
  const recent = assets.slice(-5).reverse();
  const st = portfolioStats(assets, fxRates);
  const ret = st.returnPct;
  const retColor = ret === null ? 'var(--text)' : ret >= 0 ? 'var(--green)' : 'var(--red)';

  return (
    <div className="section active">
      <MarketPulse />

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">{t('dashboard.kpi.portfolioValue')}</div>
          <div className="kpi-value">{fmtBase(st.valueBase)}</div>
          <div className="kpi-sub">{t('dashboard.kpi.sized', { count: st.sized })}{st.unsized ? t('dashboard.kpi.unsizedExtra', { count: st.unsized }) : ''}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{t('dashboard.kpi.returnLabel')}</div>
          <div className="kpi-value" style={{ color: retColor }}>{ret === null ? '—' : (ret >= 0 ? '+' : '') + ret.toFixed(2) + '%'}</div>
          <div className="kpi-sub">
            {st.pnlBase === null ? t('dashboard.kpi.addSize') : t('dashboard.kpi.pnl', { value: fmtBase(st.pnlBase) })}
            {st.currencyPct != null ? t('dashboard.kpi.currencyExtra', { sign: st.currencyPct >= 0 ? '+' : '', pct: st.currencyPct.toFixed(1) }) : ''}
          </div>
        </div>
        <div className="kpi-card"><div className="kpi-label">{t('dashboard.kpi.lowRisk')}</div><div className="kpi-value kpi-pos">{lowRisk}</div><div className="kpi-sub">{t('dashboard.kpi.lowRiskSub')}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t('dashboard.kpi.totalAssets')}</div><div className="kpi-value">{assets.length}</div><div className="kpi-sub">{t('dashboard.kpi.inPortfolio')}</div></div>
      </div>

      <RiskPanel assets={assets} fxRates={fxRates} />

      <div className="section-header">
        <div className="section-title">{t('dashboard.recentAssets')}</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {lastRefresh && <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>↻ {lastRefresh}</span>}
          <button className="btn btn-outline" onClick={onRefresh} disabled={refreshing}>{refreshing ? t('dashboard.updating') : t('dashboard.updatePrices')}</button>
          <button className="btn btn-outline" onClick={goAssets}>{t('dashboard.viewAll')}</button>
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
        {recent.length
          ? recent.map(a => <AssetRow key={a.id} a={a} noteCount={noteCount(a.id)} theme={theme} fxRates={fxRates} onNotes={onNotes} onEdit={onEdit} onDelete={onDelete} onRefreshData={onRefreshData} onRefreshQuality={onRefreshQuality} />)
          : <div className="empty-state"><div className="empty-icon">◈</div><div className="empty-text">{t('dashboard.emptyState')}</div></div>}
      </div>
    </div>
  );
}
