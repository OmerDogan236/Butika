import { expect, test } from 'bun:test';
import { readAkinonNextProduct } from './akinon-next-product';
import { akinonSayfa, pancoAd, pancoKayit, pancoUrl } from './akinon-next.fixture';

const oku = (html: string, url = pancoUrl, para = 'TRY') => readAkinonNextProduct(html, url, para);
const kayit = (degisiklik: Record<string, unknown>) => ({ ...pancoKayit, ...degisiklik });

test('the page Panço really served is read as a price, and only as a price', () => {
  // The saved record carries its conditional basket offer (612,15 TL) and
  // is_ready_to_basket: false next to in_stock: true and stock: 1.
  expect(pancoKayit.basket_offers).toHaveLength(1);
  expect(pancoKayit.is_ready_to_basket).toBe(false);
  expect(pancoKayit.in_stock).toBe(true);
  expect(oku(akinonSayfa()))
    .toEqual({ priceMinor: 79500, currency: 'TRY', availability: 'unknown', pk: 219480, sku: '2501BK05001009152' });
});

test('stock is never decided here, whatever the record claims', () => {
  for (const flags of [
    { in_stock: true, stock: 5, is_ready_to_basket: true },
    { in_stock: false, stock: 0, is_ready_to_basket: false },
    { in_stock: true, stock: 0, is_ready_to_basket: true },
  ]) expect(oku(akinonSayfa({ kayitlar: [kayit(flags)] }))?.availability).toBe('unknown');
});

test('the conditional basket price and the shipping threshold are never the answer', () => {
  // 612,15 is the discounted total of the offer and 750 is a free-shipping limit;
  // neither is this product's price, and neither may replace it.
  const sayfa = akinonSayfa();
  expect(oku(sayfa)?.priceMinor).toBe(79500);
  expect(JSON.stringify(pancoKayit.basket_offers)).toContain('612.15');
  // Only the offer's amount is on the page: there is no shelf price to stand on.
  const teklifTek = kayit({ price: '612.15', retail_price: '795' });
  expect(oku(akinonSayfa({ kayitlar: [teklifTek], gorunur: ['612,15 TL'] }))).toBeNull();
  // A shipping threshold shown as a price display refuses the page.
  expect(oku(akinonSayfa({ gorunur: ['795,00 TL', '750 TL'] }))).toBeNull();
});

test('a sibling colour of the same product card is never read for this address', () => {
  const kardes = kayit({ pk: 219511, sku: '2501BK05001037104', price: '695', retail_price: '695',
    absolute_url: '/krem-kisa-kollu-t-shirt-2501bk05001-1/' });
  // Only the sibling is streamed: this address has no record of its own.
  expect(oku(akinonSayfa({ kayitlar: [kardes] }))).toBeNull();
  // Both are streamed, as the real page does: the sibling's price is not taken.
  expect(oku(akinonSayfa({ kayitlar: [kardes, pancoKayit] }))?.priceMinor).toBe(79500);
});

test('two different records for this one address are a contradiction, not a choice', () => {
  const celisen = kayit({ price: '695', retail_price: '695' });
  expect(oku(akinonSayfa({ kayitlar: [pancoKayit, celisen] }))).toBeNull();
  const baskaKimlik = kayit({ pk: 219999, sku: 'BASKA-SKU' });
  expect(oku(akinonSayfa({ kayitlar: [pancoKayit, baskaKimlik] }))).toBeNull();
  // The theme repeating the very same object in two chunks is not a contradiction.
  expect(oku(akinonSayfa({ kayitlar: [pancoKayit, { ...pancoKayit }] }))?.priceMinor).toBe(79500);
});

test('leaner repeats of the same record are read, and the fullest one is the answer', () => {
  // The real page streams this product three times: once in full and twice as a
  // projection without basket_offers, data_source_offers, is_listable and
  // listing_code. Missing fields are not a contradiction; differing ones are.
  const { basket_offers, data_source_offers, is_listable, listing_code, ...sade } = pancoKayit;
  expect(Object.keys(sade)).toHaveLength(Object.keys(pancoKayit).length - 4);
  expect(oku(akinonSayfa({ kayitlar: [pancoKayit, sade, { ...sade }] }))?.priceMinor).toBe(79500);
  // Only the projection is streamed: is_listable is missing, so nothing is read.
  expect(oku(akinonSayfa({ kayitlar: [sade] }))).toBeNull();
  // A projection that disagrees on a field they share still refuses the page.
  expect(oku(akinonSayfa({ kayitlar: [pancoKayit, { ...sade, price: '695' }] }))).toBeNull();
  expect(oku(akinonSayfa({ kayitlar: [pancoKayit, { ...sade, sku: 'BASKA' }] }))).toBeNull();
});

test('only the main product region proves the price, never a template or a suggestion', () => {
  // A price that is only in a <template> body is not shown to anyone.
  expect(oku(akinonSayfa({ gorunur: [], sablon: ['795,00 TL'] }))).toBeNull();
  // A price that is only in the recommendation strip belongs to another product.
  expect(oku(akinonSayfa({ gorunur: [], oneri: ['795,00 TL'] }))).toBeNull();
  // Both together still leave the main region without a price of its own.
  expect(oku(akinonSayfa({ gorunur: [], oneri: ['795,00 TL'], sablon: ['795,00 TL'] }))).toBeNull();
  // The suggestion's own amount never overrides the main region either.
  expect(oku(akinonSayfa({ oneri: ['695,00 TL'], sablon: ['1,00 TL'] }))?.priceMinor).toBe(79500);
  // The theme's own detail price element has to be one of the amounts shown.
  expect(oku(akinonSayfa({ detayEtiketi: false }))).toBeNull();
  // The page has to name this product beside the price.
  expect(oku(akinonSayfa({ urunAdlari: [] }))).toBeNull();
  expect(oku(akinonSayfa({ urunAdlari: ['Başka Bir Ürün'] }))).toBeNull();
  expect(oku(akinonSayfa({ urunAdlari: [pancoAd, 'Başka Bir Ürün'] }))).toBeNull();
});

test('a lira display is never labelled as another currency', () => {
  // The visible amount is only ever parsed as lira, so the answer is only ever TRY.
  expect(oku(akinonSayfa({ kayitlar: [kayit({ currency_type: 'usd' })] }), pancoUrl, 'USD')).toBeNull();
  expect(oku(akinonSayfa(), pancoUrl, 'USD')).toBeNull();
  expect(oku(akinonSayfa({ kayitlar: [kayit({ currency_type: 'usd' })] }), pancoUrl, 'TRY')).toBeNull();
  expect(oku(akinonSayfa(), pancoUrl, 'try')?.priceMinor).toBe(79500);
});

test('an address this reader cannot stand behind is refused, not guessed at', () => {
  for (const url of [
    'https://www.panco.com.tr/%ZZ/',                       // percent-escape that cannot be decoded
    'https://www.panco.com.tr/beyaz-kisa-kollu-t-shirt-2501bk05001/?utm_source=x',
    'https://www.panco.com.tr/beyaz-kisa-kollu-t-shirt-2501bk05001/?renk=beyaz',
    'https://user:pass@www.panco.com.tr/beyaz-kisa-kollu-t-shirt-2501bk05001/',
    'https://www.panco.com.tr:8443/beyaz-kisa-kollu-t-shirt-2501bk05001/',
    'https://www.panco.com.tr/',
    'not a url',
  ]) expect({ url, sonuc: oku(akinonSayfa({ url }), url) }).toEqual({ url, sonuc: null });
  // An encoded separator is not the same address as a real one.
  const kacisli = 'https://www.panco.com.tr/beyaz-kisa-kollu-t-shirt%2F2501bk05001/';
  expect(oku(akinonSayfa({ url: kacisli }), kacisli)).toBeNull();
});

test('the amount the page shows has to be the amount the record claims', () => {
  expect(oku(akinonSayfa({ gorunur: ['695,00 TL', '695,00 TL'] }))).toBeNull();
  expect(oku(akinonSayfa({ gorunur: ['795,00 TL', '695,00 TL'] }))).toBeNull();
  expect(oku(akinonSayfa({ gorunur: [] }))).toBeNull();
  expect(oku(akinonSayfa({ gorunur: ['795,00'] }))).toBeNull();
  expect(oku(akinonSayfa({ gorunur: ['795,00 USD'] }))).toBeNull();
  expect(oku(akinonSayfa({ gorunur: ['₺795,00 TL'] }))).toBeNull();
  expect(oku(akinonSayfa({ gorunur: ['₺795,00'] }))?.priceMinor).toBe(79500);
});

test('price and retail_price must agree, and the currency must be the expected one', () => {
  expect(oku(akinonSayfa({ kayitlar: [kayit({ retail_price: '895' })] }))).toBeNull();
  expect(oku(akinonSayfa({ kayitlar: [kayit({ price: '0', retail_price: '0' })] }), pancoUrl)).toBeNull();
  expect(oku(akinonSayfa({ kayitlar: [kayit({ price: 795, retail_price: 795 })] }))).toBeNull();
  expect(oku(akinonSayfa(), pancoUrl, 'EUR')).toBeNull();
  expect(oku(akinonSayfa({ kayitlar: [kayit({ currency_type: 'eur' })] }))).toBeNull();
  // No conversion: an amount in another currency is refused, never recalculated.
  expect(oku(akinonSayfa({ kayitlar: [kayit({ currency_type: 'usd' })], gorunur: ['795,00 TL', '795,00 TL'] }))).toBeNull();
});

test('an uncertain or non-plain product record is refused', () => {
  for (const degisiklik of [
    { price_type: 'discounted' }, { is_listable: false }, { product_type: '1' },
    { data_source: { name: 'marketplace' } }, { form_schema: { fields: [] } },
    { pk: 0 }, { pk: '219480' }, { sku: '' },
  ]) expect(oku(akinonSayfa({ kayitlar: [kayit(degisiklik)] }))).toBeNull();
});

test('a chosen size keeps its own price: the product record does not stand in', () => {
  for (const suffix of ['?_butika_variant=akinon:1:2', '?variant=219480'])
    expect(oku(akinonSayfa({ url: `${pancoUrl}${suffix}` }), `${pancoUrl}${suffix}`)).toBeNull();
});

test('the page has to name itself as this product', () => {
  expect(oku(akinonSayfa({ canonical: null }))).toBeNull();
  expect(oku(akinonSayfa({ canonical: 'https://www.panco.com.tr/baska-urun/' }))).toBeNull();
  expect(oku(akinonSayfa({ canonical: 'https://baska-magaza.example/beyaz-kisa-kollu-t-shirt-2501bk05001/' }))).toBeNull();
  // Another store's page, even with Panço's own record inside it.
  expect(oku(akinonSayfa({ url: 'https://ornek-magaza.example/beyaz-kisa-kollu-t-shirt-2501bk05001/' }),
    'https://ornek-magaza.example/beyaz-kisa-kollu-t-shirt-2501bk05001/')).toBeNull();
  expect(oku(akinonSayfa(), pancoUrl.replace('https://', 'http://'))).toBeNull();
});

test('payloads that are not the observed shape are refused, never repaired', () => {
  const kayitlar = JSON.stringify([pancoKayit]);
  const bozuk: [string, (payload: string) => string][] = [
    ['truncated payload', () => `<script>self.__next_f.push([1,"2d:[\\"$\\",\\"div\\",null,{\\"children\\":[{\\"absolute_url\\":\\"/beyaz-kisa-kollu-t-shirt-2501bk05001/\\",\\"price\\":\\"795\\""])</script>`],
    ['not a push call', payload => `<script>window.data = ${JSON.stringify([1, payload])}</script>`],
    ['another push shape', payload => `<script>self.__next_f.push([2,${JSON.stringify(payload)}])</script>`],
    ['payload is not a string', () => `<script>self.__next_f.push([1,${kayitlar}])</script>`],
    ['two calls in one script', payload => `<script>self.__next_f.push(${JSON.stringify([1, payload])});self.__next_f.push([1,""])</script>`],
    ['a call that has to be executed', payload => `<script>self.__next_f.push(build(${JSON.stringify(payload)}))</script>`],
    ['inside a template', payload => `<template><script>self.__next_f.push(${JSON.stringify([1, payload])})</script></template>`],
    ['inside a comment', payload => `<!-- <script>self.__next_f.push(${JSON.stringify([1, payload])})</script> -->`],
    ['a module, not inline data', payload => `<script type="module">self.__next_f.push(${JSON.stringify([1, payload])})</script>`],
  ];
  for (const [reason, sarmala] of bozuk)
    expect({ reason, sonuc: oku(akinonSayfa({ sarmala })) }).toEqual({ reason, sonuc: null });
});

test('a script that only looks like the payload cannot answer for the page', () => {
  // A fake script written inside an attribute value or another element's text.
  const sahte = `<div data-note='<script>self.__next_f.push([1,"{\\"absolute_url\\":\\"/beyaz-kisa-kollu-t-shirt-2501bk05001/\\",\\"price\\":\\"1\\"}"])</script>'></div>`;
  expect(oku(akinonSayfa({ ekScript: sahte }))?.priceMinor).toBe(79500);
  // The same fake alone, with no real payload, reads nothing.
  expect(oku(`<html><head><link rel="canonical" href="${pancoUrl}"/></head><body>` +
    `<span data-testid="price">795,00 TL</span>${sahte}</body></html>`)).toBeNull();
});

test('a store outside the evidenced scope is not read at all', () => {
  const baska = 'https://www.baska-akinon.example/urun-1/';
  expect(oku(akinonSayfa({ url: baska, canonical: baska }), baska)).toBeNull();
});

test('a link inside the region only counts when it leads to this very product', () => {
  const yol = '/beyaz-kisa-kollu-t-shirt-2501bk05001/';
  // The theme's own link back to this product, on this origin: its price counts.
  expect(oku(akinonSayfa({ baglanti: { href: yol, fiyat: '795,00 TL' } }))?.priceMinor).toBe(79500);
  expect(oku(akinonSayfa({ baglanti: { href: yol, fiyat: '695,00 TL' } }))).toBeNull();
  // The same path somewhere else is not this product, so it is left out entirely:
  // with no other display in the region there is nothing to stand on.
  for (const href of [
    `https://baska-magaza.example${yol}`,
    `http://www.panco.com.tr${yol}`,
    `https://www.panco.com.tr:8443${yol}`,
    `https://user:pass@www.panco.com.tr${yol}`,
    `${yol}?renk=beyaz`,
  ]) expect({ href, sonuc: oku(akinonSayfa({ gorunur: [], baglanti: { href, fiyat: '795,00 TL' } })) })
    .toEqual({ href, sonuc: null });
});
