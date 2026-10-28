// panco.com.tr/beyaz-kisa-kollu-t-shirt-2501bk05001/ sayfasının 2026-09-24T11:31Z'de
// kaydedilmiş kopyasından alınan GERÇEK Akinon kaydı. Kaynak dosyanın SHA256'sı:
// ef93fdd57d994b3534086a01cb959f809d59616f46f812b9c4702f4fa744685f
// (claude-yamalar/2026-09-24-okunamayan-urunler/canli-panco/01-ef93fdd57d99.html, 379.881 bayt)
// Ham sayfa 380 KB olduğu için yalnız okuyucunun baktığı alanlar taşındı; değerler
// sayfadaki hâlleriyle aynıdır — koşullu sepet teklifi (Sepetinde %23 İndirim,
// 612,15 TL) DAHİL. Görünür fiyat sayfada iki data-testid="price" elemanında
// 795,00 TL olarak yazıyor.
export const pancoUrl = 'https://www.panco.com.tr/beyaz-kisa-kollu-t-shirt-2501bk05001/';

export const pancoKayit = {
  "pk": 219480,
  "name": "Unisex Çocuk Kısa Kollu Bisiklet Yaka Beyaz Tişört",
  "sku": "2501BK05001009152",
  "base_code": "2501BK05001",
  "price": "795",
  "retail_price": "795",
  "currency_type": "try",
  "absolute_url": "/beyaz-kisa-kollu-t-shirt-2501bk05001/",
  "in_stock": true,
  "stock": 1,
  "is_ready_to_basket": false,
  "product_type": "0",
  "price_type": "default",
  "form_schema": null,
  "data_source": null,
  "is_listable": true,
  "listing_code": "Beyaz",
  "unit_type": "qty",
  "tax_rate": "10.00",
  "basket_offers": [
    {
      "pk": 10307,
      "label": "Sepetinde %23 İndirim",
      "listing_kwargs": {
        "quantity": 1,
        "discounted_total_price": 612.15,
        "discount": 182.85,
        "price": "795",
        "retail_price": "795"
      },
      "kwargs": {
        "show_benefit_products": false
      },
      "client_types": [],
      "data_source": null
    }
  ],
  "data_source_offers": []
} as const;

export const pancoAd = 'Unisex Çocuk Kısa Kollu Bisiklet Yaka Beyaz Tişört';

export type AkinonSayfaSecenekleri = {
  url?: string;
  kayitlar?: unknown[];
  /** Ana ürün bölgesindeki fiyat gösterimleri; ilkine tema kendi detay etiketini verir. */
  gorunur?: string[];
  /** İlk gösterimde detail_page_price_label sınıfı bulunsun mu. */
  detayEtiketi?: boolean;
  /** Ana ürün bölgesinin dışında, öneri şeridinde gösterilen fiyatlar. */
  oneri?: string[];
  /** <template> gövdesinde duran, sayfada görünmeyen fiyatlar. */
  sablon?: string[];
  /** data-testid="product-name" metinleri; boş dizi hiç ad yazılmaması demek. */
  urunAdlari?: string[];
  /** Ana ürün bölgesinin içinde, bir bağlantının gövdesindeki fiyat gösterimi. */
  baglanti?: { href: string; fiyat: string };
  /** Eski Akinon temasının `var rawProduct = '...'` kimliği de sayfada olsun mu. */
  eskiRawProduct?: boolean;
  canonical?: string | null;
  sarmala?: (payload: string) => string;
  ekScript?: string;
};

/**
 * Gerçek sayfanın okuyucunun baktığı bölge yapısı: canonical, push yükü, ürün adı
 * elemanları ve ana ürün fiyat gösterimleri. Gerçek sayfada iki data-testid="price"
 * var — biri temanın detay etiketli fiyatı (detail_page_price_label__…), biri ürün
 * adının yanındaki sabit şerit — ve iki data-testid="product-name" elemanı aynı adı
 * yazıyor. Öneri şeridi ve <template> gövdeleri ayrı tutulur.
 */
export function akinonSayfa(secenek: AkinonSayfaSecenekleri = {}): string {
  const { url = pancoUrl, kayitlar = [pancoKayit], gorunur = ['795,00 TL', '795,00 TL'],
    detayEtiketi = true, oneri = [], sablon = [], urunAdlari = [pancoAd, pancoAd], canonical = url } = secenek;
  const payload = `2d:["$","div",null,{"children":${JSON.stringify(kayitlar)}}]\n`;
  const script = secenek.sarmala ? secenek.sarmala(payload)
    : `<script>self.__next_f.push(${JSON.stringify([1, payload])})</script>`;
  const ana = gorunur.map((text, i) => i === 0 && detayEtiketi
    ? `<span class="text-2xl detail_page_price_label__IDvcK" data-testid="price">${text}</span>`
    : `<span class="text-base font-medium text-black-900" data-testid="price">${text}</span>`).join('');
  const eski = secenek.eskiRawProduct
    ? `<script>var rawProduct = '${JSON.stringify({ pk: pancoKayit.pk, sku: pancoKayit.sku,
        absolute_url: pancoKayit.absolute_url, price: pancoKayit.price,
        currency_type: pancoKayit.currency_type }).replace(/'/g, "\'")}';</script>` : '';
  const bagli = secenek.baglanti
    ? `<a href="${secenek.baglanti.href}"><span data-testid="price">${secenek.baglanti.fiyat}</span></a>` : '';
  const adlar = urunAdlari.map(ad => `<h1 class="detail_page_product_title__Vo3Bz" data-testid="product-name">${ad}</h1>`).join('');
  const onerilen = oneri.length
    ? `<aside aria-label="Önerilen ürünler">${oneri.map(text =>
      `<a href="/baska-urun/"><span data-testid="price">${text}</span></a>`).join('')}</aside>` : '';
  const sablonlu = sablon.length
    ? `<template>${sablon.map(text => `<span data-testid="price">${text}</span>`).join('')}</template>` : '';
  return `<html><head>${canonical ? `<link rel="canonical" href="${canonical}"/>` : ''}</head>` +
    `<body><div class="detail_page_main">${adlar}${ana}${bagli}</div>` +
    `${onerilen}${sablonlu}${eski}${secenek.ekScript ?? ''}${script}</body></html>`;
}
