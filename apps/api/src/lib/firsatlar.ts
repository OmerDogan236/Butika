// Fırsat sekmesinin ("Hangi butiklerde indirim var?") sırası.
// Admin'in elle verdiği sıra küçükten büyüğe; boşlar sona, aralarında ada göre.
// Editörün Seçimi'nden farkı: kişisel uyum sırayı değiştirmez — indirim listesi herkese aynı.

export function firsatSirasinaGore<T extends { name: string; firsatSirasi: number | null }>(
  satirlar: T[],
): T[] {
  return [...satirlar].sort((a, b) => {
    if (a.firsatSirasi !== b.firsatSirasi) {
      if (a.firsatSirasi === null) return 1;
      if (b.firsatSirasi === null) return -1;
      return a.firsatSirasi - b.firsatSirasi;
    }
    return a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' });
  });
}
