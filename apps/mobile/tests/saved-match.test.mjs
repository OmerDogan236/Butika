import { expect, test } from 'bun:test';
import { findSavedVariant, variantUrl } from '../src/lib/saved-variant.ts';

// Which saved record the store screen shows for the page it is on. Addresses are made up on
// .test hosts; the identities have the shapes the app saves (variantUrl writes them with %3A).
const P = '11111111-2222-4333-8444-555555555555';
const S36 = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const S38 = '66666666-7777-4888-9999-bbbbbbbbbbbb';
const LV = 'https://magaza.test/terlik-p';
const lv36 = `${LV}?_butika_variant=${encodeURIComponent(`lutvelizade:${P}:${S36}`)}`;
const lv38 = `${LV}?_butika_variant=${encodeURIComponent(`lutvelizade:${P}:${S38}`)}`;
const TX = 'https://ticimax.test/bluz-435';
const JK = 'https://jk.test/en/bluz_5ww0/haki/61';
const colons = url => url.replaceAll('%3A', ':');
const find = (rows, url) => findSavedVariant(rows, url)?.id;

test('a saved size is found however its address is spelled, and only that size', () => {
  const saved = [
    { id: 'lv36', url: lv36 }, { id: 'lv38', url: lv38 },
    { id: 'tx1949', url: `${TX}?_butika_variant=ticimax%3A435%3A1949` },
    { id: 'jk71', url: `${JK}?_butika_variant=jimmykey%3A28615%3A61%3A71` },
  ];
  // The spelling a list, a notification or a push used to open: ':' for %3A.
  expect(find(saved, colons(lv36))).toBe('lv36');
  expect(find(saved, colons(lv38))).toBe('lv38');
  expect(find(saved, `${TX}?_butika_variant=ticimax:435:1949`)).toBe('tx1949');
  expect(find(saved, `${JK}?_butika_variant=jimmykey:28615:61:71`)).toBe('jk71');
  expect(find(saved, `${TX}?_butika_variant=ticimax%3a435%3a1949`)).toBe('tx1949');
  // Another size, product or colour of the same page is never shown as saved.
  expect(find(saved, `${TX}?_butika_variant=ticimax:435:1950`)).toBeUndefined();
  expect(find(saved, `${JK}?_butika_variant=jimmykey:28615:61:86`)).toBeUndefined();
  expect(find(saved, `${JK}?_butika_variant=jimmykey:28615:12:71`)).toBeUndefined();
  expect(find(saved, colons(lv36).replace(S36, '66666666-7777-4888-9999-cccccccccccc'))).toBeUndefined();
});

test('another host, path, fragment or parameter is another page', () => {
  const saved = [{ id: 'lv36', url: `${lv36}&renk=siyah` }];
  expect(find(saved, `${colons(lv36)}&renk=siyah`)).toBe('lv36');
  expect(find(saved, `renk=siyah&${colons(lv36).split('?')[1]}`.replace(/^/, `${LV}?`))).toBe('lv36');
  for (const other of [
    `${colons(lv36).replace('magaza.test', 'www.magaza.test')}&renk=siyah`,
    `${colons(lv36).replace('terlik-p', 'terlik-p2')}&renk=siyah`,
    `${colons(lv36).replace('terlik-p', 'terlik%2Dp')}&renk=siyah`,
    `${colons(lv36)}&renk=beyaz`,
    `${colons(lv36)}`,
    `${colons(lv36)}&renk=siyah&beden=36`,
    `${colons(lv36)}&renk=siyah#yorumlar`,
    `${colons(lv36).replace('https:', 'http:')}&renk=siyah`,
  ]) expect({ other, found: find(saved, other) }).toEqual({ other, found: undefined });
  // A path slash written as %2F is not a slash.
  expect(find([{ id: 'a', url: 'https://magaza.test/a%2Fb?_butika_variant=ticimax%3A1%3A2' }], 'https://magaza.test/a/b?_butika_variant=ticimax:1:2')).toBeUndefined();
});

test('a doubled selection matches no single size; two saves spelled differently for one page: the exact spelling wins, another is ambiguous', () => {
  expect(find([{ id: 'lv36', url: lv36 }], `${colons(lv36)}&_butika_variant=${encodeURIComponent(`lutvelizade:${P}:${S36}`)}`)).toBeUndefined();
  expect(find([{ id: 'twice', url: `${lv36}&_butika_variant=${encodeURIComponent(`lutvelizade:${P}:${S38}`)}` }], colons(lv36))).toBeUndefined();
  const both = [{ id: 'escaped', url: lv36 }, { id: 'plain', url: colons(lv36) }];
  expect(find(both, lv36)).toBe('escaped');
  expect(find(both, colons(lv36))).toBe('plain');
  expect(find(both, lv36.replaceAll('%3A', '%3a'))).toBeUndefined();
});

test('a page naming our size parameter twice, or with a value the app never writes, shows no save, not even one of the same text', () => {
  const doubled = [`${lv36}&_butika_variant=${encodeURIComponent(`lutvelizade:${P}:${S38}`)}`,
    `${lv36}&_butika_variant=${encodeURIComponent(`lutvelizade:${P}:${S36}`)}`];
  const unwritten = [`${LV}?_butika_variant=garbage`, `${LV}?_butika_variant=`, `${LV}?_butika_variant=46565104058534`,
    `${LV}?_butika_variant=${encodeURIComponent(`LUTVELIZADE:${P}:${S36}`)}`, `${JK}?_butika_variant=jimmykey%3A28615%3A61`];
  for (const url of [...doubled, ...unwritten]) expect({ url, found: find([{ id: 'row', url }], url) }).toEqual({ url, found: undefined });
});

test('two saves of the very same text: the first is shown (the database keeps one save per account and address)', () => {
  expect(find([{ id: 'first', url: lv36 }, { id: 'second', url: lv36 }], lv36)).toBe('first');
  expect(find([{ id: 'first', url: LV }, { id: 'second', url: LV }], LV)).toBe('first');
});

test('an address no URL parser reads shows no save, not even one of the same text', () => {
  expect(find([{ id: 'bad', url: 'not a url' }], 'not a url')).toBeUndefined();
  expect(find([{ id: 'bad', url: 'https://magaza.test:99999/terlik' }], 'https://magaza.test:99999/terlik')).toBeUndefined();
});

test('a normal address is its save by its exact text, with one size of ours or none', () => {
  for (const url of [lv36, colons(lv36), LV, `${LV}?renk=siyah`, `${JK}?_butika_variant=jimmykey%3A28615%3A61%3A71`, 'https://shopify.test/products/esofman?variant=1'])
    expect({ url, found: find([{ id: 'row', url }], url) }).toEqual({ url, found: 'row' });
});

test('a page without the internal parameter still recovers one unambiguous saved size, as before', () => {
  expect(find([{ id: 'lv36', url: lv36 }], LV)).toBe('lv36');
  expect(find([{ id: 'lv36', url: `${lv36}&renk=siyah` }], `${LV}?renk=siyah`)).toBe('lv36');
  expect(find([{ id: 'lv36', url: `${lv36}&renk=siyah` }], `${LV}?renk=beyaz`)).toBeUndefined();
  expect(find([{ id: 'lv36', url: lv36 }, { id: 'lv38', url: lv38 }], LV)).toBeUndefined();
  expect(find([{ id: 'twice', url: `${lv36}&_butika_variant=${encodeURIComponent(`lutvelizade:${P}:${S38}`)}` }], LV)).toBeUndefined();
  // On a page that names a size, only that size is ever shown.
  expect(find([{ id: 'lv36', url: lv36 }], colons(lv38))).toBeUndefined();
});

test('Shopify numeric variants keep their exact behaviour', () => {
  const shop = 'https://shopify.test/products/esofman';
  const saved = [{ id: 'v1', url: variantUrl(shop, '46565104058534') }];
  expect(saved[0].url).toBe(`${shop}?variant=46565104058534`);
  expect(find(saved, `${shop}?variant=46565104058534`)).toBe('v1');
  expect(find(saved, `${shop}?variant=46565104058535`)).toBeUndefined();
  // No internal parameter to recover from: the product page alone is not the saved variant.
  expect(find(saved, shop)).toBeUndefined();
  expect(find([{ id: 'u', url: 'https://shopify.test/products/%C3%BCr%C3%BCn?variant=1' }], 'https://shopify.test/products/%C3%BCr%C3%BCn?variant=1')).toBe('u');
});

test('unreadable addresses match nothing and never throw', () => {
  expect(find([{ id: 'lv36', url: lv36 }], 'not a url')).toBeUndefined();
  expect(find([{ id: 'bad', url: 'not a url' }, { id: 'lv36', url: lv36 }], colons(lv36))).toBe('lv36');
  expect(find(undefined, lv36)).toBeUndefined();
  expect(find([], lv36)).toBeUndefined();
});
