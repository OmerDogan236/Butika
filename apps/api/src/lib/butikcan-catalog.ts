import { boutiqueCategories, boutiques, categories } from '@butika/db';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from './db';

export interface CatalogData {
  text: string;
  ids: Set<string>;
  /**
   * Aynı adaylar, EN ALAKALIDAN başlayarak sıralı.
   *
   * Gemini cevap veremediğinde (yavaşlık/kesinti) kullanıcıyı boş ekranla
   * bırakmamak için kullanılır: burada zaten soruya, tarza, fiyat segmentine ve
   * etiketlere göre puanlanmış bir sıra var — yapay zekâ olmadan da anlamlı.
   */
  siraliIdler: string[];
}

export interface BoutiqueRow {
  id: string;
  name: string;
  description: string | null;
  categoryNames: string;
  sortOrder: number;
  tarz1: string | null;
  tarz2: string | null;
  fiyatSegmenti: string | null;
  /** Kategori grubuna özel etiketler (güzellik/parfüm ile başlıyor). Tarzdan ayrıdır. */
  etiketler?: string[] | null;
  /** Vitrin aramasında kategori süzgeci için. */
  categoryIds?: string[];
}

// Kullanıcı mesajındaki ifadelerden tarz niyeti (TARZLAR sözlüğüne eşlenir).
// Eşleşme alt dize ile yapılır; çok kısa/çok anlamlı kelimeler bilerek yok.
export const TARZ_IFADELERI: Record<string, string[]> = {
  minimal: ['minimal', 'minimalist', 'sade kesim', 'süssüz'],
  'sade şık': [
    'sade şık',
    'şık',
    'zarif',
    'klasik',
    'ofis',
    'iş için',
    'terzi',
    'blazer',
    'takım elbise',
    'sofistike',
  ],
  günlük: ['günlük', 'gündelik', 'rahat', 'basic', 'her gün'],
  bohem: ['bohem', 'boho', 'salaş', 'etnik', 'keten', 'hippi'],
  romantik: ['romantik', 'dantel', 'fırfır', 'volan', 'feminen', 'çiçekli', 'narin'],
  sokak: ['sokak', 'streetwear', 'street', 'oversize', 'kapüşon', 'baggy', 'kargo'],
  vintage: ['vintage', 'retro', 'nostaljik', 'eski tarz', '90lar', "90'lar", '70ler', "70'ler"],
  'spor şık': ['spor şık', 'sporty', 'atletik', 'athleisure', 'eşofman'],
  cesur: ['cesur', 'iddialı', 'dikkat çekici', 'renkli', 'maksimalist', 'neon', 'çılgın'],
};

// Kullanıcının kullandığı kelime → KATEGORİ ADI köprüsü.
//
// NEDEN: Ön eleme kategori adında düz metin arıyordu; "kozmetik" kelimesi "Güzellik"
// kategorisiyle eşleşmediği için güzellik butikleri elemeyi geçemiyor ve katalog
// popüler ilk 50'ye düşüyordu (yani Gemini'ye alakasız aday listesi gidiyordu).
// Kategori adları DB'deki adlarla birebir yazılır; TR ve US pazarlarının adları
// farklı olduğu için ikisi de burada. Eşleşme küçük harfe çevrilmiş kategori adı
// metninde alt dize olarak aranır (adın sonundaki boşluklar sorun çıkarmaz).
export const KATEGORI_ESANLAMLARI: { kategori: string; ifadeler: string[] }[] = [
  {
    kategori: 'güzellik',
    ifadeler: [
      'kozmetik',
      'cilt bakım',
      'ciltbakım',
      'cilt için',
      'cildim',
      'makyaj',
      'dermokozmetik',
      'serum',
      'nemlendirici',
      'güneş kremi',
      'temizleyici',
      'tonik',
      'peeling',
      'maske',
      'saç bakım',
      'şampuan',
      'bakım ürün',
      'doğal ürün',
      'organik ürün',
      'vegan ürün',
      'skincare',
    ],
  },
  {
    kategori: 'parfüm & koku',
    ifadeler: [
      'parfüm',
      'parfum',
      'koku',
      'esans',
      'kolonya',
      'oda kokusu',
      'aromaterapi',
      'uçucu yağ',
      'fragrance',
    ],
  },
  {
    kategori: 'mücevher',
    ifadeler: ['mücevher', 'takı', 'küpe', 'kolye', 'yüzük', 'bileklik', 'bilezik', 'pırlanta'],
  },
  { kategori: 'çanta', ifadeler: ['çanta', 'clutch', 'handbag'] },
  {
    kategori: 'ayakkabı',
    ifadeler: ['ayakkabı', 'topuklu', 'çizme', 'sneaker', 'sandalet', 'babet', 'loafer'],
  },
  { kategori: 'eşarp', ifadeler: ['eşarp', 'şal', 'fular'] },
  {
    kategori: 'iç giyim',
    ifadeler: ['iç giyim', 'sütyen', 'külot', 'pijama', 'gecelik', 'çamaşır', 'bralet'],
  },
  {
    kategori: 'abiye',
    ifadeler: ['abiye', 'gece elbisesi', 'davet elbisesi', 'mezuniyet', 'nişanlık', 'kına'],
  },
  { kategori: 'bridal', ifadeler: ['gelinlik', 'nikah', 'bridal', 'düğün', 'wedding dress'] },
  { kategori: 'plaj', ifadeler: ['mayo', 'bikini', 'plaj', 'pareo', 'swimsuit', 'swimwear'] },
  { kategori: 'tesettür', ifadeler: ['tesettür', 'başörtü', 'ferace', 'abaya', 'hijab'] },
  { kategori: 'kids corner', ifadeler: ['çocuk', 'kids', 'children'] },
  { kategori: 'organik bebek giyim', ifadeler: ['bebek', 'baby'] },
  { kategori: 'büyük beden', ifadeler: ['büyük beden', 'plus size', 'geniş beden'] },
  { kategori: 'hamile giyim', ifadeler: ['hamile', 'lohusa', 'emzirme'] },
  { kategori: 'spor giyim', ifadeler: ['spor giyim', 'tayt', 'yoga', 'fitness', 'koşu'] },
  { kategori: 'şık ev giyimi', ifadeler: ['ev giyim', 'ev kıyafet', 'loungewear', 'sabahlık'] },
  { kategori: 'deri', ifadeler: ['deri ceket', 'hakiki deri', 'süet'] },
  { kategori: 'hediyelik', ifadeler: ['hediye', 'kokulu mum', 'difüzör'] },
  { kategori: 'kiralık', ifadeler: ['kiralık', 'kirala'] },
  { kategori: 'kayak', ifadeler: ['kayak', 'snowboard'] },
  { kategori: 'tasarımcılar', ifadeler: ['tasarımcı', 'designer'] },
  { kategori: 'aksesuar', ifadeler: ['aksesuar', 'kemer', 'şapka', 'toka'] },
  {
    kategori: 'giyim',
    ifadeler: [
      'elbise',
      'gömlek',
      'pantolon',
      'etek',
      'ceket',
      'kazak',
      'triko',
      'jean',
      'bluz',
      'tişört',
      'mont',
      'trençkot',
    ],
  },
  // US pazarı
  { kategori: 'bag', ifadeler: ['bag', 'purse', 'tote'] },
  { kategori: 'shoes', ifadeler: ['shoes', 'heels', 'boots'] },
  { kategori: 'beach', ifadeler: ['beach'] },
  { kategori: 'sleepwear', ifadeler: ['sleepwear', 'pajama', 'pyjama', 'nightwear'] },
  { kategori: 'lingerie', ifadeler: ['lingerie', 'underwear'] },
  { kategori: 'event dresses', ifadeler: ['event dress', 'evening dress', 'gown', 'prom'] },
  { kategori: 'activewear', ifadeler: ['activewear', 'workout', 'gym'] },
  { kategori: 'leather', ifadeler: ['leather'] },
  { kategori: 'casual', ifadeler: ['casual', 'everyday'] },
];

// Kullanıcının kelimesi → ETİKET köprüsü (kategori grubuna özel etiketler; tarzdan ayrı).
export const ETIKET_IFADELERI: Record<string, string[]> = {
  'doğal içerik': [
    'doğal',
    'organik',
    'vegan',
    'bitkisel',
    'sertifikalı',
    'temiz içerik',
    'kimyasal içermeyen',
    'paraben',
  ],
  'etkin bakım': [
    'serum',
    'asit',
    'retinol',
    'niasinamid',
    'hyalüronik',
    'dermatolojik',
    'leke',
    'akne',
    'kırışıklık',
    'yaşlanma karşıtı',
    'sonuç odaklı',
  ],
  'niş parfüm': ['niş parfüm', 'nis parfum', 'butik parfüm', 'özel koku', 'sıra dışı koku'],
  'günlük makyaj': ['makyaj', 'ruj', 'maskara', 'fondöten', 'allık', 'far', 'dudak'],
  'lüks bakım': ['lüks bakım', 'ritüel', 'hediyelik bakım', 'üst segment bakım'],
};

// İfade, kelime BAŞINDA aranır; Türkçe ekler (çantalar, elbiseyi) yine eşleşir ama
// "derin" gibi kelimeler "deri"yi tetiklemez.
function ifadeGecerMi(metin: string, ifade: string): boolean {
  let i = metin.indexOf(ifade);
  while (i !== -1) {
    const onceki = i === 0 ? '' : metin[i - 1];
    if (!onceki || !/[a-zçğıöşü0-9]/.test(onceki)) return true;
    i = metin.indexOf(ifade, i + 1);
  }
  return false;
}

// Fiyat niyeti → kabul edilen segmentler. Segmentler görelidir; rakam söylenmez.
const FIYAT_IFADELERI: { ifadeler: string[]; segmentler: string[] }[] = [
  {
    ifadeler: [
      'uygun fiyat',
      'ucuz',
      'ekonomik',
      'hesaplı',
      'bütçe',
      'fazla para vermeden',
      'pahalı olmayan',
    ],
    segmentler: ['uygun'],
  },
  { ifadeler: ['orta fiyat', 'fiyat performans'], segmentler: ['orta'] },
  {
    ifadeler: ['lüks', 'luks', 'premium', 'pahalı', 'üst segment', 'high-end'],
    segmentler: ['yuksek', 'luks'],
  },
];

export interface Intent {
  tarzlar: Set<string>;
  segmentler: Set<string>;
  kategoriler: Set<string>;
  etiketler: Set<string>;
  /**
   * Kullanıcının mesajda AÇIKÇA söylediği ürün kategorileri ("çanta", "ayakkabı" …).
   * `kategoriler`den farkı: mevsimden tahmin edilenler ("yazlık" → plaj) burada yok.
   * Doluysa ve o kategoride yeterli butik varsa adaylar yalnız o kategoriden seçilir.
   */
  acikKategoriler?: Set<string>;
  /**
   * Kullanıcının tarz testinden gelen tarzı/bütçesi. Mesajda açıkça bir tarz ya da
   * bütçe belirtilmediğinde devreye girer ve YARI ağırlıkla puanlanır: kişiselleştirme
   * yapar ama o anki isteğin önüne geçmez.
   */
  profilTarzlar?: Set<string>;
  profilSegmentler?: Set<string>;
  /** Profilin ürün etiketlerinden arama kelimeleri; eşleşen butik +1 (profil tarzından düşük). */
  profilIpuclari?: Set<string>;
}

/** Kullanıcının tarz testi özeti — yalnız yapay zekâ aktarım onayı varsa kullanılır. */
export interface TarzProfili {
  tarz1: string | null;
  tarz2: string | null;
  fiyatSegmentleri: string[];
  /** Profilin ürün etiketlerinden arama kelimeleri (PROFIL_VITRIN_ENABLED); yoksa etkisiz. */
  aramaIpuclari?: string[];
}

// Mevsim: "yazlık bir şeyler" gibi sorularda kategori ve ürün kelimeleri butik
// açıklamalarında aranır (sahip, 1 Eki: plaj, pareo, bikini... yazla ilgili).
const MEVSIMLER: { tetik: RegExp; kategori: string; kelimeler: string[] }[] = [
  {
    tetik:
      /(^|[^a-zçğıöşü])(yaz|yazlık|yazlıklar|yazın|yaza|tatil|tatile|tatilde|sahil|deniz|havuz)([^a-zçğıöşü]|$)/,
    kategori: 'plaj',
    kelimeler: [
      'plaj',
      'pareo',
      'bikini',
      'mayo',
      'kaftan',
      'keten',
      'şort',
      'hasır',
      'sandalet',
      'yazlık',
      'tatil',
      'beach',
    ],
  },
  {
    tetik: /(^|[^a-zçğıöşü])(kış|kışlık|kışın|soğuk|kar)([^a-zçğıöşü]|$)/,
    kategori: 'kayak',
    kelimeler: [
      'mont',
      'kaban',
      'palto',
      'triko',
      'kazak',
      'yün',
      'kaşmir',
      'atkı',
      'bere',
      'polar',
      'kışlık',
    ],
  },
];

/** Sorudaki mevsime göre eklenecek kategori ve arama kelimeleri. */
export function mevsimGenislet(query: string): { kategoriler: string[]; kelimeler: string[] } {
  const q = query.toLocaleLowerCase('tr');
  const m = MEVSIMLER.filter((x) => x.tetik.test(q));
  return { kategoriler: m.map((x) => x.kategori), kelimeler: m.flatMap((x) => x.kelimeler) };
}

export function detectIntent(query: string): Intent {
  const q = query.toLocaleLowerCase('tr');
  const tarzlar = new Set<string>();
  for (const [tarz, ifadeler] of Object.entries(TARZ_IFADELERI)) {
    if (ifadeler.some((i) => q.includes(i))) tarzlar.add(tarz);
  }
  const segmentler = new Set<string>();
  for (const { ifadeler, segmentler: segs } of FIYAT_IFADELERI) {
    if (ifadeler.some((i) => q.includes(i))) for (const sg of segs) segmentler.add(sg);
  }
  const kategoriler = new Set<string>();
  for (const { kategori, ifadeler } of KATEGORI_ESANLAMLARI) {
    if (ifadeler.some((i) => ifadeGecerMi(q, i))) kategoriler.add(kategori);
  }
  const acikKategoriler = new Set(kategoriler);
  for (const kat of mevsimGenislet(query).kategoriler) kategoriler.add(kat);
  const etiketler = new Set<string>();
  for (const [etiket, ifadeler] of Object.entries(ETIKET_IFADELERI)) {
    if (ifadeler.some((i) => ifadeGecerMi(q, i))) etiketler.add(etiket);
  }
  return { tarzlar, segmentler, kategoriler, etiketler, acikKategoriler };
}

/**
 * Ön elemeye verilecek metin: son kullanıcı mesajı, gerekirse önceki isteğiyle birlikte.
 *
 * NEDEN (4 Eki): "bana çanta önerir misin" → çanta butikleri; ardından "daha uygun fiyatlı
 * olanlar var mı" denince ön eleme yalnız son mesaja baktığı için çantayı unutuyor, Gemini'ye
 * giyim butikleri gidiyordu. Son mesajda ürün/kategori yoksa geriye doğru kategori geçen
 * en yakın kullanıcı mesajı eklenir. Son mesajda kategori varsa (konu değişti) yalnız o.
 * Model mesajları kullanılmaz: Butikcan'ın kendi sorusu kullanıcının isteği değildir.
 */
export function onElemeSorusu(messages: { role: 'user' | 'model'; text: string }[]): string {
  const kullanici = messages.filter((m) => m.role === 'user').map((m) => m.text);
  const son = kullanici.at(-1) ?? '';
  const urunVar = (metin: string) => (detectIntent(metin).acikKategoriler?.size ?? 0) > 0;
  if (urunVar(son)) return son;
  const onceki = kullanici.slice(0, -1).reverse().find(urunVar);
  return onceki ? `${son}\n${onceki}` : son;
}

export const BOS_INTENT: Intent = {
  tarzlar: new Set<string>(),
  segmentler: new Set<string>(),
  kategoriler: new Set<string>(),
  etiketler: new Set<string>(),
};

/**
 * Kullanıcının tarz testini niyete ekler — AMA yalnız o anki mesaj sessizse.
 * "Bugün spor bir şey istiyorum" diyen bohem kullanıcıya bohem dayatmayız; mesajda
 * geçen istek her zaman profilin önündedir.
 */
export function profiliUygula(intent: Intent, profil?: TarzProfili): Intent {
  if (!profil) return intent;
  if (intent.tarzlar.size === 0) {
    const t = [profil.tarz1, profil.tarz2].filter((x): x is string => Boolean(x));
    if (t.length > 0) intent.profilTarzlar = new Set(t);
  }
  if (intent.segmentler.size === 0 && profil.fiyatSegmentleri.length > 0) {
    intent.profilSegmentler = new Set(profil.fiyatSegmentleri);
  }
  if (profil.aramaIpuclari && profil.aramaIpuclari.length > 0) {
    intent.profilIpuclari = new Set(profil.aramaIpuclari);
  }
  return intent;
}

// Bir butiğin sorguya uygunluk puanı. İsim > tarz > kategori > fiyat > açıklama.
export function scoreRow(r: BoutiqueRow, kws: string[], intent: Intent): number {
  const name = r.name.toLocaleLowerCase('tr');
  const cats = (r.categoryNames ?? '').toLocaleLowerCase('tr');
  const desc = (r.description ?? '').toLocaleLowerCase('tr');
  let score = 0;
  for (const k of kws) {
    if (name.includes(k)) score += 5;
    if (cats.includes(k)) score += 3;
    if (desc.includes(k)) score += 1;
  }
  if (r.tarz1 && intent.tarzlar.has(r.tarz1)) score += 4;
  if (r.tarz2 && intent.tarzlar.has(r.tarz2)) score += 2;
  if (r.fiyatSegmenti && intent.segmentler.has(r.fiyatSegmenti)) score += 3;
  // Eşanlam köprüsü: "kozmetik" → Güzellik kategorisi. Butiğin kategorisi kullanıcının
  // kastettiği kategoriyse güçlü sinyal; birden fazla kategori kastedildiyse toplanır.
  for (const kat of intent.kategoriler) {
    if (cats.includes(kat)) score += 4;
  }
  // Grup etiketi ("doğal içerik", "niş parfüm" …) — kategoriden daha ince sinyal.
  for (const et of r.etiketler ?? []) {
    if (intent.etiketler.has(et)) score += 3;
  }
  // Kullanıcının kendi tarzı: mesajda tarz belirtilmediğinde yarı ağırlıkla.
  if (intent.profilTarzlar) {
    if (r.tarz1 && intent.profilTarzlar.has(r.tarz1)) score += 2;
    if (r.tarz2 && intent.profilTarzlar.has(r.tarz2)) score += 1;
  }
  if (intent.profilSegmentler && r.fiyatSegmenti && intent.profilSegmentler.has(r.fiyatSegmenti)) {
    score += 1;
  }
  // Profilin ürün etiketleri (keten, gömlek …): yalnız ipucu, butik başına en çok +1.
  if (intent.profilIpuclari) {
    const metin = `${name} ${cats} ${desc}`;
    if ([...intent.profilIpuclari].some((ip) => ifadeGecerMi(metin, ip))) score += 1;
  }
  return score;
}

const SEGMENT_METNI: Record<string, string> = {
  uygun: 'uygun fiyatlı',
  orta: 'orta',
  yuksek: 'yüksek',
  luks: 'lüks',
};

// Pazar başına butik HAVUZU cache'i (ham veri). Filtreleme her istekte in-memory yapılır.
const poolCache = new Map<string, { rows: BoutiqueRow[]; at: number }>();
const TTL_MS = 10 * 60 * 1000;

const MAX_CANDIDATES = 50;
// Açıkça istenen kategoride en az bu kadar butik varsa adaylar yalnız oradan seçilir;
// daha azsa liste eskisi gibi diğer butiklerle tamamlanır (Gemini "en az 5" öneriyor).
const MIN_KATEGORI_ADAYI = 4; // Gemini'ye gönderilecek aday butik sayısı (702'nin tamamı değil)
const DESC_LEN = 250; // Açıklama kırpma sınırı (eski 80 → daha zengin eşleşme sinyali)

// Basit Türkçe durak kelimeler — skorlamada göz ardı edilir (gürültüyü azaltır).
const STOPWORDS = new Set([
  've',
  'ile',
  'için',
  'bir',
  'bu',
  'şu',
  'çok',
  'daha',
  'en',
  'ne',
  'gibi',
  'olan',
  'ben',
  'sen',
  'bana',
  'sana',
  'arıyorum',
  'istiyorum',
  'lazım',
  'var',
  'yok',
  'ama',
  'peki',
  'acaba',
  'hangi',
  'nasıl',
  'olur',
  'the',
  'and',
  'için',
  'ya',
  'de',
  'da',
  'ki',
  'bana',
  'biraz',
  'çok',
  'sade',
  'güzel',
  'öner',
  'önerir',
  'misin',
  'lütfen',
]);

function keywords(q: string): string[] {
  return Array.from(
    new Set(
      q
        .toLocaleLowerCase('tr')
        .split(/[^a-zçğıöşü0-9]+/i)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
    ),
  );
}

export async function getPool(market: string): Promise<BoutiqueRow[]> {
  const hit = poolCache.get(market);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;

  const rows = await db
    .select({
      id: boutiques.id,
      name: boutiques.name,
      description: boutiques.description,
      tarz1: boutiques.tarz1,
      tarz2: boutiques.tarz2,
      fiyatSegmenti: boutiques.fiyatSegmenti,
      etiketler: boutiques.etiketler,
      sortOrder: sql<number>`min(${boutiques.sortOrder})`,
      categoryNames: sql<string>`coalesce(string_agg(${categories.name}, ', ' order by ${categories.name}), '-')`,
      categoryIds: sql<
        string[]
      >`coalesce(array_agg(${boutiqueCategories.categoryId}) filter (where ${boutiqueCategories.categoryId} is not null), '{}')`,
    })
    .from(boutiques)
    .leftJoin(boutiqueCategories, eq(boutiqueCategories.boutiqueId, boutiques.id))
    .leftJoin(categories, eq(categories.id, boutiqueCategories.categoryId))
    .where(and(eq(boutiques.countryCode, market), eq(boutiques.isActive, true)))
    .groupBy(boutiques.id)
    .orderBy(asc(boutiques.sortOrder));

  poolCache.set(market, { rows, at: Date.now() });
  return rows;
}

export function line(r: BoutiqueRow): string {
  const desc = (r.description ?? '').replace(/\s+/g, ' ').trim().slice(0, DESC_LEN);
  const tarz = [r.tarz1, r.tarz2].filter(Boolean).join(', ') || '-';
  const fiyat = (r.fiyatSegmenti && SEGMENT_METNI[r.fiyatSegmenti]) || '-';
  // Etiket yalnız varsa yazılır; boş alan katalog satırını gereksiz şişirmesin.
  const etiket =
    (r.etiketler ?? []).length > 0 ? ` | etiket: ${(r.etiketler ?? []).join(', ')}` : '';
  return `${r.id} | ${r.name} | ${r.categoryNames} | tarz: ${tarz} | fiyat: ${fiyat}${etiket} | ${desc}`;
}

// Sorguya göre en alakalı adayları seçip kompakt katalog metni üretir.
// Anahtar kelime eşleşmesi (isim>kategori>açıklama ağırlıklı) ile skorlar; eşleşme yoksa
// (selamlama/muğlak mesaj) popüler (sortOrder) ilk N'e düşer. Böylece Gemini'ye 702 yerine
// odaklı bir aday listesi gider → daha alakalı ve daha az tekrarlı öneri.
/**
 * Adayları EN ALAKALIDAN başlayarak sıralar ve ilk N'i döndürür.
 *
 * Ayrı bir fonksiyon: hem Gemini'ye giden katalog hem de yapay zekâ cevap veremediğinde
 * kullanıcıya gösterilen yedek öneriler bu sıraya güveniyor, o yüzden test edilebilir olmalı.
 * Hiçbir sinyal yoksa (selamlama gibi) popülerlik sırası korunur.
 */
export function adaylariSec(pool: BoutiqueRow[], kws: string[], intent: Intent): BoutiqueRow[] {
  const sinyalVar =
    kws.length > 0 ||
    intent.tarzlar.size > 0 ||
    intent.segmentler.size > 0 ||
    intent.kategoriler.size > 0 ||
    Boolean(intent.profilTarzlar) ||
    Boolean(intent.profilSegmentler) ||
    Boolean(intent.profilIpuclari);

  if (!sinyalVar) return pool.slice(0, MAX_CANDIDATES);

  // NEDEN (4 Eki): "çanta" sorusunda listenin kalanı başka butiklerle (ör. fiyatı tutan
  // giyim butikleri) dolduruluyordu ve Gemini bazen onları öneriyordu. Kullanıcı ürünü
  // açıkça söylediyse ve o kategoride yeterli butik varsa yalnız onlar aday olur.
  const acik = [...(intent.acikKategoriler ?? [])];
  if (acik.length > 0) {
    const kategoride = pool.filter((r) => {
      const cats = (r.categoryNames ?? '').toLocaleLowerCase('tr');
      return acik.some((k) => cats.includes(k));
    });
    if (kategoride.length >= MIN_KATEGORI_ADAYI) pool = kategoride;
  }

  const scored = pool.map((r) => ({ r, score: scoreRow(r, kws, intent) }));
  const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  // Eşleşenler başa; az eşleşme varsa (ör. "bana yazlık bir şeyler öner" yalnız 1 butiğin
  // açıklamasında geçiyordu) liste popüler butiklerle tamamlanır, yapay zekâ yine seçebilsin.
  const eslesen = matched.map((s) => s.r);
  const eslesenIdler = new Set(eslesen.map((r) => r.id));
  return [...eslesen, ...pool.filter((r) => !eslesenIdler.has(r.id))].slice(0, MAX_CANDIDATES);
}

/** Kullanıcı profili en çok bu kadar butiği öne alır (sahip kuralı, 22 Eki). */
export const PROFIL_ONCELIK_ADEDI = 2;

const niyet = (query: string | undefined): Intent =>
  query ? detectIntent(query) : { ...BOS_INTENT };

/**
 * Kullanıcı profiliyle (PROFIL_VITRIN_ENABLED) aday seçimi. Profil öneri sayısını ASLA
 * azaltmaz (sahip kuralı, 22 Eki): profilin öne çıkardığı en çok 2 butik başa gelir —
 * mesajda kategori varsa yalnız o kategoriden —, ardından liste profil öncesi sırayla
 * (taban: bugünkü tarz testi bilgisi ya da hiçbiri) aynen devam eder. Böylece istenen
 * kategoriden butikler profil yüzünden listeden düşmez; sayı tabandan az olamaz.
 */
export function profilliAdaylariSec(
  pool: BoutiqueRow[],
  kws: string[],
  query: string | undefined,
  profil: TarzProfili,
  taban?: TarzProfili,
): BoutiqueRow[] {
  const tabanListe = adaylariSec(pool, kws, profiliUygula(niyet(query), taban));
  const profilNiyeti = profiliUygula(niyet(query), profil);
  const yalin = niyet(query);
  const acik = [...(yalin.acikKategoriler ?? [])];
  const kategoride = (r: BoutiqueRow) => {
    if (acik.length === 0) return true;
    const cats = (r.categoryNames ?? '').toLocaleLowerCase('tr');
    return acik.some((k) => cats.includes(k));
  };
  // "Profil sonucu": puanı yalnız profil sayesinde artan butikler, profil puanına göre.
  const one = adaylariSec(pool, kws, profilNiyeti)
    .filter((r) => kategoride(r) && scoreRow(r, kws, profilNiyeti) > scoreRow(r, kws, yalin))
    .slice(0, PROFIL_ONCELIK_ADEDI);
  const oneIdler = new Set(one.map((r) => r.id));
  // tabanListe en çok MAX_CANDIDATES; başa eklenenlerle kesilse de sayı tabandan az olmaz.
  return [...one, ...tabanListe.filter((r) => !oneIdler.has(r.id))].slice(0, MAX_CANDIDATES);
}

export async function getCatalog(
  market: string,
  query?: string,
  profil?: TarzProfili,
  /** Profil tablosu kullanılıyorsa: profil öncesi (bugünkü) seçim için tarz bilgisi. */
  kullaniciProfili?: { taban: TarzProfili | undefined },
): Promise<CatalogData> {
  const pool = await getPool(market);
  const kws = query
    ? Array.from(new Set([...keywords(query), ...mevsimGenislet(query).kelimeler]))
    : [];

  const chosen =
    profil && kullaniciProfili
      ? profilliAdaylariSec(pool, kws, query, profil, kullaniciProfili.taban)
      : adaylariSec(pool, kws, profiliUygula(niyet(query), profil));

  const text = chosen.map(line).join('\n');
  const siraliIdler = chosen.map((r) => r.id);
  return { text, ids: new Set(siraliIdler), siraliIdler };
}

// Öneri en az bu kadar butik olsun (sahip isteği, 18 Eki: 3 öneri az geliyordu).
export const MIN_ONERI = 5;
export const MAX_ONERI = 6;

/**
 * Yapay zekânın seçtiği butikler MIN_ONERI'nin altında kalırsa liste ön elemenin
 * sıralı adaylarıyla (soruya en alakalıdan başlayarak) tamamlanır.
 */
export function enAzTamamla(secilen: string[], siraliIdler: string[]): string[] {
  if (secilen.length >= MIN_ONERI) return secilen.slice(0, MAX_ONERI);
  const var_ = new Set(secilen);
  const ek = siraliIdler.filter((id) => !var_.has(id)).slice(0, MIN_ONERI - secilen.length);
  return [...secilen, ...ek];
}

// Sahibin öne çıkardığı butik (18 Eki: Breeze ile ortak çalışma). Soru çocuk/bebek ile
// ilgiliyse ya da önerilerden biri onunla aynı kategorideyse listenin EN BAŞINA konur.
// Kaldırmak için boş bırakın: ''.
export const ONE_CIKAN_BUTIK = 'Breeze';
const ONE_CIKAN_KELIMELER = ['çocuk', 'bebek', 'kids', 'baby', 'uyku tulum', 'zıbın'];

function kategoriListesi(r: BoutiqueRow): string[] {
  return (r.categoryNames ?? '')
    .split(',')
    .map((k) => k.trim().toLocaleLowerCase('tr'))
    .filter((k) => k && k !== '-');
}

export function oneCikaniBasaAl(
  secilen: string[],
  pool: BoutiqueRow[],
  soru: string,
  ad: string = ONE_CIKAN_BUTIK,
): string[] {
  if (!ad) return secilen;
  const hedef = ad.toLocaleLowerCase('tr');
  const one = pool.find((r) => r.name.trim().toLocaleLowerCase('tr') === hedef);
  if (!one) return secilen;
  const kategoriler = new Set(kategoriListesi(one));
  const byId = new Map(pool.map((r) => [r.id, r]));
  const s = soru.toLocaleLowerCase('tr');
  const ilgili =
    secilen.includes(one.id) ||
    ONE_CIKAN_KELIMELER.some((k) => s.includes(k)) ||
    secilen.some((id) => {
      const r = byId.get(id);
      return r ? kategoriListesi(r).some((k) => kategoriler.has(k)) : false;
    });
  if (!ilgili) return secilen;
  return [one.id, ...secilen.filter((id) => id !== one.id)];
}
