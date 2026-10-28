import { expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { parseQueryParams } from 'expo-router/build/fork/getStateFromPath-forks.js';
import { resolveHref } from 'expo-router/build/link/href.js';
import { commentsRoute, decodeRouteText, encodeRouteText, readCommentsRoute, readWebviewIz, readWebviewRoute, webviewRoute } from '../src/lib/route-text.ts';

// The chain a saved address takes to the store screen, measured with the installed
// expo-router's own code: resolveHref builds what router.push navigates to, parseQueryParams
// reads the query back into route params, and useLocalSearchParams's own body (taken from the
// package, its two React contexts stubbed) hands them to the screen. Every address below is
// made up on .test hosts; the identities have the shapes the app saves.
const hooks = readFileSync(new URL(import.meta.resolve('expo-router/build/hooks.js')), 'utf8');
const hookBody = /function useLocalSearchParams\(\) \{[\s\S]*?\n\}\n/.exec(hooks)?.[0];
if (!hookBody) throw new Error('useLocalSearchParams was not found in expo-router/build/hooks.js');
const useLocalSearchParams = params => vm.runInNewContext(`(${hookBody})`, {
  react_1: { default: { use: () => params } }, Route_1: {}, PreviewRouteContext_1: { usePreviewInfo: () => ({}) }, Object, Array, decodeURIComponent,
})();
const throughRouter = href => useLocalSearchParams(parseQueryParams(resolveHref(href), { name: href.pathname.slice(1) }, undefined, '') ?? {});

const P = '11111111-2222-4333-8444-555555555555';
const V = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const sources = {
  lutvelizade: `https://magaza.test/terlik-p?_butika_variant=${encodeURIComponent(`lutvelizade:${P}:${V}`)}`,
  ticimax: `https://ticimax.test/bluz-435?_butika_variant=${encodeURIComponent('ticimax:435:1949')}`,
  jimmykey: `https://jk.test/en/bluz_5ww0/haki/61?_butika_variant=${encodeURIComponent('jimmykey:28615:61:71')}`,
  ikas: `https://ikas.test/sutyen?_butika_variant=${encodeURIComponent(`ikas:${P}:${V}`)}&vid=${V}`,
  shopify: 'https://shopify.test/products/esofman?variant=46565104058534',
  escapes: 'https://magaza.test/%C3%BCr%C3%BCn/a%2Fb?q=a%26b&t=x%23y&p=50%25&s=a+b%20c#k%C4%B1s%C4%B1m',
  unicode: 'https://magaza.test/elbise-ı?renk=kırmızı&not=🌸',
  malformed: 'https://magaza.test/urun?q=%E0%A4%A&r=%zz',
};

test('measured: a pushed param is encoded once and decoded twice, so the old screen decoded one level too many', () => {
  for (const [name, source] of Object.entries(sources)) {
    // The old callers encoded once more, and the hook's output was the saved address...
    const old = throughRouter({ pathname: '/webview', params: { url: encodeURIComponent(source) } }).url;
    expect({ name, old }).toEqual({ name, old: source });
    // ...which the old screen decoded again.
    let screen;
    try { screen = decodeURIComponent(old); } catch (error) { screen = error.name; }
    // Only an address with escapes was changed by it.
    expect({ name, same: screen === source }).toEqual({ name, same: !source.includes('%') });
  }
  // What that did: the size's identity lost its escapes, & split a value, # cut the query.
  expect(decodeURIComponent(sources.lutvelizade)).toContain(`_butika_variant=lutvelizade:${P}:${V}`);
  const broken = new URL(decodeURIComponent(sources.escapes));
  expect([broken.searchParams.get('q'), broken.searchParams.get('t'), broken.searchParams.get('p')]).toEqual(['a', 'x', null]);
  expect(() => decodeURIComponent(sources.malformed)).toThrow(URIError);
  // A plain param without the extra encoding loses one level on the way as well.
  expect(throughRouter({ pathname: '/webview', params: { url: sources.lutvelizade } }).url).not.toBe(sources.lutvelizade);
});

test('the store screen and the comments screen receive every address, name and cover exactly as saved', () => {
  for (const [name, source] of Object.entries(sources)) {
    const route = readWebviewRoute(throughRouter(webviewRoute({ boutiqueId: 'b-1', url: source, name: '%100 Dut İpek · 38', cover: sources.escapes })));
    expect({ name, route }).toEqual({ name, route: { url: source, name: '%100 Dut İpek · 38', cover: sources.escapes } });
    expect(readCommentsRoute(throughRouter(commentsRoute({ boutiqueId: 'b-1', url: source, title: 'Terlik %26 · 36' }))))
      .toEqual({ url: source, title: 'Terlik %26 · 36' });
  }
  // The recommendation attribution and the boutique id travel as they are.
  expect(throughRouter(webviewRoute({ boutiqueId: 'b-1', url: sources.shopify, kaynak: 'oneri', oneriId: 'o-1' })))
    .toMatchObject({ boutiqueId: 'b-1', kaynak: 'oneri', oneriId: 'o-1' });
  expect(webviewRoute({ boutiqueId: 'b-1', url: sources.shopify, kaynak: 'oneri' }).params).not.toHaveProperty('kaynak');
  // The outbound click trace (utm_campaign + butika_click) travels as saved, or not at all.
  const iz = { tik: '6f1c2a3b-0d4e-4f5a-9b8c-7d6e5f4a3b2c', kampanya: 'vitrin' };
  expect(readWebviewIz(throughRouter(webviewRoute({ boutiqueId: 'b-1', url: sources.shopify, iz })))).toEqual(iz);
  expect(readWebviewIz(throughRouter(webviewRoute({ boutiqueId: 'b-1', url: sources.shopify })))).toBeNull();
});

test('the route text does not change under any number of decodings', () => {
  for (const source of Object.values(sources)) {
    let text = encodeRouteText(source);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    for (let decodings = 0; decodings < 4; decodings++) {
      expect(decodeRouteText(text)).toBe(source);
      text = decodeURIComponent(text);
    }
  }
  expect(decodeRouteText(encodeRouteText('a\uD800b'))).toBe('a�b');
});

test('unreadable route text or a non-web address opens nothing, and nothing is guessed', () => {
  // Base64url of raw bytes, written out here so that bytes no UTF-8 encoder makes can be tried.
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const bytes = list => { let text = ''; for (let i = 0; i < list.length; i += 3) {
    const n = (list[i] << 16) | ((list[i + 1] ?? 0) << 8) | (list[i + 2] ?? 0);
    text += abc[(n >> 18) & 63] + abc[(n >> 12) & 63] + (i + 1 < list.length ? abc[(n >> 6) & 63] : '') + (i + 2 < list.length ? abc[n & 63] : ''); } return text; };
  for (const value of [undefined, null, 7, ['aHR0cHM6Ly9h'], '', 'a', 'aHR0cHM=', 'aHR0+HM', 'aHR0/HM', '%61', 'AB', bytes([0xc0, 0x80]), bytes([0xff]), bytes([0xed, 0xa0, 0x80])])
    expect({ value, text: decodeRouteText(value) }).toEqual({ value, text: null });
  for (const address of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x', 'intent://x#Intent;end', 'ftp://magaza.test/', 'not a url'])
    expect(readWebviewRoute(throughRouter(webviewRoute({ boutiqueId: 'b-1', url: address, cover: address })))).toEqual({ url: null, name: null, cover: null });
  // An old-style route (the pre-contract url param) is not read at all.
  expect(readWebviewRoute(throughRouter({ pathname: '/webview', params: { url: encodeURIComponent(sources.shopify) } }))).toEqual({ url: null, name: null, cover: null });
});

test('every way into the store screen and the comments screen goes through the contract', () => {
  const root = new URL('../app/', import.meta.url);
  const files = readdirSync(root, { recursive: true }).filter(f => /\.tsx?$/.test(f)).map(f => [String(f).replaceAll('\\', '/'), readFileSync(new URL(String(f).replaceAll('\\', '/'), root), 'utf8')]);
  for (const [file, text] of files) {
    expect({ file, handBuilt: /pathname:\s*'\/(webview|comments)'/.test(text) }).toEqual({ file, handBuilt: false });
    expect({ file, decodesParams: /decodeURIComponent\(\s*params/.test(text) }).toEqual({ file, decodesParams: false });
  }
  const entries = files.filter(([, text]) => text.includes('webviewRoute(')).map(([file]) => file).sort();
  expect(entries).toEqual(['(tabs)/saved.tsx', '_layout.tsx', 'b/[slug].tsx', 'boutique/[id].tsx', 'collection/[id].tsx', 'notifications.tsx', 'search.tsx']);
  expect(files.filter(([, text]) => text.includes('commentsRoute(')).map(([file]) => file)).toEqual(['webview.tsx']);
});
