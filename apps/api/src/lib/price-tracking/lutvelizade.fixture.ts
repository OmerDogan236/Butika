// A Lutvelizade product page as the store serves it, cut down to what the size
// reader and the app's size picker use. Structure, identities and amounts are the
// saved 2026-09-24 page of asimetrik-kesim-siyah-kadin-terlik-modelleri-p: 38 in
// stock, 36, 37, 39 and 40 sold out, 599,96 TL. Every other state built here is
// made up for a test. In particular a size moving between the two lists with the
// same GUID is an assumption the tests exercise, not something the store was seen
// to do.
export const LUTVELIZADE_URL = 'https://www.lutvelizade.com.tr/asimetrik-kesim-siyah-kadin-terlik-modelleri-p';
export const PPV = 'f4066721-6bd3-46d4-99ea-623e9b14c071';
export const CODE = '26IW011050008-001';
export const SIZE = {
  36: '84f5b75e-e0e9-4a82-8121-6acb19f1e98d',
  37: 'a78c3286-d95b-406f-bd24-c2e28e4dba32',
  38: 'd61cc2c5-a950-4cf1-9466-87d015fd2a7b',
  39: '24dfec7e-7ca4-4004-ba17-bdca0f95c579',
  40: '97a8511c-30f9-43c9-a6de-a8f1093e3843',
} as const;

export type Size = { label: string; id?: string | null; disabled?: boolean };

// The saved state: only 38 can be chosen; the others are in the dialog.
export const SAVED_SIZES: Size[] = [
  { label: '36', disabled: true }, { label: '37', disabled: true }, { label: '38', id: SIZE[38] },
  { label: '39', disabled: true }, { label: '40', disabled: true },
];
export const SAVED_DIALOG = [
  { label: '36', id: SIZE[36] }, { label: '37', id: SIZE[37] }, { label: '39', id: SIZE[39] }, { label: '40', id: SIZE[40] },
];

export const selectedUrl = (id: string, ppv: string = PPV, page: string = LUTVELIZADE_URL) =>
  `${page}?_butika_variant=${encodeURIComponent(`lutvelizade:${ppv}:${id}`)}`;

export type PageOptions = {
  sizes?: Size[];
  // null: the page has no dialog, as when every size can be chosen.
  dialog?: { label: string; id: string; disabled?: boolean }[] | null;
  ppv?: string;
  code?: string;
  jsonLd?: Record<string, unknown> | string;
  prices?: string;
  // Anything else on the page, after the product block.
  extra?: string;
  // Inside the product block, after the size list.
  inBlock?: string;
};

export const productJsonLd = (overrides: Record<string, unknown> = {}, offer: Record<string, unknown> = {}) => ({
  '@context': 'https://schema.org', '@type': 'Product', name: 'Asimetrik Kesim Siyah Kadın Terlik',
  brand: { '@type': 'Brand', name: 'Lutvelizade' }, mpn: CODE, sku: CODE,
  offers: { '@type': 'Offer', url: LUTVELIZADE_URL, itemCondition: 'https://schema.org/NewCondition', price: 599.96, priceCurrency: 'TRY',
    seller: { '@type': 'Organization', name: 'Lutvelizade' }, ...offer },
  ...overrides,
});

const sizeLink = (s: Size) => `<li><a href="javascript:;"${s.disabled ? ' class="disable"' : ''}${s.id ? ` data-id="${s.id}"` : ''} title="${s.disabled ? 'Stokta Yok' : s.label}">${s.label}</a></li>`;
const dialogLink = (s: { label: string; id: string; disabled?: boolean }) => `<li><a href="javascript:;"${s.disabled ? ' class="disable"' : ''} data-id="${s.id}">${s.label}</a></li>`;

export const dialogHtml = (sizes: { label: string; id: string; disabled?: boolean }[]) => `
<div class="modal" id="addStockNotificationModal" tabindex="-1" role="dialog" aria-hidden="true" data-backdrop="static"><div class="modal-dialog"><div class="modal-content">
<form action="/stok-bildirimi-ekle" method="post"><div class="modal-body"><p>Bildirim almak istediğiniz bedeni seçiniz.</p>
<div class="variations"><div class="variation size"><strong class="title">Beden</strong><ul>${sizes.map(dialogLink).join('')}</ul></div>
<input type="hidden" id="ProductPriorityVariationVariationId" name="ProductPriorityVariationVariationId" /></div>
<div class="modal-footer"><button type="button" class="btn btn-dark" id="save-stock-notification">Kaydet</button></div></form></div></div></div>`;

// A card of the "En Çok Satanlar" slider, as the saved page has it.
export const RECOMMENDED_CARD = `<section class="newest-products mb-5" data-list-category="Terlik"><h3>En Çok Satanlar</h3><div class="slider">
<div class="card" data-ga4-id="26IW011050009-5021"><a title="Minimal Çapraz Bant Koyu Bej Süet Kadın Terlik" href="/minimal-capraz-bant-koyu-bej-suet-kadin-terlik-modelleri-p">
<div class="card-body"><h5 class="card-title">Minimal Çapraz Bant Koyu Bej Süet Kadın Terlik</h5><div class="price"><div class="row">
<div class="col-6"><span class="discounted">599,96 TL</span></div><div class="col-6"><span class="invalid">1499,90 TL</span></div></div></div></div></a></div></div></section>`;

export function lutvelizadePage(o: PageOptions = {}): string {
  const sizes = o.sizes ?? SAVED_SIZES;
  const dialog = o.dialog === undefined ? SAVED_DIALOG : o.dialog;
  const ppv = o.ppv ?? PPV;
  const jsonLd = typeof o.jsonLd === 'string' ? o.jsonLd : JSON.stringify(o.jsonLd ?? productJsonLd());
  return `<!DOCTYPE html><html lang="tr" class="c-product a-detail"><head><meta charset="utf-8" /><title>Asimetrik Kesim Siyah Kadın Terlik</title></head>
<body class=""><section class="product-detail"><div class="row"><div class="col-12 col-lg-5">
<div class="details"><h1>Asimetrik Kesim Siyah Kad&#x131;n Terlik</h1>
<input type="hidden" id="ProductName" value="Asimetrik Kesim Siyah Kad&#x131;n Terlik" />
<p class="product-code">ÜRÜN KODU: <span>${o.code ?? CODE}</span></p><p class="product-no">ÜRÜN NO: <span>4768</span></p>
${o.prices ?? '<span class="price invalid">1499,90 TL</span><span class="price discounted">599,96 TL</span><span class="discount-rate">(- %60)</span>'}
<div class="variations"><div class="variation color"><strong class="title">RENK: </strong><span class="d-inline">Siyah</span><ul>
<li><a href="asimetrik-kesim-caramel-kadin-terlik-modelleri" title="" class=" "></a></li><li><a href="asimetrik-kesim-siyah-kadin-terlik-modelleri" title="" class=" active"></a></li></ul></div>
<div class="variation size"><strong class="title">BEDEN SEÇİNİZ</strong><ul>${sizes.map(sizeLink).join('')}</ul></div></div>${o.inBlock ?? ''}
<div class="row mt-4"><div class="col-12 d-flex"><a href="javascript:;" class="btn btn-dark flex-grow-1" id="add-basket" title="Sepete Ekle">SEPETE EKLE</a>
<a id="favorite" data-ppv-id="${ppv}" class="favorite-btn" title="Favorilere Ekle" href="/favorilere-ekle/${ppv}"></a></div></div>
${dialog?.length ? '<div class="row mt-4"><div class="col-12"><a href="javascript:;" class="btn btn-outline-danger w-100" id="add-stock-notification" data-toggle="modal" data-target="#addStockNotificationModal" title="Gelince Haber Ver">GELİNCE HABER VER</a></div></div>' : ''}
</div></div></div></section>
${o.extra ?? RECOMMENDED_CARD}
${dialog ? dialogHtml(dialog) : ''}
<script type="application/ld&#x2B;json">${jsonLd}</script>
</body></html>`;
}
