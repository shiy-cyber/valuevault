import React from 'react';
import { useTranslation } from 'react-i18next';

export default function AboutUs() {
  const { t } = useTranslation();
  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' };

  return (
    <div className="section active">
      <div style={{ ...card, borderLeft: '4px solid var(--gold)', padding: '24px 28px', maxWidth: '720px' }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '20px', marginBottom: '14px' }}>{t('pageTitles.about')}</div>

        <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.8 }}>
          <p style={{ margin: '0 0 14px' }}>{t('aboutPage.p1')}</p>
          <p style={{ margin: '0 0 14px' }}>{t('aboutPage.p2')}</p>
          <p style={{ margin: '0 0 14px' }}>{t('aboutPage.p3')}</p>
          <p style={{ margin: 0 }}>
            {t('aboutPage.contactPrefix')}{' '}
            <a href="mailto:hola@valuevault.es" style={{ color: 'var(--gold)' }}>hola@valuevault.es</a>.
            {' '}{t('aboutPage.privacyPrefix')}{' '}
            <a href="/privacidad.html" style={{ color: 'var(--gold)' }}>{t('auth.registerTerms.link')}</a>
            {' '}{t('aboutPage.legalPrefix')}{' '}
            <a href="/aviso-legal.html" style={{ color: 'var(--gold)' }}>{t('aboutPage.legalLink')}</a>.
          </p>
        </div>
      </div>

      <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--surface2)', borderRadius: '8px', borderLeft: '3px solid var(--gold)', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.7, maxWidth: '720px' }}>
        {t('aboutPage.disclaimer')}
      </div>
    </div>
  );
}
