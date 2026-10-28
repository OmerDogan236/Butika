// apps/api/src/lib/kayit/sayfa-turu.ts
// Kaydedilen adres bir ürün sayfası mı? Yalnız adrese bakar, siteye istek atmaz.
// Emin olunamayan her adres 'urun' sayılır: yanlışlıkla ürünü dışarıda bırakmak,
// yanlışlıkla bir listeyi içeride tutmaktan daha pahalıdır (fiyat takibi durur).
// Tasarım: docs/superpowers/specs/2026-10-05-kullanici-profili-tasarim.md (bölüm 3)

export type SayfaTuru = 'urun' | 'urun_degil';

// Yalnız bilinen dil önekleri atılır; "/xs" gibi iki harfli bir ürün adresi dil sanılmasın.
const DIL_ONEKI = /^(tr|en|de|fr|ar|ru|es|it|nl|az)(-[a-z]{2})?$/i;
const GORSEL = /\.(jpe?g|png|webp|gif|avif|svg)$/i;
// Değeri 2 ve üstü olan sayfalama parametresi liste sayfasını gösterir (ör. ?page=2).
const SAYFALAMA = ['page', 'sayfa'];
// Yolun İLK parçası bunlardan biriyse ve en çok bir parça daha varsa sayfa listedir
// (/collections/yaz, /kategori/elbise). Daha derin adres ürün olabilir: /kategori/elbise/kirmizi-elbise-123
const LISTE_KOKLERI = new Set([
  'collections', 'collection', 'koleksiyon', 'koleksiyonlar', 'kategori', 'kategoriler',
  'category', 'categories', 'pages', 'blogs', 'blog', 'cdn',
]);
// Yolun SON parçası bunlardan biriyse sayfa ürün değildir (/yeni-gelenler, /tr/login).
const URUN_OLMAYAN_SON = new Set([
  'yeni-gelenler', 'new-arrivals', 'new-in', 'sale', 'indirim',
  'login', 'giris', 'giris-yap', 'account', 'hesabim', 'hesap', 'uye-girisi', 'register',
  'cart', 'sepet', 'sepetim', 'checkout', 'search', 'arama',
  'hakkimizda', 'iletisim', 'about', 'about-us', 'contact',
]);
// Bunlardan birinin ARDINDAN bir parça geliyorsa adres kesin üründür (Shopify: /collections/x/products/y).
const URUN_PARCALARI = new Set(['products', 'product', 'urun', 'urunler', 'p']);

export function sayfaTuru(url: string): SayfaTuru {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'urun_degil';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'urun_degil';

  const parcalar = u.pathname.split('/').filter(Boolean).map((p) => p.toLowerCase());
  if (parcalar[0] && DIL_ONEKI.test(parcalar[0])) parcalar.shift();
  if (parcalar.length === 0) return 'urun_degil';

  const son = parcalar[parcalar.length - 1] ?? '';
  if (GORSEL.test(son)) return 'urun_degil';

  const urunParcasi = parcalar.findIndex((p) => URUN_PARCALARI.has(p));
  if (urunParcasi !== -1 && urunParcasi < parcalar.length - 1) return 'urun';
  // Yalnız "/products" ya da "/urun": ürün değil, ürün listesi.
  if (URUN_PARCALARI.has(son)) return 'urun_degil';

  if (URUN_OLMAYAN_SON.has(son)) return 'urun_degil';
  if (LISTE_KOKLERI.has(parcalar[0] ?? '') && parcalar.length <= 2) return 'urun_degil';
  if (SAYFALAMA.some((k) => Number(u.searchParams.get(k)) >= 2)) return 'urun_degil';
  return 'urun';
}
