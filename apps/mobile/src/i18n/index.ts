import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './resources';

// Senkron init — modül yüklenince i18n hazır olur (default 'tr'). Gerçek dil
// locale store tarafından çözülüp i18n.changeLanguage ile uygulanır.
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: 'tr',
    fallbackLng: 'tr',
    supportedLngs: ['tr', 'en'],
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export default i18n;
