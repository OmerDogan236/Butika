// Türkçe duyarlı arama eşleştirme (admin tarafı). İ/I dönüşümünü lowercase'den
// ÖNCE yapıp diğer harfleri elle katlıyoruz.
export function normalizeTr(input: string): string {
  return input
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}
