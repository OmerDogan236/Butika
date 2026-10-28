// Büyüteçle yapılan aramaların geçmişi (29 Eyl testinde sahibin isteği): arama
// ekranı boşken "Geçmiş aramaların" başlığıyla gösterilir. Yalnız bu cihazda,
// kullanıcı başına tutulur; sunucuya gitmez.

export type AramaKaydi =
  | { tur: 'butik'; id: string; ad: string; kapak: string | null; tarih: string }
  | { tur: 'metin'; metin: string; tarih: string };

/** Ekranda en çok bu kadar geçmiş arama gösterilir ve saklanır. */
export const GECMIS_SINIRI = 10;

const sade = (metin: string) => metin.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');

/** İki kayıt aynı aramayı mı anlatıyor: aynı butik ya da harf farkı dışında aynı metin. */
export function ayniArama(a: AramaKaydi, b: AramaKaydi): boolean {
  if (a.tur === 'butik' && b.tur === 'butik') return a.id === b.id;
  if (a.tur === 'metin' && b.tur === 'metin') return sade(a.metin) === sade(b.metin);
  return false;
}

/** Yeni aramayı en başa koyar; aynısı listede varsa yukarı taşınır. */
export function gecmiseEkle(gecmis: readonly AramaKaydi[], yeni: AramaKaydi): AramaKaydi[] {
  if (yeni.tur === 'metin' && sade(yeni.metin).length < 2) return [...gecmis];
  const metin = yeni.tur === 'metin' ? { ...yeni, metin: yeni.metin.trim() } : yeni;
  return [metin, ...gecmis.filter((k) => !ayniArama(k, metin))].slice(0, GECMIS_SINIRI);
}

export function gecmistenSil(gecmis: readonly AramaKaydi[], silinen: AramaKaydi): AramaKaydi[] {
  return gecmis.filter((k) => !ayniArama(k, silinen));
}

/** Diskten okunan değeri güvenle listeye çevirir; bozuk kayıtları atlar. */
export function gecmisiOku(ham: string | null): AramaKaydi[] {
  if (!ham) return [];
  let veri: unknown;
  try {
    veri = JSON.parse(ham);
  } catch {
    return [];
  }
  if (!Array.isArray(veri)) return [];
  return veri
    .filter((k): k is AramaKaydi => {
      if (!k || typeof k !== 'object' || typeof k.tarih !== 'string') return false;
      if (k.tur === 'butik') return typeof k.id === 'string' && typeof k.ad === 'string';
      if (k.tur === 'metin') return typeof k.metin === 'string' && k.metin.trim().length > 0;
      return false;
    })
    .slice(0, GECMIS_SINIRI);
}

export const gecmisAnahtari = (kullaniciId: string | undefined) =>
  `butika.arama.gecmis.${kullaniciId ?? 'misafir'}`;
