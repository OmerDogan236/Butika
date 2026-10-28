// Kullanici uretimi metinlerde (yorum, profil adi) uygunsuz ifade filtresi.
//
// NEDEN VAR: App Store Review Guideline 1.2, kullanici icerigi olan uygulamalardan
// "uygunsuz materyalin YAYINLANMADAN filtrelenmesi" icin bir yontem istiyor.
// Sikayet ve engelleme ayri maddeler; onlarin olmasi bunun yerini tutmuyor.
//
// TASARIM KARARI 1 — ı ve i BIRLESTIRILMEZ.
// Turkce metin sadelestirmede genelde noktasiz ı, noktali i'ye cevrilir. Burada
// bunu YAPMIYORUZ: "sıkıntı" → "sikinti" olurdu ve "sik" kokuyle eslesirdi.
// "canimi sikti", "sikinti yok" gibi son derece yaygin cumleler engellenirdi.
// Yanlis pozitif (masum yorumu engellemek), yanlis negatifden daha zararlidir.
//
// TASARIM KARARI 2 — kisa/belirsiz kokler yalniz TAM kelime olarak eslesir.
// "am", "got", "bok" gibi kokler onek olarak arandiginda "ama", "aman", "amac",
// "goturmek", "boks" gibi kelimeleri yakalar. Bunlar `tam: true` ile isaretli.
//
// Liste elle duzenlenebilir; yeni bir kelime eklemek icin KUFUR_KOKLERI'ne bir
// satir yetiyor. Tehdit/zorbalik gibi kelimeyle yakalanamayan durumlar icin
// sikayet + engelleme mekanizmasi ikinci katman olarak duruyor.

interface Kok {
  kok: string;
  /** true = yalniz tam kelime eslesir (kisa veya baska kelimelerin basinda gecen kokler) */
  tam?: boolean;
}

/** Turkce cekim eki butcesi: "orospu" → "orospulugundan" gibi uzamalara izin verir. */
const EK_BUTCESI = 8;

const KUFUR_KOKLERI: Kok[] = [
  // --- Turkce ---
  { kok: 'orospu' },
  { kok: 'siktir' },
  { kok: 'sik' }, // ı korundugu icin "sıkıntı" ile carpismiyor (bkz. GUVENLI_KELIMELER: sikke)
  { kok: 'yarrak' },
  { kok: 'yarak' },
  { kok: 'amcik' },
  { kok: 'amcık' },
  { kok: 'gotveren' },
  { kok: 'gotlek' },
  { kok: 'kahpe' },
  { kok: 'kaltak' },
  { kok: 'pezevenk' },
  { kok: 'ibne' },
  { kok: 'pust' },
  { kok: 'surtuk' },
  { kok: 'serefsiz' },
  { kok: 'yavsak' },
  { kok: 'gavat' },
  { kok: 'pic' },
  { kok: 'bok' }, // "boks"/"boksor" GUVENLI_KELIMELER'de
  { kok: 'amina' },
  { kok: 'aminakoyayim' },
  { kok: 'am', tam: true }, // ama, aman, amac, ambalaj, amir…
  { kok: 'got', tam: true }, // gotur, goturmek…
  { kok: 'oc', tam: true },
  { kok: 'amk', tam: true },
  { kok: 'aq', tam: true },

  // --- Ingilizce (uygulama EN de destekliyor) ---
  { kok: 'fuck' },
  { kok: 'shit' },
  { kok: 'bitch' },
  { kok: 'cunt' },
  { kok: 'asshole' },
  { kok: 'whore' },
  { kok: 'slut' },
  { kok: 'faggot' },
  { kok: 'nigger' },
  { kok: 'nigga' },
  { kok: 'motherfuck' },
  { kok: 'dick', tam: true }, // Dickens, dickie…
  { kok: 'fag', tam: true },
];

/**
 * Onek eslesmesinde yanlis pozitife yol acan gercek kelimeler.
 * DIKKAT: burada YAZILDIGI gibi degil, NORMALIZE EDILMIS hali karsilastirilir —
 * normalize tekrar eden harfi tekile indirdigi icin "sikke" → "sike" olur.
 * Liste asagida bir kez normalize edilip oyle saklanir.
 */
const GUVENLI_HAM = [
  'sikke', // eski para birimi → normalize: "sike"
  'boks',
  'boksör',
  'bokser',
];

/**
 * Metni karsilastirmaya hazirlar.
 * - Turkce'ye uygun kucultme (İ→i, I→ı)
 * - Aksan sadelestirme — ı DISINDA (bkz. dosya basi)
 * - Rakam/simge ile harf gizleme cozulur (s1kt1r, $ik, @m)
 * - Ust uste tekrar eden harfler tekile iner (siiiiktir → siktir)
 * - Harf disi her sey bosluga cevrilir
 */
export function metniNormalize(metin: string): string {
  let s = metin;
  // Turkce kucultme: once ozel iki harf, sonra geneli.
  s = s.replace(/İ/g, 'i').replace(/I/g, 'ı');
  s = s.toLowerCase();

  const aksan: Record<string, string> = {
    ç: 'c',
    ğ: 'g',
    ö: 'o',
    ş: 's',
    ü: 'u',
    â: 'a',
    î: 'i',
    û: 'u',
    é: 'e',
    ê: 'e',
    á: 'a',
    à: 'a',
  };
  const leet: Record<string, string> = {
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '7': 't',
    '8': 'b',
    '@': 'a',
    $: 's',
    '!': 'i',
    '¡': 'i',
    '*': '',
  };

  let cikti = '';
  for (const ch of s) {
    const d = aksan[ch] ?? leet[ch] ?? ch;
    if (d === '') continue;
    // ı bilerek korunuyor: "sıkıntı" ile "siktir" karismasin.
    if ((d >= 'a' && d <= 'z') || d === 'ı') cikti += d;
    else cikti += ' ';
  }

  // Tekrar eden harfleri tekile indir: "siiik" → "sik"
  cikti = cikti.replace(/(.)\1+/g, '$1');
  return cikti.trim().replace(/\s+/g, ' ');
}

/**
 * Tek harfli komsu parcalari birlestirir: "s i k t i r" → "siktir", "a m k" → "amk".
 * Tum metni birlestirmiyoruz — o, kelime sinirlarinda sahte esleseler uretirdi.
 */
function tekHarfleriBirlestir(parcalar: string[]): string[] {
  const cikti: string[] = [];
  let biriken = '';
  for (const p of parcalar) {
    if (p.length === 1) {
      biriken += p;
      continue;
    }
    if (biriken.length > 1) cikti.push(biriken);
    biriken = '';
    cikti.push(p);
  }
  if (biriken.length > 1) cikti.push(biriken);
  return cikti;
}

/** Normalize edilmis guvenli kelimeler — modul yuklenirken bir kez hesaplanir. */
const GUVENLI_KELIMELER = new Set(GUVENLI_HAM.map((k) => metniNormalize(k)));

function parcaEslesiyorMu(parca: string): string | null {
  if (GUVENLI_KELIMELER.has(parca)) return null;
  for (const { kok, tam } of KUFUR_KOKLERI) {
    if (tam) {
      if (parca === kok) return kok;
      continue;
    }
    if (parca.startsWith(kok) && parca.length - kok.length <= EK_BUTCESI) return kok;
  }
  return null;
}

export interface FiltreSonucu {
  uygun: boolean;
  /** Eslesen kok — yalniz gunluk/teshis icin; kullaniciya GOSTERILMEZ. */
  eslesen?: string;
}

/** Metin yayinlanabilir mi? */
export function icerikUygunMu(metin: string): FiltreSonucu {
  const normal = metniNormalize(metin);
  if (!normal) return { uygun: true };

  const parcalar = normal.split(' ').filter(Boolean);
  const hepsi = [...parcalar, ...tekHarfleriBirlestir(parcalar)];

  for (const parca of hepsi) {
    const kok = parcaEslesiyorMu(parca);
    if (kok) return { uygun: false, eslesen: kok };
  }
  return { uygun: true };
}
