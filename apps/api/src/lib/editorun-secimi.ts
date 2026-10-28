import { type KisiselGirdi, kisiselSirala } from './kisisel-siralama';

// Vitrinin üstündeki "Editörün Seçimi" şeridinin sırası.
// Önce admin'in elle verdiği sıra (boşlar sona, aralarında ada göre); kullanıcının
// kişisel girdisi varsa kişisel uyum öne geçer, eşit puanda elle sıra korunur.

interface EditorSatiri {
  name: string;
  editorSirasi: number | null;
  tarz1: string | null;
  tarz2: string | null;
  fiyatSegmenti: string | null;
  hedefYaslar: string[] | null;
}

export function editorSirasinaGore<T extends Pick<EditorSatiri, 'name' | 'editorSirasi'>>(
  satirlar: T[],
): T[] {
  return [...satirlar].sort((a, b) => {
    if (a.editorSirasi !== b.editorSirasi) {
      if (a.editorSirasi === null) return 1;
      if (b.editorSirasi === null) return -1;
      return a.editorSirasi - b.editorSirasi;
    }
    return a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' });
  });
}

/** girdi yoksa (kişisel sıralama okunamadı) yalnız elle sıra. */
export function editorunSeciminiSirala<T extends EditorSatiri>(
  satirlar: T[],
  girdi: KisiselGirdi | null,
): T[] {
  const elle = editorSirasinaGore(satirlar);
  // kisiselSirala eşit puanda girdi sırasını korur: test/favori yoksa sıra hiç değişmez.
  return girdi ? kisiselSirala(elle, girdi) : elle;
}
