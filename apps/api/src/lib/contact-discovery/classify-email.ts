import type { CikarilanEposta } from './extract-emails';

export type EmailType = 'genel' | 'isbirligi' | 'kurumsal' | 'basin' | 'destek' | 'diger';
export type Confidence = 'yuksek' | 'orta' | 'dusuk';

// Yerel ad (@ oncesi) -> tur. Kelime listesi; AI gerekmiyor.
const TUR_ANAHTARLARI: Array<[EmailType, string[]]> = [
  [
    'isbirligi',
    [
      'isbirligi',
      'işbirliği',
      'isbirlikleri',
      'partnership',
      'partners',
      'partner',
      'collab',
      'collaboration',
      'marketing',
      'pazarlama',
    ],
  ],
  ['basin', ['basin', 'basın', 'press', 'pr', 'medya', 'media']],
  [
    'destek',
    [
      'destek',
      'support',
      'yardim',
      'yardım',
      'siparis',
      'sipariş',
      'order',
      'orders',
      'musteri',
      'müşteri',
      'musterihizmetleri',
      'satis',
      'satış',
      'sales',
      'iade',
      'return',
    ],
  ],
  [
    'kurumsal',
    [
      'kurumsal',
      'corporate',
      'muhasebe',
      'accounting',
      'fatura',
      'finance',
      'ik',
      'hr',
      'kariyer',
      'career',
      'insankaynaklari',
    ],
  ],
  [
    'genel',
    [
      'info',
      'iletisim',
      'iletişim',
      'contact',
      'hello',
      'merhaba',
      'bilgi',
      'mail',
      'admin',
      'office',
    ],
  ],
];

export function epostaTuru(email: string): EmailType {
  const yerel = (email.split('@')[0] ?? '').toLowerCase().replace(/[._-]/g, '');
  for (const [tur, anahtarlar] of TUR_ANAHTARLARI) {
    for (const anahtar of anahtarlar) {
      const sade = anahtar.replace(/[._-]/g, '');
      if (yerel === sade || yerel.startsWith(sade) || yerel.endsWith(sade)) return tur;
    }
  }
  return 'diger';
}

// Adresin alan adi butigin alan adiyla ayni mi? Degilse (gmail, hotmail ya da
// baska bir sirketin adresi) guven dusurulur ama adres atilmaz — kucuk
// butiklerin cogu gercekten gmail kullaniyor.
export function ayniAlanMi(email: string, domain: string): boolean {
  const alan = (email.split('@')[1] ?? '').toLowerCase();
  const hedef = domain.toLowerCase();
  return alan === hedef || alan.endsWith(`.${hedef}`) || hedef.endsWith(`.${alan}`);
}

const SERBEST_POSTA = new Set([
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'yahoo.com',
  'icloud.com',
  'yandex.com',
  'yandex.com.tr',
  'windowslive.com',
  'mynet.com',
  'msn.com',
]);

export function serbestPostaMi(email: string): boolean {
  return SERBEST_POSTA.has((email.split('@')[1] ?? '').toLowerCase());
}

// Guvenin neden tam olmadigini sahibe TURKCE anlatir. Panelde aynen gosterilir.
// null = aciklanacak bir kusur yok.
export function guvenGerekcesi(
  email: string,
  domain: string,
  confidence: Confidence,
): string | null {
  if (confidence === 'yuksek') return null;
  if (!ayniAlanMi(email, domain)) {
    return serbestPostaMi(email)
      ? 'E-posta domaini butik web sitesi domaininden farklı (ücretsiz posta hesabı).'
      : 'E-posta domaini butik web sitesi domaininden farklı.';
  }
  return 'Adres iletişim sayfasında değil, sayfa metninde geçiyor.';
}

export function guvenPuani(aday: CikarilanEposta, domain: string, sayfaTuru: string): Confidence {
  const kendiAlani = ayniAlanMi(aday.email, domain);
  const iletisimSayfasi = sayfaTuru === 'iletisim' || sayfaTuru === 'kurumsal';

  if ((aday.foundIn === 'mailto' || aday.foundIn === 'yapisal') && kendiAlani) return 'yuksek';
  if (kendiAlani && iletisimSayfasi) return 'yuksek';
  if (kendiAlani) return 'orta';
  if ((aday.foundIn === 'mailto' || aday.foundIn === 'yapisal') && serbestPostaMi(aday.email))
    return 'orta';
  if (serbestPostaMi(aday.email)) return 'dusuk';
  // Baska bir sirketin alan adi (ajans, tedarikci) — muhtemelen markanin degil
  return 'dusuk';
}

const TUR_ONCELIGI: EmailType[] = ['genel', 'kurumsal', 'isbirligi', 'destek', 'basin', 'diger'];
const GUVEN_ONCELIGI: Confidence[] = ['yuksek', 'orta', 'dusuk'];

export type Siralanabilir = {
  email: string;
  emailType: EmailType;
  confidence: Confidence;
};

// Tanitim maili icin en uygun adresi ONERIR. Secim her zaman sahibin.
// Once guven, sonra tur: "yuksek guvenli destek@" adresi, "dusuk guvenli
// info@" adresinden daha iyidir.
export function onerilenEposta<T extends Siralanabilir>(adaylar: T[]): T | null {
  if (adaylar.length === 0) return null;
  const sirali = [...adaylar].sort((a, b) => {
    const guven = GUVEN_ONCELIGI.indexOf(a.confidence) - GUVEN_ONCELIGI.indexOf(b.confidence);
    if (guven !== 0) return guven;
    return TUR_ONCELIGI.indexOf(a.emailType) - TUR_ONCELIGI.indexOf(b.emailType);
  });
  return sirali[0] ?? null;
}
