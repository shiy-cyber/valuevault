import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

// Estructura de las secciones del manual: solo ids/iconos/tag (clave), el
// texto (title/what/use/read) se resuelve via i18next en guide.sections.<id>.
const GUIDE = [
  { id: 'dashboard', icon: '◈', tag: 'cartera' },
  { id: 'assets', icon: '◆', tag: 'cartera' },
  { id: 'watchlist', icon: '★', tag: 'cartera' },
  { id: 'compare', icon: '⇄', tag: 'cartera' },
  { id: 'charts', icon: '◎', tag: 'cartera' },
  { id: 'indices', icon: '🌎', tag: 'envivo' },
  { id: 'sentiment', icon: '🧭', tag: 'envivo' },
  { id: 'trends', icon: '📡', tag: 'envivo' },
  { id: 'macro', icon: '🌐', tag: 'envivo' },
  { id: 'marketmap', icon: '🗺', tag: 'envivo' },
  { id: 'valuation', icon: '🧮', tag: 'herramienta' },
  { id: 'screener', icon: '⊞', tag: 'herramienta' },
  { id: 'volprofile', icon: '📊', tag: 'herramienta' },
  { id: 'trendfollow', icon: '📈', tag: 'herramienta' },
  { id: 'smc', icon: '⚡', tag: 'experimental' },
  { id: 'gamma', icon: 'γ', tag: 'opciones' },
  { id: 'community', icon: '🗣', tag: 'comunidad' },
  { id: 'learning', icon: '◉', tag: 'cartera', noNav: true },
];

const GLOSSARY_TERMS = 22;

const tagColor = (tag) => tag === 'experimental' ? '#e67e22' : tag === 'herramienta' ? '#9b59b6' : tag === 'cartera' ? '#3a8eff' : tag === 'opciones' ? '#c9a84c' : tag === 'comunidad' ? '#e84393' : '#2ecc71';

export default function Guide({ go, embed }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => new Set(['valuation']));
  const toggle = (id) => setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' };
  const list = { margin: '6px 0 0', paddingLeft: '18px', fontSize: '12px', color: 'var(--muted)', lineHeight: 1.8 };
  const subcap = { fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--gold)', letterSpacing: '1px', textTransform: 'uppercase', marginTop: '12px' };
  const glossary = t('guide.glossary', { returnObjects: true });

  return (
    <div className={embed ? '' : 'section active'}>
      <div style={{ ...card, borderLeft: '4px solid var(--gold)', padding: '20px 24px', marginBottom: '18px' }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '16px', marginBottom: '6px' }}>{t('guide.pageTitle')}</div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.7 }}>{t('guide.pageSubtitle')}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {GUIDE.map(g => {
          const isOpen = open.has(g.id);
          const title = t('guide.sections.' + g.id + '.title');
          const use = t('guide.sections.' + g.id + '.use', { returnObjects: true });
          const read = t('guide.sections.' + g.id + '.read', { returnObjects: true });
          return (
            <div key={g.id} style={card}>
              <div onClick={() => toggle(g.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 18px', cursor: 'pointer' }}>
                <span style={{ fontSize: '22px' }}>{g.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>{title}</div>
                </div>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', padding: '2px 8px', borderRadius: '10px', background: tagColor(g.tag) + '22', color: tagColor(g.tag) }}>{t('guide.tags.' + g.tag)}</span>
                <span style={{ color: 'var(--muted)', fontSize: '14px', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>▸</span>
              </div>
              {isOpen && (
                <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '12.5px', color: 'var(--text)', lineHeight: 1.7, marginTop: '12px' }}>{t('guide.sections.' + g.id + '.what')}</div>
                  <div style={subcap}>{t('guide.howToUse')}</div>
                  <ul style={list}>{use.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  <div style={subcap}>{t('guide.howToRead')}</div>
                  <ul style={list}>{read.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  {go && !g.noNav && <button className="btn btn-outline" style={{ marginTop: '14px', fontSize: '11px' }} onClick={() => go(g.id)}>{t('guide.openSection', { title })}</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Glosario */}
      <div style={{ ...card, padding: '18px', marginTop: '18px' }}>
        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '14px' }}>{t('guide.glossaryTitle')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,280px),1fr))', gap: '12px' }}>
          {glossary.map(({ term, def }, i) => (
            <div key={i} style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '12px', fontWeight: 700, color: 'var(--gold)', marginBottom: '4px' }}>{term}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.6 }}>{def}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--surface2)', borderRadius: '8px', borderLeft: '3px solid var(--gold)', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.7 }}>
        {t('guide.footer')}
      </div>
    </div>
  );
}
