// Güncelleme sonrası kişisel akış kararları (saf): mevcut kullanıcıya test mi, video mu, hiçbiri mi.
// Tasarım: docs/superpowers/specs/2026-10-01-kisisel-butika-tasarim.md (§1 Mevcut kullanıcı)

/** "Daha sonra" bu kadar kez seçilince açılışta test artık sorulmaz. */
export const DAHA_SONRA_SINIRI = 2;

export interface AkisDurumu {
  /** Sunucuda tarz testi kaydı var mı; undefined = henüz bilinmiyor. */
  testVar: boolean | undefined;
  videoGoruldu: boolean;
  dahaSonraSayisi: number;
  dil: string;
  /** Onboarding bu oturumda tamamlandı (test ve video orada gösterildi). */
  yeniKurulum: boolean;
}

export type KisiselAdim = 'test' | 'video';

/** Açılıştaki test sorusunu kapatmak için sayacı sınıra çeker (zaten üstündeyse dokunmaz). */
export function dahaSonraSiniriyaCek(sayi: number): number {
  return Math.max(sayi, DAHA_SONRA_SINIRI);
}

/** Video yalnız Türkçe kullanıcıya (İngilizce sürüm gelene kadar). */
export function videoGosterilsinMi(dil: string): boolean {
  return dil.startsWith('tr');
}

export function sonrakiAdim(d: AkisDurumu): KisiselAdim | null {
  if (d.yeniKurulum || d.testVar === undefined) return null;
  if (!d.testVar && d.dahaSonraSayisi < DAHA_SONRA_SINIRI) return 'test';
  if (videoGosterilsinMi(d.dil) && !d.videoGoruldu) return 'video';
  return null;
}

/**
 * Güncelleme akışında test sonuçsuz kapandı mı ("Daha sonra" sayılır)? Sonuç yok = her adım
 * atlandı ya da gönderim hata verdi. Sayılmazsa sunucuda kayıt olmadığı için test her açılışta
 * yeniden sorulur; "en çok 2 kez" kuralı bozulur. Tekrar denenebilir hatada cevap telefonda
 * bekler (test var sayılır), sayacın artması zararsız.
 */
export function ertelemeSayilirMi(sonuc: unknown): boolean {
  return sonuc === null || sonuc === undefined;
}

export function davetKartiGorunsunMu(d: {
  testVar: boolean | undefined;
  kartKapatildi: boolean;
}): boolean {
  return d.testVar === false && !d.kartKapatildi;
}

/**
 * Gönderilemeyen cevap telefonda saklanıp sonra yeniden gönderilsin mi?
 * Ağ hatası (status yok), 5xx, 401 (oturum düştü), 408, 429 → evet. Diğer 4xx → hayır:
 * cevap geçersiz; tekrar göndermek sonuç vermez, sonsuza dek bekletilmesin.
 */
export function yenidenDenenebilirMi(status: number | undefined): boolean {
  if (status === undefined) return true;
  if (status === 401 || status === 408 || status === 429) return true;
  return status >= 500;
}

function sirali(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(sirali);
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, sirali(o[k])]),
    );
  }
  return x;
}

/**
 * Telefonda saklanan cevap, az önce yeniden gönderilenle hâlâ aynı mı?
 * Yalnız aynıysa silinir: gönderim sürerken saklanan daha yeni bir cevap kaybolmasın.
 */
export function ayniCevapMi(saklanan: unknown, gonderilen: unknown): boolean {
  if (saklanan === null || saklanan === undefined) return false;
  return JSON.stringify(sirali(saklanan)) === JSON.stringify(sirali(gonderilen));
}

/**
 * "Sana özel" seçeneği: tarz testi varsa ya da sunucu profili dolu diyorsa (aşama 3,
 * GET /me/profil-durumu). Bilinmiyorken (yükleniyor, eski sunucu) görünmez.
 */
export function kisiselVarMi(
  testVar: boolean | undefined,
  profilDolu: boolean | undefined,
): boolean {
  return testVar === true || profilDolu === true;
}

export type VitrinSiralamasi = 'onerilen' | 'uygun_once' | 'luks_once' | 'kisisel' | 'alfabetik';

/**
 * "Sana özel" bilgisi (kisiselVarMi) değişince vitrin sıralaması: varken varsayılan
 * "Sana özel", yokken o seçenek kalkar → "Önerilen". Kullanıcının bilerek seçtiği
 * diğer sıralamalara (fiyat, A–Z) dokunulmaz.
 */
export function varsayilanSiralama(
  kisiselVar: boolean,
  mevcut: VitrinSiralamasi,
): VitrinSiralamasi {
  if (kisiselVar && mevcut === 'onerilen') return 'kisisel';
  if (!kisiselVar && mevcut === 'kisisel') return 'onerilen';
  return mevcut;
}
