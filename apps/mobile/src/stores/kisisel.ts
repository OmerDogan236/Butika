import type { TarzTestiGonder } from '@butika/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { captureEvent } from '../lib/analytics';
import { ApiError } from '../lib/api';
import { bekleyenCevabiOku, bekleyenCevabiSil, bekleyenCevapKaydet } from '../lib/bekleyen-cevap';
import { gonderimdenAtlanan } from '../lib/kisa-test';
import { ayniCevapMi, dahaSonraSiniriyaCek, yenidenDenenebilirMi } from '../lib/kisisel-akis';
import { useAuthStore } from './auth';

// Güncelleme sonrası kişisel akışın telefondaki durumu (kullanıcı başına, sunucuya gitmez):
// video görüldü mü, "Daha sonra" kaç kez seçildi, davet kartı kapatıldı mı, bekleyen cevap var mı.
// Bekleyen cevabın kendisi lib/bekleyen-cevap.ts'deki anahtarda durur (tek anahtar).
// Tasarım: docs/superpowers/specs/2026-10-01-kisisel-butika-tasarim.md (§1, §2 "Daha sonra", §4)

const anahtar = (userId: string, ad: 'video' | 'dahaSonra' | 'kart') =>
  `butika.kisisel.${userId}.${ad}`;

export type CevapGonder = (g: TarzTestiGonder) => Promise<unknown>;

interface KisiselState {
  userId: string | null;
  yuklendi: boolean;
  videoGoruldu: boolean;
  dahaSonraSayisi: number;
  kartKapatildi: boolean;
  /** Telefonda gönderilmeyi bekleyen bir test cevabı var: kullanıcı testi yapmış sayılır. */
  bekleyenVar: boolean;
  init: (userId: string, post?: CevapGonder) => Promise<void>;
  videoyuGorduIsaretle: () => Promise<void>;
  dahaSonra: () => Promise<void>;
  /** Onboarding bitti: açılışta test bir daha zorla sorulmasın (davet kartı etkilenmez). */
  testSorusunuKapat: () => Promise<void>;
  kartiKapat: () => Promise<void>;
  bekleyenCevapKaydet: (g: TarzTestiGonder) => Promise<void>;
  /** Test başarıyla gönderildi: eski bekleyen cevap sonradan yeniyi ezmesin. */
  bekleyeniSil: () => Promise<void>;
  bekleyeniGonder: (post: CevapGonder) => Promise<void>;
  /** Süren yeniden gönderim bitene kadar bekler (yeni cevap eskisinden sonra varsın). */
  bekleyenGonderiminiBekle: () => Promise<void>;
  /** Çıkışta: bir sonraki kullanıcı bu durumu görmesin. */
  sifirla: () => void;
}

const BASLANGIC = {
  userId: null,
  yuklendi: false,
  videoGoruldu: false,
  dahaSonraSayisi: 0,
  kartKapatildi: false,
  bekleyenVar: false,
} as const;

let suren: Promise<void> | null = null;

/** Saklanan cevap hâlâ gönderilenle aynıysa siler (bu arada yenisi saklandıysa dokunmaz). */
async function ayniysaSil(userId: string, g: TarzTestiGonder): Promise<boolean> {
  const saklanan = await bekleyenCevabiOku(userId);
  if (!ayniCevapMi(saklanan, g)) return false;
  await bekleyenCevabiSil(userId);
  return true;
}

async function yaz(k: string, deger: string): Promise<void> {
  try {
    await AsyncStorage.setItem(k, deger);
  } catch {
    // yut — yazılamazsa akış bir kez fazla görünür, veri kaybı olmaz
  }
}

export const useKisiselStore = create<KisiselState>((set, get) => ({
  ...BASLANGIC,

  async init(userId, post) {
    set({ ...BASLANGIC, userId });
    let video: string | null = null;
    let dahaSonra: string | null = null;
    let kart: string | null = null;
    try {
      [video, dahaSonra, kart] = await Promise.all([
        AsyncStorage.getItem(anahtar(userId, 'video')),
        AsyncStorage.getItem(anahtar(userId, 'dahaSonra')),
        AsyncStorage.getItem(anahtar(userId, 'kart')),
      ]);
    } catch {
      // okunamazsa varsayılanlar
    }
    const bekleyen = await bekleyenCevabiOku(userId);
    if (get().userId !== userId) return; // bu arada kullanıcı değişti
    const sayi = Number.parseInt(dahaSonra ?? '0', 10);
    set({
      yuklendi: true,
      videoGoruldu: video === 'true',
      dahaSonraSayisi: Number.isFinite(sayi) && sayi > 0 ? sayi : 0,
      kartKapatildi: kart === 'true',
      bekleyenVar: bekleyen !== null,
    });
    if (post && bekleyen) await get().bekleyeniGonder(post);
  },

  async videoyuGorduIsaretle() {
    const { userId } = get();
    set({ videoGoruldu: true });
    if (userId) await yaz(anahtar(userId, 'video'), 'true');
  },

  async dahaSonra() {
    const { userId, dahaSonraSayisi } = get();
    const yeni = dahaSonraSayisi + 1;
    set({ dahaSonraSayisi: yeni });
    if (userId) await yaz(anahtar(userId, 'dahaSonra'), String(yeni));
  },

  async testSorusunuKapat() {
    const { userId, dahaSonraSayisi } = get();
    const yeni = dahaSonraSiniriyaCek(dahaSonraSayisi);
    set({ dahaSonraSayisi: yeni });
    if (userId) await yaz(anahtar(userId, 'dahaSonra'), String(yeni));
  },

  async kartiKapat() {
    const { userId } = get();
    set({ kartKapatildi: true });
    if (userId) await yaz(anahtar(userId, 'kart'), 'true');
  },

  async bekleyenCevapKaydet(g) {
    // Oturumdaki kullanıcı esas: ekran kapanmış olsa da cevap doğru kişiye yazılır.
    const userId = useAuthStore.getState().user?.id ?? get().userId;
    if (!userId) return;
    await bekleyenCevapKaydet(userId, g);
    if (get().userId === userId) set({ bekleyenVar: true });
  },

  async bekleyeniSil() {
    const userId = useAuthStore.getState().user?.id ?? get().userId;
    if (!userId) return;
    await bekleyenCevabiSil(userId);
    if (get().userId === userId) set({ bekleyenVar: false });
  },

  bekleyeniGonder(post) {
    const { userId } = get();
    if (!userId) return Promise.resolve();
    if (suren) return suren;
    const is = (async () => {
      const g = await bekleyenCevabiOku(userId);
      if (!g) {
        if (get().userId === userId) set({ bekleyenVar: false });
        return;
      }
      try {
        await post(g);
      } catch (e) {
        // Geçersiz cevap (4xx) bir daha denenmez; ağ/sunucu hatasında sonraki açılışa kalır.
        const status = e instanceof ApiError ? e.status : undefined;
        if (!yenidenDenenebilirMi(status) && (await ayniysaSil(userId, g))) {
          if (get().userId === userId) set({ bekleyenVar: false });
        }
        return;
      }
      if ((await ayniysaSil(userId, g)) && get().userId === userId) set({ bekleyenVar: false });
      captureEvent('tarz_testi_tamamlandi', { kaynak: 'bekleyen', atlanan: gonderimdenAtlanan(g) });
    })().finally(() => {
      suren = null;
    });
    suren = is;
    return is;
  },

  async bekleyenGonderiminiBekle() {
    if (suren) await suren.catch(() => {});
  },

  sifirla() {
    set({ ...BASLANGIC });
  },
}));
