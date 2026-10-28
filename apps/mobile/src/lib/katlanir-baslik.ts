// Vitrinde liste kaydırılınca yukarı kayıp kaybolan üst blok (Butikcan şeridi,
// davet kartı, Editörün Seçimi). Buraya React Native içe aktarması EKLENMEZ —
// dosya `bun test` ile çalışıyor; ustBlokKaymasi UI iş parçacığında da çağrılır.

/** Liste y kadar kaydırılmışken üst bloğun yukarı kayma miktarı: 0 ile blok yüksekliği arası. */
export function ustBlokKaymasi(kaydirma: number, blokYuksekligi: number): number {
  'worklet';
  return Math.min(Math.max(kaydirma, 0), Math.max(blokYuksekligi, 0));
}

/**
 * Liste içeriğinin en az yüksekliği. Blok açıkken listenin alt kısmı blok kadar
 * ekranın dışında kalır; kısa listede de blok tam kapanabilsin (son satır ve
 * "Butik öner" görünsün) diye içerik en az görünür liste + blok kadar uzun olur.
 * Uzun listede etkisi yok, sona boşluk eklemez.
 */
export function listeEnAzYukseklik(
  listeYuksekligi: number,
  blokYuksekligi: number,
): number | undefined {
  if (listeYuksekligi <= 0) return undefined;
  return listeYuksekligi + Math.max(blokYuksekligi, 0);
}

/** Bloğu kapatmak için listenin kaydırılacağı yer; zaten kapalıysa null. */
export function blokuKapatmaKaydirmasi(kaydirma: number, blokYuksekligi: number): number | null {
  return blokYuksekligi > 0 && kaydirma < blokYuksekligi ? blokYuksekligi : null;
}
