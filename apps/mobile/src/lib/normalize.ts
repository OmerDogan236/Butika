// Türkçe duyarlı arama eşleştirme. JS toLowerCase() Türkçe locale uygulamaz,
// o yüzden İ/I dönüşümünü lowercase'den ÖNCE yapıp diğer harfleri elle katlıyoruz.
// (apps/api/src/routes/admin/categories.ts içindeki slugify ile aynı mantık,
// ama boşlukları koruyoruz çünkü slug değil arama metni üretiyoruz.)
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

// Sorgu (Türkçe normalize edilmiş) metnin içinde geçiyor mu? Boş sorgu → true.
export function includesQuery(haystack: string, q: string): boolean {
  const needle = normalizeTr(q);
  if (!needle) return true;
  return normalizeTr(haystack).includes(needle);
}
