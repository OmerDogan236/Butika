// Bir HTML sayfasindan e-posta adreslerini cikarir.
//
// TEK VE DEGISMEZ KURAL: yalnizca sayfada ACIKCA yazan adresler dondurulur.
// Alan adindan "info@marka.com" gibi adres URETILMEZ. Bulunamazsa bos dizi doner.
//
// AI kullanilmiyor; bu bir metin isi, yorum gerektirmiyor.

export type FoundIn = 'mailto' | 'yapisal' | 'metin' | 'gizlenmis';

export type CikarilanEposta = {
  email: string;
  foundIn: FoundIn;
};

// Gorsel/script/analitik dosyalarinin "ad@2x.png" gibi yanlis eslesmelerini ele.
const YASAKLI_UZANTI =
  /\.(png|jpe?g|gif|webp|svg|css|js|mjs|json|woff2?|ttf|eot|ico|mp4|webm|pdf)$/i;

// Ornek/placeholder adresler — markanin gercek adresi degil.
const YASAKLI_ALAN = new Set([
  'example.com',
  'example.org',
  'domain.com',
  'yourdomain.com',
  'sentry.io',
  'wixpress.com',
  'shopify.com',
  'godaddy.com',
  'ticimax.com',
  'ideasoft.com.tr',
  'myikas.com',
]);

const YASAKLI_YEREL_AD = new Set([
  'email',
  'e-mail',
  'mail',
  'adresiniz',
  'youremail',
  'your-email',
  'name',
  'isim',
  'ornek',
  'example',
  'user',
  'sentry',
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
]);

// Yaygin duz yazim. Sonundaki nokta/virgul gibi noktalama disarida kalsin diye
// TLD en az iki harf ve harfle bitiyor.
const EPOSTA =
  /[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,24})+/gi;

// "info [at] marka [dot] com", "info(at)marka.com", "info @ marka . com"
const GIZLENMIS =
  /([a-z0-9._%+-]{1,64})\s*(?:\[at\]|\(at\)|\{at\}|\s+at\s+|＠|\[@\]|\s@\s)\s*([a-z0-9.-]{1,64}?)\s*(?:\[dot\]|\(dot\)|\{dot\}|\s+dot\s+|\.)\s*([a-z]{2,24})/gi;

function temizle(ham: string): string | null {
  const email = ham
    .trim()
    .toLowerCase()
    .replace(/^mailto:/, '')
    .replace(/[.,;:]+$/, '');
  if (!email.includes('@')) return null;
  const [yerel, alan] = email.split('@');
  if (!yerel || !alan) return null;
  if (YASAKLI_UZANTI.test(email)) return null;
  if (YASAKLI_ALAN.has(alan)) return null;
  if (YASAKLI_YEREL_AD.has(yerel)) return null;
  // Uzunluk siniri (RFC 5321) — asanlar neredeyse her zaman hatali eslesme
  if (email.length > 254 || yerel.length > 64) return null;
  // Icinde bosluk/HTML kalintisi varsa ele
  if (/[\s<>"'()]/.test(email)) return null;
  return email;
}

// HTML varliklarini (&#64; &commat; vb.) coz — bazi siteler e-postayi boyle gizliyor.
function varlikCoz(html: string): string {
  return html
    .replace(/&#(\d{1,7});/g, (_, kod: string) => String.fromCodePoint(Number(kod)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, kod: string) =>
      String.fromCodePoint(Number.parseInt(kod, 16)),
    )
    .replace(/&commat;/gi, '@')
    .replace(/&period;/gi, '.')
    .replace(/&amp;/gi, '&');
}

// Script ve style bloklarini at: analitik anahtarlari ve ornek adresler oradan geliyor.
function govdeMetni(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

// JSON-LD (schema.org) bloklarindaki "email" ALANLARINI toplar.
// Yalniz email adi tasiyan alanlar alinir; boylece sentry dsn'i gibi
// icinde @ gecen rastgele degerler devsirilmez.
function jsonLdEpostalari(html: string): string[] {
  const cikti: string[] = [];
  for (const blok of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const ham = blok[1];
    if (!ham) continue;
    let veri: unknown;
    try {
      veri = JSON.parse(ham.trim());
    } catch {
      // Site JSON-LD'yi bozuk yazmis olabilir (gercek ornek: desen.com.tr).
      // Yine de yalniz "email" ALANINI okumayi dene; rastgele metin devsirme.
      for (const alan of ham.matchAll(/"e-?mail"\s*:\s*"([^"]{3,254})"/gi)) {
        if (alan[1]) cikti.push(alan[1]);
      }
      continue;
    }
    const gez = (dugum: unknown) => {
      if (Array.isArray(dugum)) {
        for (const oge of dugum) gez(oge);
        return;
      }
      if (!dugum || typeof dugum !== 'object') return;
      for (const [anahtar, deger] of Object.entries(dugum as Record<string, unknown>)) {
        if (/^e-?mail$/i.test(anahtar) && typeof deger === 'string') cikti.push(deger);
        else gez(deger);
      }
    };
    gez(veri);
  }
  return cikti;
}

// Kaynak guvenilirligi: buyuk kazanir, zayif kaynak guclusunu ezmez.
const KAYNAK_AGIRLIGI: Record<FoundIn, number> = {
  mailto: 3,
  yapisal: 3,
  metin: 2,
  gizlenmis: 1,
};

export function epostalariCikar(html: string): CikarilanEposta[] {
  const cozulmus = varlikCoz(html);
  const bulunan = new Map<string, FoundIn>();

  const ekle = (ham: string, nerede: FoundIn) => {
    const email = temizle(ham);
    if (!email) return;
    const mevcut = bulunan.get(email);
    if (mevcut && KAYNAK_AGIRLIGI[mevcut] >= KAYNAK_AGIRLIGI[nerede]) return;
    bulunan.set(email, nerede);
  };

  // 0) JSON-LD — yapisal ve guvenilir (script blogu asagida atilmadan once okunur)
  for (const adres of jsonLdEpostalari(cozulmus)) ekle(adres, 'yapisal');

  // 1) mailto: linkleri — en guvenilir kaynak
  for (const eslesme of cozulmus.matchAll(/href\s*=\s*["']\s*mailto:([^"'?]+)/gi)) {
    ekle(eslesme[1] ?? '', 'mailto');
  }

  const govde = govdeMetni(cozulmus);
  // HTML etiketlerini bosluga cevir ki "info@<span>marka.com" yanlis birlesmesin
  const duzMetin = govde.replace(/<[^>]+>/g, ' ');

  // 2) duz metinde yazan adresler
  for (const eslesme of duzMetin.matchAll(EPOSTA)) {
    ekle(eslesme[0], 'metin');
  }

  // 3) gizlenmis yazimlar
  for (const eslesme of duzMetin.matchAll(GIZLENMIS)) {
    const [, yerel, alan, tld] = eslesme;
    if (!yerel || !alan || !tld) continue;
    ekle(`${yerel}@${alan}.${tld}`, 'gizlenmis');
  }

  return [...bulunan].map(([email, foundIn]) => ({ email, foundIn }));
}
