import { create } from 'zustand';
import { sogukAcilisKaynagi } from '../lib/acilis-kaynagi';
import { captureEvent, identifyUser, resetAnalytics, trackAuthResult } from '../lib/analytics';
import { API_BASE_URL, ApiError, api } from '../lib/api';
import { kurulumKaynaginiKaydet } from '../lib/kurulum-kaynagi-oku';
import { unregisterPushDevice } from '../lib/push-notifications';
import { queryClient } from '../lib/query-client';
import { appleAuthPayload, googleAuthPayload } from '../lib/social-auth';
import { secureStorage } from '../lib/storage';
import type { Language } from './locale';
import { useOnboardingStore } from './onboarding';

export interface User {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  gender: 'female' | 'male' | null;
  heightCm: number | null;
  weightKg: number | null;
  showStatsInComments: boolean;
  language: Language | null;
  countryCode: string | null;
}

interface AuthState {
  status: 'loading' | 'unauthenticated' | 'authenticated';
  user: User | null;
  init: () => Promise<void>;
  devSignIn: (email: string, displayName?: string, countryCode?: string) => Promise<void>;
  reviewSignIn: (countryCode?: string) => Promise<void>;
  appleSignIn: () => Promise<void>;
  googleSignIn: () => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

// trackEvents'ı doğrudan auth store içine inline aldık —
// queries.ts import cycle'a girmemek için.
// source: uygulamayı bildirim mi, bağlantı mı açtı (bkz. lib/acilis-kaynagi). Beklemesi girişi
// geciktirmesin diye sonucu beklenmez.
function fireAppOpen() {
  // Kurulum kaynağı kimlik tanıtıldıktan sonra: PostHog, giriş yapmamış kişinin özelliklerini
  // ($set_once) saklamıyor. Bu kurulumda bir kez gider (lib/kurulum-kaynagi-oku).
  void kurulumKaynaginiKaydet();
  void sogukAcilisKaynagi().then((kaynak) => {
    captureEvent('app_open', kaynak);
    api.post('/events', [{ type: 'app_open', payload: kaynak }]).catch(() => {});
  });
}

// Başarılı giriş sonrası ortak adımlar: token sakla, kullanıcıyı ayarla, tercih + analitik.
async function finishAuth(res: AuthResponse, set: (partial: Partial<AuthState>) => void) {
  await Promise.all([
    secureStorage.set('accessToken', res.accessToken),
    secureStorage.set('refreshToken', res.refreshToken),
    // Paylaşım penceresi (targets/paylas) hangi sunucuya yazacağını buradan okur.
    secureStorage.set('apiUrl', API_BASE_URL),
  ]);
  set({ status: 'authenticated', user: res.user });
  identifyUser(res.user);
  fireAppOpen();
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  user: null,

  async init() {
    const token = await secureStorage.get('accessToken');
    if (!token) {
      set({ status: 'unauthenticated', user: null });
      return;
    }
    try {
      const me = await api.get<User>('/me');
      void secureStorage.set('apiUrl', API_BASE_URL);
      set({ status: 'authenticated', user: me });
      identifyUser(me);
      fireAppOpen();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await Promise.all([
          secureStorage.delete('accessToken'),
          secureStorage.delete('refreshToken'),
        ]);
        set({ status: 'unauthenticated', user: null });
        return;
      }
      // Ağ kopukluğu vb. — token'ı koruyup unauth yapmayalım.
      set({ status: 'authenticated', user: null });
    }
  },

  async devSignIn(email, displayName, countryCode) {
    const res = await api.post<AuthResponse>(
      '/auth/dev',
      { email, displayName, countryCode },
      false,
    );
    await finishAuth(res, set);
  },

  // Mağaza incelemesi için — yalnız sunucuda REVIEW_AUTH_ENABLED açıkken
  // çalışır, kapalıyken 403 döner ve buton zaten görünmez.
  async reviewSignIn(countryCode) {
    const res = await api.post<AuthResponse>('/auth/review', { countryCode }, false);
    await finishAuth(res, set);
  },

  async appleSignIn() {
    const payload = await appleAuthPayload(); // iptal → AuthCancelled fırlatır
    const res = await api.post<AuthResponse>('/auth/apple', payload, false);
    await finishAuth(res, set);
    trackAuthResult(res.user, 'apple');
  },

  async googleSignIn() {
    const payload = await googleAuthPayload(); // iptal → AuthCancelled fırlatır
    const res = await api.post<AuthResponse>('/auth/google', payload, false);
    await finishAuth(res, set);
    trackAuthResult(res.user, 'google');
  },

  setUser: (user: User) => set({ user }),

  async signOut() {
    try {
      await unregisterPushDevice();
    } catch {
      // Push kaydı kapatılamasa bile logout devam etmeli.
    }

    try {
      await api.delete('/auth/session');
    } catch {
      // ignore — yine de local'i temizle
    }

    await Promise.all([secureStorage.delete('accessToken'), secureStorage.delete('refreshToken')]);

    resetAnalytics();

    await useOnboardingStore.getState().reset();

    set({
      status: 'unauthenticated',
      user: null,
    });

    // Önceki kullanıcının sunucu verisi bellekte kalmasın.
    queryClient.clear();
  },
}));
