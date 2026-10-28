import { ayniAlanMi } from './classify-email';

// Tarama sonuclarini inceleme gruplarina ayirir.
//
// AMAC: sahip yuzlerce adresi tek tek onaylamak zorunda kalmasin, ama guvenli
// olmayan hicbir adres de toplu onaya girmesin.
//
// AI KULLANILMIYOR: karar yalnizca domain, kaynak, guven, e-posta oneki ve
// aday sayisina bakan duz kurallarla veriliyor.
//
// EN ONEMLI KURAL: bu modul HICBIR adresi onaylamaz. Yalnizca "toplu onaya
// uygun aday" isaretler; onay dugmesine sahip basar.

export type IncelemeGrubu = 'yuksek_guven' | 'manuel_kontrol' | 'bulunamadi';

/** Tanitim/marka iletisimi icin uygun, kurumsal ve kisisel olmayan onekler. */
const GENEL_ONEKLER = new Set([
  'hello',
  'merhaba',
  'info',
  'bilgi',
  'iletisim',
  'contact',
  'business',
  'partnership',
  'partnerships',
  'partner',
  'isbirligi',
  'kurumsal',
  'corporate',
  'pr',
  'press',
  'basin',
  'marketing',
  'pazarlama',
  'office',
  'mail',
  'admin',
]);

/**
 * Yalniz operasyonel adresler. Gercek olsalar bile tanitim maili icin dogru
 * kapi degiller — sahip tek tek karar versin.
 */
const OPERASYONEL_ONEKLER = new Set([
  'support',
  'destek',
  'teknikdestek',
  'musterihizmetleri',
  'musteri',
  'customerservice',
  'siparis',
  'order',
  'orders',
  'iade',
  'return',
  'returns',
  'muhasebe',
  'accounting',
  'fatura',
  'finance',
  'kargo',
  'shipping',
  'satis',
  'sales',
  'ik',
  'hr',
  'kariyer',
  'career',
  'careers',
  'yardim',
  'help',
]);

function onek(email: string): string {
  return (email.split('@')[0] ?? '').toLowerCase().replace(/[._-]/g, '');
}

export function genelAdresMi(email: string): boolean {
  return GENEL_ONEKLER.has(onek(email));
}

export function operasyonelAdresMi(email: string): boolean {
  return OPERASYONEL_ONEKLER.has(onek(email));
}

/**
 * Onek ne genel ne operasyonel listede ise "muhtemelen kisi adi ya da marka
 * adi" say. Kesin bir yargi degil; bu yuzden silinmez, yalniz toplu onaya
 * alinmaz (or. gizem@marka.com).
 */
export function kisiselOlabilirMi(email: string): boolean {
  return !genelAdresMi(email) && !operasyonelAdresMi(email);
}

// RFC'nin tamamini degil, gercek hayatta ise yarayan sade bir dogrulama.
const GECERLI_EPOSTA =
  /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,24})+$/i;

export function gecerliEpostaMi(email: string): boolean {
  return GECERLI_EPOSTA.test(email.trim());
}

export type AdayOzeti = {
  email: string;
  confidence: string;
  sourceUrl: string | null;
};

export type IncelenecekSatir = {
  domain: string | null;
  email: string | null;
  status: string;
  doNotContact: boolean;
  taramaHatasi: boolean;
  adaylar: AdayOzeti[];
};

export type IncelemeSonucu = {
  grup: IncelemeGrubu;
  /** Manuel kontrole dustuyse sahibe gosterilecek TURKCE sebep. */
  gerekce: string | null;
};

/**
 * Bir satirin hangi inceleme grubuna girdigini soyler.
 *
 * Yuksek guven (toplu onaya uygun) icin TUM sartlar saglanmali:
 *  - durum 'onay_bekliyor' (onaylanmis/gecersiz/bulunamadi degil)
 *  - iletisim istemiyor degil, tarama hatasi yok
 *  - secili adres var, gecerli bicimde
 *  - adres butigin KENDI alan adindan
 *  - guven 'yuksek'
 *  - onek genel/kurumsal (destek, siparis, muhasebe... degil; kisi adi degil)
 *  - baska bir "makul aday" yok (birden fazla mantikli secenek varsa karar sahibin)
 */
export function incelemeGrubu(satir: IncelenecekSatir): IncelemeSonucu {
  if (satir.taramaHatasi) return { grup: 'bulunamadi', gerekce: 'Tarama hatası.' };
  if (satir.status === 'bulunamadi' || satir.adaylar.length === 0) {
    return { grup: 'bulunamadi', gerekce: 'Sitede yayımlanmış e-posta bulunamadı.' };
  }
  if (satir.doNotContact) {
    return { grup: 'manuel_kontrol', gerekce: 'Marka iletişim istemiyor.' };
  }
  if (satir.status === 'onaylandi' || satir.status === 'gecersiz') {
    return { grup: 'manuel_kontrol', gerekce: 'Karar zaten verilmiş.' };
  }

  const secili = satir.adaylar.find((a) => a.email === satir.email) ?? satir.adaylar[0];
  if (!secili || !satir.email) {
    return { grup: 'manuel_kontrol', gerekce: 'Seçili adres yok.' };
  }
  if (!gecerliEpostaMi(secili.email)) {
    return { grup: 'manuel_kontrol', gerekce: 'Adres biçimi geçerli görünmüyor.' };
  }
  if (!satir.domain || !ayniAlanMi(secili.email, satir.domain)) {
    return {
      grup: 'manuel_kontrol',
      gerekce: 'E-posta domaini butik web sitesi domaininden farklı.',
    };
  }
  if (secili.confidence !== 'yuksek') {
    return { grup: 'manuel_kontrol', gerekce: 'Adres düşük güvenli işaretlendi.' };
  }
  if (!secili.sourceUrl) {
    return { grup: 'manuel_kontrol', gerekce: 'Adresin bulunduğu sayfa kaydedilmemiş.' };
  }
  if (operasyonelAdresMi(secili.email)) {
    return {
      grup: 'manuel_kontrol',
      gerekce:
        'Yalnız operasyonel adres (destek/sipariş/muhasebe gibi) — tanıtım için uygun olmayabilir.',
    };
  }
  if (kisiselOlabilirMi(secili.email)) {
    return {
      grup: 'manuel_kontrol',
      gerekce: 'Adres kişi ya da marka adı içeriyor olabilir; kurumsal bir adres değil.',
    };
  }

  // Birden fazla "makul" aday varsa hangisinin dogru oldugu belirsizdir.
  const makulAdaylar = satir.adaylar.filter(
    (a) =>
      a.confidence === 'yuksek' &&
      satir.domain !== null &&
      ayniAlanMi(a.email, satir.domain) &&
      !operasyonelAdresMi(a.email) &&
      !kisiselOlabilirMi(a.email),
  );
  if (makulAdaylar.length > 1) {
    return {
      grup: 'manuel_kontrol',
      gerekce: `${makulAdaylar.length} uygun aday var; hangisinin kullanılacağına sen karar ver.`,
    };
  }

  return { grup: 'yuksek_guven', gerekce: null };
}
