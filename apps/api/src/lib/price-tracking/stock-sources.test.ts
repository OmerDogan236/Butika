import { expect, test } from 'bun:test';
import { structuredAvailability } from './availability';
import { extractAssignedJsonObject } from './assigned-json';

const url = 'https://store.test/dress-72';
const variant = (id: number, stock: number) => ({ id, urunKartiId: 72, aktif: true, stokAdedi: stock,
  urunFiyatiOrjinal: 100, urunFiyatiOrjinalKDV: 10, paraBirimiKodu: 'TRY', hasPersonalization: false, urunKampanyaAktif: false });
const model = { productId: 72, productName: 'Dress', productActive: true, productIsAsorti: false,
  productPriceKDVIncluded: 110, productCurrency: 'TRY', mainVariantId: 1, totalStockAmount: 5,
  products: [variant(1, 2), variant(2, 3)], productVariantData: [{ urunKartID: 72, urunID: 1 }, { urunKartID: 72, urunID: 2 }],
};
const page = (m: unknown, canonical = url) => `<link href="${canonical}" rel="canonical"><script>var productDetailModel = ${JSON.stringify(m)};</script>`;
const stock = (html: string) => structuredAvailability(html, 11000, 'TRY', url);

test('Ticimax stock requires consistent price, complete variants and matching product', () => {
  expect(stock(page(model))).toBe('in_stock');
  expect(stock(page({ ...model, products: [variant(1, 0), variant(2, 0)], totalStockAmount: 0 }))).toBe('out_of_stock');
  expect(stock(page({ ...model, products: [variant(1, 0), variant(2, 3)], totalStockAmount: 3 }))).toBe('unknown');
});
test.each([
  ['missing variant', { ...model, products: [variant(1, 2)], totalStockAmount: 2 }],
  ['duplicate variant', { ...model, products: [variant(1, 2), variant(1, 3)] }],
  ['wrong product', { ...model, products: [{ ...variant(1, 2), urunKartiId: 99 }, variant(2, 3)] }],
  ['different price', { ...model, products: [variant(1, 2), { ...variant(2, 3), urunFiyatiOrjinal: 90 }] }],
  ['wrong currency', { ...model, productCurrency: 'USD' }],
  ['incomplete total', { ...model, totalStockAmount: 9 }],
  ['missing quantity', { ...model, products: [variant(1, 2), { ...variant(2, 3), stokAdedi: undefined }] }],
  ['personalization', { ...model, products: [variant(1, 2), { ...variant(2, 3), hasPersonalization: true }] }],
  ['minimum quantity', { ...model, products: [variant(1, 2), { ...variant(2, 3), uyeAlimMin: 4 }] }],
] as const)('Ticimax rejects %s', (_label, m) => { expect(stock(page(m))).toBe('unknown'); });
test('Ticimax simple products require no omitted variant choices', () => {
  expect(stock(page({ ...model, products: undefined, product: variant(1, 5), productVariantData: [] }))).toBe('in_stock');
  expect(stock(page({ ...model, products: undefined, product: variant(1, 5) }))).toBe('unknown');
});
test('Ticimax cannot borrow canonical identity or a generic optimistic offer', () => {
  const optimistic = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', offers: { price: 110, priceCurrency: 'TRY', availability: 'InStock' } })}</script>`;
  expect(stock(page(model, 'https://store.test/other'))).toBe('unknown');
  expect(stock(page({ ...model, totalStockAmount: 8 }) + optimistic)).toBe('unknown');
});
test('assigned JSON handles braces in strings but never executes JavaScript', () => {
  expect(extractAssignedJsonObject('var productDetailModel = {"name":"{brace} \\"","id":1};', 'productDetailModel')).not.toBeNull();
  expect(extractAssignedJsonObject('var productDetailModel = JSON.parse("{}");', 'productDetailModel')).toBeNull();
  expect(extractAssignedJsonObject('var productDetailModel = {}; var productDetailModel = {};', 'productDetailModel')).toBeNull();
});

const offer = (availability = 'InStock', price = '110', offerUrl = url) => `<div itemprop='offers' itemscope itemtype='https://schema.org/Offer'>
  <meta content='${price}' itemprop='price'><meta itemprop='priceCurrency' content='TRY'>
  <link href='https://schema.org/${availability}' itemprop='availability'><span itemprop='url'>${offerUrl}</span></div>`;
const product = (content: string) => `<div itemscope itemtype='https://schema.org/Product'>${content}</div>`;
test('microdata associates price, currency, stock and text URL within the same offer', () => {
  expect(stock(product(offer()))).toBe('in_stock');
  expect(stock(product(offer('OutOfStock')))).toBe('out_of_stock');
  expect(stock(product(offer('BackOrder')))).toBe('unknown');
});
test('microdata never uses an unrelated recommendation or scope', () => {
  expect(stock(product('') + offer())).toBe('unknown');
  expect(stock(product(offer()) + product(offer()))).toBe('unknown');
  expect(stock(product(`<div itemscope itemtype='https://schema.org/Brand'>${offer()}</div>`))).toBe('unknown');
  expect(stock(product(offer('InStock', '110', 'https://store.test/other')))).toBe('unknown');
  expect(stock(product(offer('InStock', '110', '')))).toBe('unknown');
});
test('microdata rejects price and availability disagreements', () => {
  expect(stock(product(offer('InStock', '100')))).toBe('unknown');
  expect(stock(product(offer() + offer('OutOfStock')))).toBe('unknown');
  expect(stock(product(offer().replace("<meta itemprop='priceCurrency' content='TRY'>", '')))).toBe('unknown');
});
test('a script/template imitation of metadata is not stock evidence', () => {
  expect(stock(`<script>${product(offer())}</script>`)).toBe('unknown');
  expect(stock(`<!-- ${product(offer())} -->`)).toBe('unknown');
  expect(stock(`<template>${product(offer())}</template>`)).toBe('unknown');
});
