import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './locales/es.json';
import en from './locales/en.json';
import zh from './locales/zh.json';

export const SUPPORTED_LANGS = [
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
];

function detectInitialLang() {
  const stored = localStorage.getItem('vv_lang');
  if (stored && SUPPORTED_LANGS.some(l => l.code === stored)) return stored;
  const nav = (navigator.language || 'es').slice(0, 2).toLowerCase();
  if (SUPPORTED_LANGS.some(l => l.code === nav)) return nav;
  return 'es';
}

i18next.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en }, zh: { translation: zh } },
  lng: detectInitialLang(),
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

export default i18next;
