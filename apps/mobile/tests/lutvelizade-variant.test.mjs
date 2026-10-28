import { expect, test } from 'bun:test';
import vm from 'node:vm';
import { readVariants, variantCaptureScript, variantUrl } from '../src/lib/saved-variant.ts';
import { pageDocument } from './page-dom.mjs';

// The app's size picker and the server's reader on the same Lutvelizade page: the
// capture script runs against the page's markup, each offered size goes through
// variantUrl, and the server's own reader answers for that address. The page is
// the saved 2026-09-24 structure (apps/api/.../lutvelizade.fixture.ts); states
// other than the saved one are made up, and a size keeping its GUID across the two
// lists is an assumption, not the store's observed behaviour.
const fixture = await import(new URL('../../api/src/lib/price-tracking/lutvelizade.fixture.ts', import.meta.url).href);
const { extractProductHtml } = await import(new URL('../../api/src/lib/price-tracking/extract-product-price.ts', import.meta.url).href);
const { LUTVELIZADE_URL, PPV, SIZE, SAVED_DIALOG, SAVED_SIZES, lutvelizadePage, dialogHtml } = fixture;

const metadata = `(function(){var payload={kind:'og',url:location.href,title:'Asimetrik Kesim Siyah Kadın Terlik'};window.ReactNativeWebView.postMessage(JSON.stringify(payload));})(); true;`;

async function capture(html, { href = LUTVELIZADE_URL, moveAway = false } = {}) {
  const messages = [];
  const url = new URL(href);
  const location = { href, hostname: url.hostname, pathname: url.pathname, protocol: url.protocol, port: url.port };
  const document = pageDocument(html);
  if (moveAway) {
    // The user leaves the page while the script is reading it.
    const query = document.querySelectorAll;
    document.querySelectorAll = selector => { location.href = `${LUTVELIZADE_URL}?changed=1`; return query(selector); };
  }
  const fetch = async () => { throw new Error('No request is expected'); };
  vm.runInNewContext(variantCaptureScript(metadata, 'gesture-1'), {
    location, URL, AbortController, setTimeout, clearTimeout, document, fetch,
    window: { ReactNativeWebView: { postMessage: text => messages.push(JSON.parse(text)) } },
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  return messages;
}

const offered = (label, id, available) => ({ id: `lutvelizade:${PPV}:${id}`, title: label, available });

test('the saved page offers every size with its own identity, and the server reads each one the same way', async () => {
  const page = lutvelizadePage();
  const [message] = await capture(page);
  expect(message.variantStatus).toBe('ready');
  expect(message.requestId).toBe('gesture-1');
  expect(message.variants).toEqual([offered('36', SIZE[36], false), offered('37', SIZE[37], false), offered('38', SIZE[38], true),
    offered('39', SIZE[39], false), offered('40', SIZE[40], false)]);
  expect(readVariants(message.variants)).toEqual(message.variants);
  for (const variant of message.variants) {
    const chosen = variantUrl(message.url, variant.id);
    expect(chosen).toBe(`${LUTVELIZADE_URL}?_butika_variant=${encodeURIComponent(variant.id)}`);
    expect(extractProductHtml(page, chosen)).toEqual({ status: 'success', priceMinor: 59996, currency: 'TRY',
      availability: variant.available ? 'in_stock' : 'out_of_stock', source: 'lutvelizade' });
  }
});

test('every size selectable, or every size sold out: the picker and the server agree', async () => {
  const open = lutvelizadePage({ sizes: Object.entries(SIZE).map(([label, id]) => ({ label, id })), dialog: null });
  const closed = lutvelizadePage({ sizes: Object.keys(SIZE).map(label => ({ label, disabled: true })),
    dialog: Object.entries(SIZE).map(([label, id]) => ({ label, id })) });
  for (const [page, available] of [[open, true], [closed, false]]) {
    const [message] = await capture(page);
    expect(message.variants).toEqual(Object.entries(SIZE).map(([label, id]) => offered(label, id, available)));
    for (const variant of message.variants)
      expect(extractProductHtml(page, variantUrl(message.url, variant.id))).toMatchObject({ availability: available ? 'in_stock' : 'out_of_stock' });
  }
});

test('a product page without sizes is saved without a picker, as before', async () => {
  const page = lutvelizadePage().replace(/<div class="variation size">[\s\S]*?<\/ul><\/div>/, '').replace(/<div class="modal"[\s\S]*?<\/form><\/div><\/div><\/div>/, '');
  const [message] = await capture(page);
  expect(message.variantStatus).toBeUndefined();
  expect(message.variants).toBeUndefined();
});

test('other Lutvelizade pages keep plain metadata saving', async () => {
  const [message] = await capture('<!DOCTYPE html><html><body class=""><section class="newest-products"></section></body></html>', { href: 'https://www.lutvelizade.com.tr/' });
  expect(message.variantStatus).toBeUndefined();
});

test.each([
  ['a second product block', { extra: `<div class="details"><a data-ppv-id="${PPV}"></a></div>` }],
  ['no product identity', { ppv: '' }],
  ['a product identity in upper case', { ppv: PPV.toUpperCase() }],
  ['two dialogs', { dialog: SAVED_DIALOG.slice(0, 2), extra: dialogHtml(SAVED_DIALOG.slice(2)) }],
  ['a second dialog giving the same sizes other GUIDs', { extra: dialogHtml(SAVED_DIALOG.map((s, i) => ({ ...s, id: `0f0e0d0c-0b0a-4908-8706-05040302010${i}` }))) }],
  ['one GUID for two sizes', { dialog: SAVED_DIALOG.map(s => s.label === '36' ? { ...s, id: SIZE[38] } : s) }],
  ['a sold-out size with an id in the block', { sizes: SAVED_SIZES.map(s => s.label === '36' ? { ...s, id: SIZE[36] } : s) }],
  ['a selectable size without an id', { sizes: SAVED_SIZES.map(s => s.label === '38' ? { label: '38' } : s) }],
  ['a label twice', { sizes: [...SAVED_SIZES, { label: '38', id: '0f0e0d0c-0b0a-4908-8706-050403020100' }] }],
  ['a dialog size the block does not show as sold out', { dialog: [...SAVED_DIALOG, { label: '41', id: '0f0e0d0c-0b0a-4908-8706-050403020100' }] }],
  ['the same GUID in both lists', { sizes: SAVED_SIZES.map(s => s.label === '36' ? { label: '36', id: SIZE[36] } : s) }],
  ['sold-out sizes without a dialog', { dialog: null }],
  ['a GUID in upper case in the dialog', { dialog: SAVED_DIALOG.map(s => s.label === '36' ? { ...s, id: s.id.toUpperCase() } : s) }],
])('%s: no picker and no silent size-less save', async (_, options) => {
  const [message] = await capture(lutvelizadePage(options));
  expect(message.variantStatus).toBe('error');
  expect(message.variants).toBeUndefined();
});

test('the dialog alone, without the block list, is not a size list', async () => {
  const page = lutvelizadePage().replace(/<div class="variation size"><strong class="title">BEDEN SEÇİNİZ[\s\S]*?<\/ul><\/div>/, '');
  expect((await capture(page))[0].variantStatus).toBe('error');
});

test('only https on the store host, without a port', async () => {
  expect((await capture(lutvelizadePage(), { href: LUTVELIZADE_URL.replace('https:', 'http:') }))[0].variantStatus).toBe('error');
  expect((await capture(lutvelizadePage(), { href: LUTVELIZADE_URL.replace('.com.tr/', '.com.tr:8443/') }))[0].variantStatus).toBe('error');
});

test('a capture from a page the user has left is discarded', async () => {
  expect(await capture(lutvelizadePage(), { moveAway: true })).toEqual([]);
});

test('the new identity is lower case only; older prefixes keep their letter handling', () => {
  const id = `lutvelizade:${PPV}:${SIZE[38]}`;
  expect(readVariants([{ id, title: '38', available: true }])).not.toBeNull();
  expect(readVariants([{ id: id.toUpperCase(), title: '38', available: true }])).toBeNull();
  expect(readVariants([{ id: `lutvelizade:${PPV}:${SIZE[38].toUpperCase()}`, title: '38', available: true }])).toBeNull();
  expect(() => variantUrl(LUTVELIZADE_URL, `lutvelizade:${PPV}`)).toThrow();
  expect(variantUrl('https://store.test/dress-72', 'TICIMAX:72:2')).toBe('https://store.test/dress-72?_butika_variant=TICIMAX%3A72%3A2');
});
