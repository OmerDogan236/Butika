import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import i18n from '../i18n';

export type Language = 'tr' | 'en';

// Uygulama yalnız Türkiye'de ve Türkçe yayında: dil ve pazar sabit, seçim ekranı yok.
// Cihaz dili, IP tespiti veya eski bir elle seçim (ör. İngilizce / United States)
// kullanıcıyı başka pazara düşürmesin diye bunların hiçbirine bakılmaz.
const LANGUAGE: Language = 'tr';
const COUNTRY = 'TR';

// Eski sürümlerde elle seçilen dil/pazar burada saklanıyordu; artık kullanılmıyor.
const LEGACY_KEYS = ['locale.language', 'locale.country'];

interface LocaleState {
  status: 'loading' | 'ready';
  language: Language; // arayüz dili (i18n bununla senkron)
  country: string | null; // pazar (null = henüz hazır değil)
  init: () => Promise<void>;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  status: 'loading',
  language: LANGUAGE,
  country: null,

  async init() {
    await i18n.changeLanguage(LANGUAGE);
    AsyncStorage.multiRemove(LEGACY_KEYS).catch(() => {});
    set({ status: 'ready', language: LANGUAGE, country: COUNTRY });
  },
}));
