import type { DetayliTestCevaplari, DetayliUrun, Durum } from '@butika/types';

// Detaylı test cevaplarından kişiye özel kategori sırası. Hiçbir kategori çıkarılmaz:
// ilgilenilenler başa, ilgilenilmeyenler sona; diğerleri ve her grubun kendi içi admin sırası.
// Eşleştirme TR kategori slug'larıyla; başka pazarda eşleşen slug yoksa sıra değişmez.
// Tasarım: docs/superpowers/specs/2026-10-16-detayli-test-tasarim.md (§4)

export interface KategoriEgilimi {
  one: Set<string>;
  alta: Set<string>;
}

const URUN_KATEGORI: Record<DetayliUrun, string[]> = {
  giyim: ['gunlukgiyim'],
  abiye: ['abiye'],
  mayo: ['plaj'],
  ic_giyim: ['icgiyim'],
  ayakkabi: ['ayakkabi'],
  canta: ['canta'],
  taki: ['mucevher'],
  guzellik: ['guzellik', 'parfumkoku'],
  ev_giyimi: ['sikevgiyimi'],
};

// "İş" ve "özel gün"ün karşılığı olan kategori yok.
const DURUM_KATEGORI: Partial<Record<Durum, string[]>> = {
  gunluk: ['gunlukgiyim'],
  davet: ['abiye'],
  tatil: ['plaj'],
  spor: ['sporgiyim'],
};

const COCUK = 'kidscorner';
const BEBEK = 'organikbebekgiyim';

/** Slug karşılaştırma anahtarı: büyük/küçük harf, tire, alt çizgi ve boşluk fark etmez. */
export function slugAnahtari(s: string): string {
  return s.toLocaleLowerCase('tr').replace(/[-_\s]/g, '');
}

export function kategoriEgilimi(c: DetayliTestCevaplari): KategoriEgilimi {
  const one = new Set<string>();
  const alta = new Set<string>();

  if (c.tesettur === 'evet') one.add('tesettur');
  else if (c.tesettur === 'hayir') alta.add('tesettur');

  if (c.hamile === 'evet') one.add('hamile-giyim');
  else if (c.hamile === 'hayir') alta.add('hamile-giyim');

  if (c.cocuk?.var) one.add(COCUK);
  if (c.cocuk?.var && c.cocuk.yaslar.includes('0_2')) one.add(BEBEK);
  if (c.cocuk?.var === false) {
    alta.add(COCUK);
    alta.add(BEBEK);
  }

  if (c.buyukBeden) one.add('buyukbeden');
  for (const u of c.urunler) for (const s of URUN_KATEGORI[u]) one.add(s);
  for (const d of c.durumlar) for (const s of DURUM_KATEGORI[d] ?? []) one.add(s);

  // Kişinin açık ilgisi kazanır.
  for (const s of one) alta.delete(s);
  return { one, alta };
}

export function kategoriSirala<T>(
  kategoriler: T[],
  egilim: KategoriEgilimi,
  anahtar: (k: T) => string,
): T[] {
  const bas = kategoriler.filter((k) => egilim.one.has(anahtar(k)));
  const son = kategoriler.filter((k) => egilim.alta.has(anahtar(k)));
  const orta = kategoriler.filter(
    (k) => !egilim.one.has(anahtar(k)) && !egilim.alta.has(anahtar(k)),
  );
  return [...bas, ...orta, ...son];
}
