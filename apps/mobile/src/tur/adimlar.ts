// Turun SAF mantigi. Buraya React Native ice aktarmasi EKLENMEZ —
// dosya `bun test` ile calisiyor, RN modulu girerse testler kirilir.

export type TurId = 'vitrin' | 'webview' | 'kayitli' | 'koleksiyon' | 'butikcan';

export interface Dikdortgen {
  x: number;
  y: number;
  genislik: number;
  yukseklik: number;
}

export interface Adim {
  /** TurHedefi'ne verilen kimlik; olculen konum bu anahtarla saklanir. */
  hedefId: string;
  baslikAnahtari: string;
  metinAnahtari: string;
}

/** Adim sirasi = kullaniciya gosterilme sirasi. Butonlarin ekrandaki
 *  fiziksel dizilimini takip eder ki ok saga sola ziplamasin. */
export const TUR_TANIMLARI: Record<TurId, Adim[]> = {
  vitrin: [
    {
      hedefId: 'vitrin.tanitim',
      baslikAnahtari: 'tur.vitrinTanitimBaslik',
      metinAnahtari: 'tur.vitrinTanitimMetin',
    },
    {
      hedefId: 'vitrin.kategoriler',
      baslikAnahtari: 'tur.kategorilerBaslik',
      metinAnahtari: 'tur.kategorilerMetin',
    },
    {
      hedefId: 'vitrin.sirala',
      baslikAnahtari: 'tur.siralaBaslik',
      metinAnahtari: 'tur.siralaMetin',
    },
    {
      hedefId: 'vitrin.butikOner',
      baslikAnahtari: 'tur.butikOnerBaslik',
      metinAnahtari: 'tur.butikOnerMetin',
    },
  ],
  webview: [
    { hedefId: 'webview.kalp', baslikAnahtari: 'tur.kalpBaslik', metinAnahtari: 'tur.kalpMetin' },
    {
      hedefId: 'webview.yorum',
      baslikAnahtari: 'tur.yorumBaslik',
      metinAnahtari: 'tur.yorumMetin',
    },
    {
      hedefId: 'webview.koleksiyon',
      baslikAnahtari: 'tur.koleksiyonEkleBaslik',
      metinAnahtari: 'tur.koleksiyonEkleMetin',
    },
    { hedefId: 'webview.geri', baslikAnahtari: 'tur.geriBaslik', metinAnahtari: 'tur.geriMetin' },
    {
      hedefId: 'webview.paylas',
      baslikAnahtari: 'tur.paylasBaslik',
      metinAnahtari: 'tur.paylasMetin',
    },
  ],
  kayitli: [
    {
      hedefId: 'kayitli.alan',
      baslikAnahtari: 'tur.kayitliBaslik',
      metinAnahtari: 'tur.kayitliMetin',
    },
  ],
  koleksiyon: [
    {
      hedefId: 'koleksiyon.yeni',
      baslikAnahtari: 'tur.yeniKoleksiyonBaslik',
      metinAnahtari: 'tur.yeniKoleksiyonMetin',
    },
  ],
  butikcan: [
    {
      hedefId: 'butikcan.girdi',
      baslikAnahtari: 'tur.butikcanBaslik',
      metinAnahtari: 'tur.butikcanMetin',
    },
  ],
};

/** Yalnizca ekranda olculebilmis hedeflerin adimlari gosterilir.
 *  Olculemeyen hedef = o an ekranda yok → adim sessizce atlanir. */
export function gorunurAdimlar(turId: TurId, hedefler: Record<string, Dikdortgen>): Adim[] {
  return TUR_TANIMLARI[turId].filter((adim) => hedefler[adim.hedefId] !== undefined);
}

/** `gorulenler === null` = telefon hafizasi henuz okunmadi; o anda tur acilmaz,
 *  yoksa gorulmus bir tur yeniden gosterilebilir. */
export function turAcilabilirMi(
  turId: TurId,
  gorulenler: TurId[] | null,
  hedefler: Record<string, Dikdortgen>,
): boolean {
  if (gorulenler === null) return false;
  if (gorulenler.includes(turId)) return false;
  return gorunurAdimlar(turId, hedefler).length > 0;
}
