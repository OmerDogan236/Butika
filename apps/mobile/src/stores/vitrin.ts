import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { DevSettings } from 'react-native';
import { create } from 'zustand';

// KADIN | ERKEK vitrini (1.2.4): girişteki iki karttan ve Keşfet'in üstündeki geçişten seçilir.
// Yalnız bu cihazda durur; kategoriler, seçki, Fırsat ve arama bu tarafa göre gelir.
// Renkler de tarafa göre (erkek: siyah + soluk koyu mavi); stiller açılışta okunduğu için
// taraf değişince uygulama yeniden yüklenir (index.js renkleri ekranlardan önce ayarlar).
// Anahtar index.js'teki ile aynı olmalı.
const STORAGE_KEY = 'butika.vitrin.cinsiyet';
// Yeniden yüklemeden sonra Profil açılsın (girişte taraf seçilince).
const ACILISTA_PROFIL_KEY = 'butika.acilis.profil';

export type VitrinCinsiyeti = 'kadin' | 'erkek';

interface VitrinState {
  cinsiyet: VitrinCinsiyeti;
  yuklendi: boolean;
  init: () => Promise<void>;
  /** Tarafı kaydeder; renkler değişeceği için gerekirse uygulamayı yeniden yükler. */
  sec: (cinsiyet: VitrinCinsiyeti, secenek?: { acilistaProfil?: boolean }) => Promise<void>;
}

// Renkler için uygulamayı yeniden açar. Mağaza sürümünde DevSettings.reload hiçbir şey yapmaz;
// expo-updates (uzaktan güncelleme kapalı, app.json updates.enabled=false) reloadAsync ile açar.
function yenidenAc() {
  if (__DEV__) {
    DevSettings.reload();
    return;
  }
  Updates.reloadAsync().catch(() => {});
}

export function vitrinCinsiyetiMi(x: unknown): x is VitrinCinsiyeti {
  return x === 'kadin' || x === 'erkek';
}

export const useVitrinStore = create<VitrinState>((set, get) => ({
  cinsiyet: 'kadin',
  yuklendi: false,

  async init() {
    // Seçim yoksa kadın: bugünkü Butika (güncelleyen kullanıcı aynı vitrini görür).
    const kayitli = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
    set({ cinsiyet: vitrinCinsiyetiMi(kayitli) ? kayitli : 'kadin', yuklendi: true });
  },

  async sec(cinsiyet, secenek) {
    const onceki = get().cinsiyet;
    set({ cinsiyet });
    await AsyncStorage.setItem(STORAGE_KEY, cinsiyet).catch(() => {});
    if (cinsiyet === onceki) return;
    if (secenek?.acilistaProfil)
      await AsyncStorage.setItem(ACILISTA_PROFIL_KEY, '1').catch(() => {});
    yenidenAc();
  },
}));

/** Yeniden yüklemeden sonra Profil'e mi gidilecek (bir kez okunur, sonra silinir). */
export async function acilistaProfilMi(): Promise<boolean> {
  const deger = await AsyncStorage.getItem(ACILISTA_PROFIL_KEY).catch(() => null);
  if (deger) await AsyncStorage.removeItem(ACILISTA_PROFIL_KEY).catch(() => {});
  return deger === '1';
}
