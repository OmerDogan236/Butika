// Butikleri fiyat segmentine göre sıralar.
//
// Neden veritabanında değil burada: kategori başına en fazla ~255 satır var,
// SQL'de CASE yazmak yerine saf bir fonksiyon kullanmak testlenebilir oluyor.
//
// KIRMIZI ÇİZGİ: 'onerilen' seçildiğinde dizi HİÇ dokunulmadan döner —
// yayındaki eski uygulama sürümleri sıralama parametresi göndermiyor ve
// gördükleri liste değişmemeli.

export type Siralama = 'onerilen' | 'uygun_once' | 'luks_once' | 'kisisel' | 'alfabetik';
export type FiyatSiralama = Siralama;

export interface SiralanabilirButik {
  fiyatSegmenti: string | null;
  // Drizzle numeric sütunları METİN olarak döndürür ('2450.00').
  temsiliFiyatTl: string | null;
}

// Ucuzdan pahalıya segment sırası.
const SEGMENT_SIRASI: Record<string, number> = {
  uygun: 0,
  orta: 1,
  yuksek: 2,
  luks: 3,
};

const GECERLI: ReadonlySet<string> = new Set(['uygun_once', 'luks_once', 'kisisel', 'alfabetik']);
export function gecerliSiralama(deger: string | undefined): Siralama {
  return deger && GECERLI.has(deger) ? (deger as Siralama) : 'onerilen';
}

export function alfabetikSirala<T extends { name: string }>(satirlar: T[]): T[] {
  return [...satirlar].sort((a, b) => a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' }));
}

export function fiyataGoreSirala<T extends SiralanabilirButik>(
  satirlar: T[],
  siralama: FiyatSiralama,
): T[] {
  if (siralama !== 'uygun_once' && siralama !== 'luks_once') return satirlar;

  const yon = siralama === 'luks_once' ? -1 : 1;

  // Segmentli ve segmentsiz iki gruba ayır. Segmentsizler hiç sıralanmaz;
  // girdideki sıralarıyla sona eklenir — 'luks_once'da bile öne çıkmazlar.
  const segmentli: T[] = [];
  const segmentsiz: T[] = [];
  for (const satir of satirlar) {
    const sira = satir.fiyatSegmenti ? SEGMENT_SIRASI[satir.fiyatSegmenti] : undefined;
    (sira === undefined ? segmentsiz : segmentli).push(satir);
  }

  // Array.prototype.sort ES2019'dan beri kararlı (stable): eşit değerli
  // butikler girdideki sıralarını korur.
  const sirali = [...segmentli].sort((a, b) => {
    const segmentFarki =
      // biome-ignore lint/style/noNonNullAssertion: segmentli dizisine yalnız tanınan segmentler girdi
      (SEGMENT_SIRASI[a.fiyatSegmenti!] as number) -
      // biome-ignore lint/style/noNonNullAssertion: aynı gerekçe
      (SEGMENT_SIRASI[b.fiyatSegmenti!] as number);
    if (segmentFarki !== 0) return segmentFarki * yon;

    // Aynı segment içinde temsili fiyata göre. Fiyatı olmayan segmentin
    // sonuna düşer (yönden bağımsız).
    const af = a.temsiliFiyatTl === null ? null : Number(a.temsiliFiyatTl);
    const bf = b.temsiliFiyatTl === null ? null : Number(b.temsiliFiyatTl);
    if (af === null && bf === null) return 0;
    if (af === null) return 1;
    if (bf === null) return -1;
    return (af - bf) * yon;
  });

  return [...sirali, ...segmentsiz];
}
