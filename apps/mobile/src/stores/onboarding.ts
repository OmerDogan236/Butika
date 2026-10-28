import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { trackOnboardingCompleted } from '../lib/analytics';

const STORAGE_KEY = 'butika.onboarding.completed';
// Onboarding'de seçilen kategoriler yalnız bu cihazda durur; profil API'sine
// gönderilmez. Vitrin bunları sol rafın en üstünde gösterir.
const CATEGORIES_KEY = 'butika.onboarding.categories';

interface OnboardingState {
  status: 'unknown' | 'pending' | 'completed';
  selectedCategoryIds: string[];
  /** Onboarding bu oturumda tamamlandı: güncelleme akışı (test/video) tekrar gösterilmez. */
  buOturumdaTamamlandi: boolean;
  init: () => Promise<void>;
  complete: () => Promise<void>;
  setSelectedCategories: (ids: string[]) => Promise<void>;
  reset: () => Promise<void>;
}

function okunanIdler(ham: string | null): string[] {
  if (!ham) return [];
  try {
    const veri = JSON.parse(ham);
    if (!Array.isArray(veri)) return [];
    return veri.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  status: 'unknown',
  selectedCategoryIds: [],
  buOturumdaTamamlandi: false,

  async init() {
    const [flag, categories] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(CATEGORIES_KEY),
    ]);
    set({
      status: flag === 'true' ? 'completed' : 'pending',
      selectedCategoryIds: okunanIdler(categories),
    });
  },

  async complete() {
    await AsyncStorage.setItem(STORAGE_KEY, 'true');
    set({ status: 'completed', buOturumdaTamamlandi: true });
    trackOnboardingCompleted();
  },

  async setSelectedCategories(ids) {
    set({ selectedCategoryIds: ids });
    await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(ids));
  },

  async reset() {
    await AsyncStorage.multiRemove([STORAGE_KEY, CATEGORIES_KEY]);
    set({ status: 'pending', selectedCategoryIds: [] });
  },
}));
