import React from 'react';
import { useTranslation } from 'react-i18next';
import AssetRow from './AssetRow.jsx';

// Lista de seguimiento: activos que vigilas sin tenerlos en cartera.
export default function Watchlist({ assets, notes, theme, fxRates, onNotes, onEdit, onDelete, onRefreshData, onRefreshQuality, onAdd }) {
  const { t } = useTranslation();
  const noteCount = (id) => notes.filter(n => n.assetId === id).length;

  return (
    <div className="section active">
      <div className="section-header">
        <div>
          <div className="section-title">{t('watchlistPage.title')}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'DM Mono',monospace", marginTop: '3px' }}>{t('watchlistPage.subtitle')}</div>
        </div>
        <button className="btn btn-gold" onClick={onAdd}>{t('watchlistPage.addBtn')}</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
        {assets.length
          ? assets.map(a => <AssetRow key={a.id} a={a} noteCount={noteCount(a.id)} theme={theme} fxRates={fxRates} onNotes={onNotes} onEdit={onEdit} onDelete={onDelete} onRefreshData={onRefreshData} onRefreshQuality={onRefreshQuality} />)
          : <div className="empty-state"><div className="empty-icon">★</div><div className="empty-text">{t('watchlistPage.empty')}</div></div>}
      </div>
    </div>
  );
}
