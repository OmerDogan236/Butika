import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { type Dikdortgen, type TurId, gorunurAdimlar, turAcilabilirMi } from '../tur/adimlar';

const STORAGE_KEY = 'butika.tur.gorulenler';

// Durum okumasini, diskleme yazmasisini ve durum yazmasini serileştirmek icin kuyruk.
// Hata kuyrugu zehirlemesin (her hata sonrasi zincir devam eder).
let yazmaKuyrugu: Promise<void> = Promise.resolve();

interface TurState {
  /** null = telefon hafizasi henuz okunmadi */
  gorulenler: TurId[] | null;
  aktifTur: TurId | null;
  aktifAdimIndeksi: number;
  hedefler: Record<string, Dikdortgen>;
  /**
   * Yeniden olcum tetigi. Her artisinda ekrandaki butun `TurHedefi`ler
   * konumlarini bastan olcup bildirir. Sayinin kendisi anlamsiz — SADECE
   * degismis olmasi onemli. Neden gerekli: `onLayout` bir gorunumun kendi
   * ebeveyni icindeki yerlesimi degisince atesler; ust guvenli alan boslugu
   * gibi ATASINDA olan kaymalar onu tetiklemez ve kayit bayatlar.
   */
  olcumTazeleme: number;

  init: () => Promise<void>;
  turuBaslat: (turId: TurId) => void;
  sonrakiAdim: () => void;
  turuAtla: () => void;
  hepsiniSifirla: () => Promise<void>;
  hedefKaydet: (hedefId: string, dikdortgen: Dikdortgen) => void;
  hedefSil: (hedefId: string) => void;
  olcumleriTazele: () => void;
}

function gorulmusIsaretle(turId: TurId): void {
  yazmaKuyrugu = yazmaKuyrugu
    .then(async () => {
      // Yazma basliyorken taze mevcut degeri oku
      const mevcut = useTurStore.getState().gorulenler ?? [];
      if (mevcut.includes(turId)) return;
      const yeni = [...mevcut, turId];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(yeni));
      // Durum yazma kuyrugun icinde — sonraki tur bunu gorur
      useTurStore.setState({ gorulenler: yeni });
    })
    .catch(() => {
      // Yazma hatasi kuyrugu zehirlemesin; sonraki cagrilar calismaya devam etsin.
    });
}

export const useTurStore = create<TurState>((set, get) => ({
  gorulenler: null,
  aktifTur: null,
  aktifAdimIndeksi: 0,
  hedefler: {},
  olcumTazeleme: 0,

  async init() {
    const ham = await AsyncStorage.getItem(STORAGE_KEY);
    let liste: TurId[] = [];
    if (ham) {
      try {
        const cozulen = JSON.parse(ham);
        if (Array.isArray(cozulen)) liste = cozulen as TurId[];
      } catch {
        // Bozuk kayit = hic gorulmemis say; tur bir kez fazla cikar, veri kaybi olmaz.
        liste = [];
      }
    }
    set({ gorulenler: liste });
  },

  turuBaslat(turId) {
    const { gorulenler, hedefler, aktifTur } = get();
    if (aktifTur !== null) return; // baska tur aciksa ikincisini baslatma
    if (!turAcilabilirMi(turId, gorulenler, hedefler)) return;
    set({ aktifTur: turId, aktifAdimIndeksi: 0 });
  },

  sonrakiAdim() {
    const { aktifTur, aktifAdimIndeksi, hedefler } = get();
    if (!aktifTur) return;
    const adimlar = gorunurAdimlar(aktifTur, hedefler);
    const sonraki = aktifAdimIndeksi + 1;
    if (sonraki < adimlar.length) {
      set({ aktifAdimIndeksi: sonraki });
      return;
    }
    set({ aktifTur: null, aktifAdimIndeksi: 0 });
    gorulmusIsaretle(aktifTur);
  },

  turuAtla() {
    const { aktifTur } = get();
    if (!aktifTur) return;
    set({ aktifTur: null, aktifAdimIndeksi: 0 });
    gorulmusIsaretle(aktifTur);
  },

  async hepsiniSifirla() {
    // Sifirlamayı da kuyruga al, tutarlilik icin
    return new Promise<void>((resolve) => {
      yazmaKuyrugu = yazmaKuyrugu
        .then(async () => {
          await AsyncStorage.removeItem(STORAGE_KEY);
          useTurStore.setState({ gorulenler: [], aktifTur: null, aktifAdimIndeksi: 0 });
        })
        .catch(() => {
          useTurStore.setState({ gorulenler: [], aktifTur: null, aktifAdimIndeksi: 0 });
        })
        .finally(() => resolve());
    });
  },

  hedefKaydet(hedefId, dikdortgen) {
    set((s) => {
      const mevcut = s.hedefler[hedefId];
      // Ayni degerler ise durumu degistirme — asiri render yapilmasini onlemek icin.
      if (
        mevcut &&
        mevcut.x === dikdortgen.x &&
        mevcut.y === dikdortgen.y &&
        mevcut.genislik === dikdortgen.genislik &&
        mevcut.yukseklik === dikdortgen.yukseklik
      ) {
        return s;
      }
      return { hedefler: { ...s.hedefler, [hedefId]: dikdortgen } };
    });
  },

  hedefSil(hedefId) {
    set((s) => {
      if (s.hedefler[hedefId] === undefined) return s;
      const kalan = { ...s.hedefler };
      delete kalan[hedefId];
      return { hedefler: kalan };
    });
  },

  // Sonsuz dongu olmaz: bu sayaci yalnizca adim degisimi arttirir. Sayac artisi
  // olcumu tetikler, olcum `hedefKaydet`e gider, `hedefKaydet` ayni dort deger
  // geldiginde durumu HIC degistirmez; degisik geldiginde de yalnizca
  // `hedefler` degisir, sayac degismez. Zincir bir adimda durur.
  olcumleriTazele() {
    set((s) => ({ olcumTazeleme: s.olcumTazeleme + 1 }));
  },
}));
