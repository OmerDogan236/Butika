import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import vm from 'node:vm';
import * as ikas from './ikas.fixture.mjs';
import { pageDocument } from './page-dom.mjs';

// The size-save flow of app/webview.tsx itself, not a helper: the screen module is loaded
// unchanged and run with a small hook runner, its native and app modules replaced by
// recorders (saved-variant.ts stays real). The heart's own onPress injects the real
// capture script, which runs on the page's markup; its message reaches the WebView's own
// onMessage prop; the picker's own onClose, onSelect and onNotify props are called. This
// is a callback test without a renderer, a native WebView or a phone: layout, animation,
// the Modal and real navigation are not exercised. A page that changes its content
// without changing its address is not covered. Main's home-page warning in front of the
// flow is covered with its own toast props, its timers fired by hand.
const fixture = await import(new URL('../../api/src/lib/price-tracking/jimmykey.fixture.ts', import.meta.url).href);
const { JIMMYKEY_URL: A, JIMMYKEY_BLACK_URL: B, JIMMYKEY_PRODUCT_ID: ID, jimmykeyPage, jimmykeyBlackPage } = fixture;
const lv = await import(new URL('../../api/src/lib/price-tracking/lutvelizade.fixture.ts', import.meta.url).href);

// ── recorders and the state the screen reads
const calls = { gonderim: [], share: [], save: [], update: [], unsave: [], arm: [], inject: [], reload: [], haptics: [], track: [], commentsFor: [], routes: [], olcum: [] };
let saved = [];
let params = {};
// Önbellekteki pilot bilgisi ve POST /gonderimler yanıtı (etiketli butik linki); varsayılan: pilot değil, istek yok.
let pilotBiliniyor = false;
let gonderimYaniti = async (_boutiqueId, url) => ({ url });
const reset = () => { for (const list of Object.values(calls)) list.length = 0; saved = []; };

// ── the smallest hook runner webview.tsx needs: state, refs, memo, callbacks, effects
const rt = { slots: [], i: 0, effects: [], dirty: false };
const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, k) => Object.is(v, b[k]));
const hooks = {
  useState(init) {
    const i = rt.i++;
    if (!(i in rt.slots)) rt.slots[i] = { v: typeof init === 'function' ? init() : init };
    const slot = rt.slots[i];
    return [slot.v, next => { const v = typeof next === 'function' ? next(slot.v) : next; if (!Object.is(v, slot.v)) { slot.v = v; rt.dirty = true; } }];
  },
  useRef(init) { const i = rt.i++; if (!(i in rt.slots)) rt.slots[i] = { current: init }; return rt.slots[i]; },
  useMemo(make, deps) { const i = rt.i++; const slot = rt.slots[i]; if (!slot || !same(slot.deps, deps)) rt.slots[i] = { v: make(), deps }; return rt.slots[i].v; },
  useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
  useEffect(effect, deps) {
    const i = rt.i++;
    const slot = rt.slots[i];
    if (slot && deps && same(slot.deps, deps)) return;
    const before = slot?.cleanup;
    rt.slots[i] = { deps, cleanup: undefined };
    rt.effects.push(() => { if (before) before(); const c = effect(); rt.slots[i].cleanup = typeof c === 'function' ? c : undefined; });
  },
};
const element = (type, props, key) => ({ type, props: props ?? {}, key });
const createElement = (type, config, ...children) => element(type, { ...(config ?? {}), ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) });
const Fragment = function Fragment() {};
const marker = name => Object.defineProperty(() => {}, 'name', { value: name });
const [WebView, VariantPicker, SaveCelebration, Pressable, Text, Toast, CollectionPicker, RestockToggle, Ionicons] =
  ['WebView', 'VariantPicker', 'SaveCelebration', 'Pressable', 'Text', 'Toast', 'CollectionPicker', 'RestockToggle', 'Ionicons'].map(marker);

mock.module('react', () => ({ ...hooks, createElement, Fragment, default: { ...hooks, createElement, Fragment } }));
mock.module('react/jsx-runtime', () => ({ jsx: element, jsxs: element, Fragment }));
mock.module('react/jsx-dev-runtime', () => ({ jsxDEV: element, Fragment }));
mock.module('react-i18next', () => ({ useTranslation: () => ({ t: key => key, i18n: { language: 'en' } }) }));
mock.module('expo-router', () => ({ useFocusEffect: () => {}, useLocalSearchParams: () => params,
  useRouter: () => ({ back() {}, push: href => calls.routes.push(href), replace() {} }) }));
mock.module('expo-haptics', () => ({ impactAsync: style => calls.haptics.push(style), notificationAsync: type => calls.haptics.push(type),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' }, NotificationFeedbackType: { Error: 'error', Success: 'success' } }));
mock.module('expo-image', () => ({ Image: marker('Image') }));
mock.module('@expo/vector-icons', () => ({ Ionicons }));
mock.module('react-native', () => ({ ActivityIndicator: marker('ActivityIndicator'), Alert: { alert() {} }, Platform: { OS: 'android', select: o => o.android ?? o.default },
  Pressable, Share: { share: async content => { calls.share.push(content); return {}; } }, StyleSheet: { create: s => s, hairlineWidth: 1, absoluteFillObject: {} }, Text, View: marker('View') }));
mock.module('react-native-reanimated', () => ({ default: { View: marker('Animated.View') }, Easing: { out: f => f, in: f => f, inOut: f => f, cubic: v => v },
  useAnimatedStyle: () => ({}), useSharedValue: value => ({ value }), withSequence: (...steps) => steps, withSpring: v => v, withTiming: v => v }));
mock.module('react-native-safe-area-context', () => ({ SafeAreaView: marker('SafeAreaView') }));
mock.module('react-native-webview', () => ({ WebView }));
mock.module('../src/api/queries', () => ({
  pilotOlduguBiliniyor: () => pilotBiliniyor,
  gonderimAdresiIste: (boutiqueId, url, signal) => { calls.gonderim.push({ boutiqueId, url }); return gonderimYaniti(boutiqueId, url, signal); },
  trackEvents: events => calls.track.push(...events),
  useCommentCount: url => { calls.commentsFor.push(url); return { data: 0 }; },
  useSaveProduct: () => ({ isPending: false, mutate: (vars, callbacks) => calls.save.push({ vars, callbacks }) }),
  useSavedProducts: () => ({ data: saved }),
  useUnsaveByUrl: () => ({ isPending: false, mutate: (vars, callbacks) => calls.unsave.push({ vars, callbacks }) }),
  useUpdateSavedVariant: () => ({ isPending: false, mutate: (vars, callbacks) => calls.update.push({ vars, callbacks }) }),
}));
mock.module('../src/components/CollectionPicker', () => ({ CollectionPicker }));
mock.module('../src/components/RestockToggle', () => ({ RestockToggle,
  useRestockToggle: () => ({ pending: false, arm: (id, message) => calls.arm.push([id, message]), toggle() {} }) }));
mock.module('../src/components/SaveCelebration', () => ({ SaveCelebration }));
mock.module('../src/components/Toast', () => ({ Toast }));
mock.module('../src/components/VariantPicker', () => ({ VariantPicker }));
const TurHedefiMarker = marker('TurHedefi');
mock.module('../src/components/tur/TurHedefi', () => ({ TurHedefi: TurHedefiMarker }));
mock.module('../src/lib/analytics', () => ({
  trackWebviewTiming() {},
  trackWebviewError: p => calls.olcum.push(['webview_error', p]),
  trackSaveAttempt: p => calls.olcum.push(['product_save_attempt', p]),
  trackSaveFailed: p => calls.olcum.push(['product_save_failed', p]),
}));
const failures = () => calls.olcum.filter(([name]) => name === 'product_save_failed').map(([, p]) => p.reason);
// Oturum kaydında butik sitesini gizleyen sarmalayıcı; testte yalnız içini çizer.
mock.module('posthog-react-native', () => ({ PostHogMaskView: ({ children }) => children }));
mock.module('../src/lib/api', () => ({ ApiError: class ApiError extends Error {} }));
mock.module('../src/stores/tur', () => ({ useTurStore: select => select({ turuBaslat() {}, gorulenler: null }) }));

const { default: Screen } = await import('../app/webview.tsx');
const { variantUrl } = await import('../src/lib/saved-variant.ts');
const { readCommentsRoute, webviewRoute } = await import('../src/lib/route-text.ts');

// ── rendering and finding what the screen hands to its children
let tree = null;
function render() {
  for (let pass = 0; pass < 20; pass++) {
    rt.i = 0; rt.effects = []; rt.dirty = false;
    tree = Screen();
    for (const run of rt.effects) run();
    if (!rt.dirty) return tree;
  }
  throw new Error('the screen keeps re-rendering');
}
function all(node, keep, out = []) {
  if (Array.isArray(node)) { for (const child of node) all(child, keep, out); return out; }
  if (!node || typeof node !== 'object' || !('props' in node)) return out;
  if (keep(node)) out.push(node);
  all(node.props.children, keep, out);
  return out;
}
const one = keep => { const found = all(tree, keep); if (found.length !== 1) throw new Error(`expected one element, found ${found.length}`); return found[0]; };
const webView = () => one(n => n.type === WebView);
const picker = () => one(n => n.type === VariantPicker);
const heart = () => one(n => n.type === Pressable && n.props.onPress?.name === 'handleHeart');
const heartLabel = () => all(heart(), n => n.type === Text).flatMap(n => [n.props.children].flat()).find(c => typeof c === 'string')?.toLowerCase(); // etiket buyukHarf ile büyütülür
const assigned = () => calls.inject.filter(code => code.includes('location.assign'));
const toast = () => one(n => n.type === Toast).props;

// The screen's own timers (toasts of 1.9 s and 6 s, the 8 s capture limit) are held while a
// test asks for it and fired by hand; the page script's short waits run as usual.
const held = [];
const realTimers = { set: globalThis.setTimeout, clear: globalThis.clearTimeout };
function holdTimers() {
  globalThis.setTimeout = (fn, ms = 0, ...args) => (ms >= 1000 ? held.push({ fn, ms, args, done: false }) : realTimers.set(fn, ms, ...args));
  globalThis.clearTimeout = id => { if (typeof id === 'number' && held[id - 1]) held[id - 1].done = true; else realTimers.clear(id); };
}
function releaseTimers() { globalThis.setTimeout = realTimers.set; globalThis.clearTimeout = realTimers.clear; held.length = 0; }
function elapse(ms) { for (const t of held) if (!t.done && t.ms === ms) { t.done = true; t.fn(...t.args); } render(); }

function open(url) {
  rt.slots = []; reset();
  for (const t of held) t.done = true;
  params = webviewRoute({ boutiqueId: 'b-1', url, name: 'Jimmy Key' }).params;
  render();
  webView().props.ref.current = { injectJavaScript: code => calls.inject.push(code), reload: () => calls.reload.push(url) };
}
function navigate(url) {
  webView().props.onNavigationStateChange({ url, canGoBack: true, canGoForward: false, loading: false, title: '' });
  render();
}
// The page as the WebView would hold it; only the two selectors of the metadata script
// that the test DOM does not read answer with nothing. `page.window` adds globals (a store's
// page data), `page.loadedAt` the address the document's navigation entry names.
function pageContext(html, href, fetch = async () => { throw new Error('No request is expected'); }, page = {}) {
  const url = new URL(href);
  const doc = pageDocument(html);
  const quiet = ['img[src]:not([src=""])', '.product-detail-card-info__info-header-top-content .price-current__amount'];
  const query = doc.querySelector;
  const queryAll = doc.querySelectorAll;
  doc.querySelector = s => (quiet.includes(s) ? null : query(s));
  doc.querySelectorAll = s => (quiet.includes(s) ? [] : queryAll(s));
  doc.title = 'Boat Neck Blouse';
  const messages = [];
  return { messages, context: { location: { href, hostname: url.hostname, pathname: url.pathname, protocol: url.protocol, port: url.port },
    URL, AbortController, setTimeout, clearTimeout, fetch, document: doc, window: { ...page.window, ReactNativeWebView: { postMessage: m => messages.push(m) } },
    ...(page.loadedAt ? { performance: { getEntriesByType: type => (type === 'navigation' ? [{ name: page.loadedAt }] : []) } } : {}) } };
}
// Runs an injected script on a page and hands what it posts to the WebView's own onMessage.
async function runInPage(code, html, href, fetch, extra) {
  const page = pageContext(html, href, fetch, extra);
  vm.runInNewContext(code, page.context);
  await new Promise(resolve => setTimeout(resolve, 0));
  for (const data of page.messages) { webView().props.onMessage({ nativeEvent: { data } }); render(); }
  return page.messages.length;
}
async function tapHeartOn(html, href, fetch, extra) {
  heart().props.onPress();
  render();
  return runInPage(calls.inject.at(-1), html, href, fetch, extra);
}

beforeEach(() => { rt.slots = []; reset(); });
afterEach(() => { for (const slot of rt.slots) if (slot && typeof slot.cleanup === 'function') slot.cleanup(); });

test('the picker opens on the page\'s sizes and closing it saves, arms and navigates nothing', async () => {
  open(A);
  await tapHeartOn(jimmykeyPage(), A);
  expect(picker().props.variants.map(v => v.id)).toEqual(['71', '86', '75', '80'].map(s => `jimmykey:${ID}:61:${s}`));
  picker().props.onClose();
  render();
  expect(picker().props.variants).toBeNull();
  expect({ save: calls.save.length, update: calls.update.length, arm: calls.arm.length, assign: assigned().length, haptics: calls.haptics.length })
    .toEqual({ save: 0, update: 0, arm: 0, assign: 0, haptics: 0 });
  expect(calls.inject).toHaveLength(1);
  expect(failures()).toEqual(['size_not_chosen']);
});

test('one jimmykey size is saved only after it is chosen, once, with its own identity', async () => {
  const html = jimmykeyPage({ sizes: [{ id: '71', label: 'STD', onSale: true }] });
  open(A);
  await tapHeartOn(html, A);
  expect(picker().props.variants).toEqual([{ id: `jimmykey:${ID}:61:71`, title: 'STD', available: true }]);
  expect(calls.save).toHaveLength(0);
  picker().props.onSelect(picker().props.variants[0]);
  render();
  expect(calls.save).toHaveLength(1);
  expect(calls.save[0].vars).toMatchObject({ boutiqueId: 'b-1', url: variantUrl(A, `jimmykey:${ID}:61:71`), title: 'Boat Neck Blouse · STD' });
  // Still on the page: the reply follows the saved address, as before.
  calls.save[0].callbacks.onSuccess({ id: 'saved-1' });
  render();
  expect(assigned()).toEqual([`location.assign(${JSON.stringify(variantUrl(A, `jimmykey:${ID}:61:71`))}); true;`]);
});

test('a reply for page A that arrives on page B keeps A\'s own result and leaves B alone', async () => {
  const chosen = variantUrl(A, `jimmykey:${ID}:61:86`);
  // Plain save: the celebration names A's product and size.
  open(A);
  await tapHeartOn(jimmykeyPage(), A);
  picker().props.onSelect(picker().props.variants[1]);
  render();
  expect(calls.save.map(c => c.vars.url)).toEqual([chosen]);
  navigate(B);
  calls.save[0].callbacks.onSuccess({ id: 'saved-A' });
  saved = [{ id: 'saved-A', url: chosen, title: 'Boat Neck Blouse · M' }];
  render();
  expect(assigned()).toEqual([]);
  expect(calls.haptics.length).toBeGreaterThan(0);
  expect(one(n => n.type === SaveCelebration).props).toMatchObject({ visible: true, productTitle: 'Boat Neck Blouse · M' });
  expect(calls.track.filter(e => e.type === 'product_saved').map(e => e.payload)).toEqual([
    { url: chosen, boutique_id: 'b-1', variant_chosen: true, restock_armed: false, is_home_page: false, is_variant_edit: false },
  ]);
  expect(calls.olcum.filter(([name]) => name === 'product_save_attempt').map(([, p]) => p)).toEqual([{ boutiqueId: 'b-1', isHomePage: false }]);
  // B is still B: its heart is not saved and the page shown is B.
  expect(heartLabel()).toBe('boutique.save');
  expect(calls.commentsFor.at(-1)).toBe(B);

  // Bell on a sold-out size: A's alert is armed for A's own save, B is untouched.
  open(A);
  await tapHeartOn(jimmykeyPage(), A);
  picker().props.onNotify(picker().props.variants[1]);
  render();
  navigate(B);
  calls.save[0].callbacks.onSuccess({ id: 'saved-A2' });
  render();
  expect(calls.arm).toEqual([['saved-A2', 'boutique.restockSaved']]);
  expect(assigned()).toEqual([]);
  expect(heartLabel()).toBe('boutique.save');
});

test('moving from colour A to colour B drops A\'s capture and A\'s open choice', async () => {
  // A's capture message arrives after the user reached B.
  open(A);
  heart().props.onPress();
  render();
  const captureOfA = calls.inject.at(-1);
  navigate(B);
  await runInPage(captureOfA, jimmykeyPage(), A);
  expect(picker().props.variants).toBeNull();
  // The picker was open on A when the user moved to B.
  open(A);
  await tapHeartOn(jimmykeyPage(), A);
  const openOnA = picker().props;
  navigate(B);
  expect(picker().props.variants).toBeNull();
  picker().props.onSelect(openOnA.variants[0]);
  // A tap that still reaches the picker as it was drawn on A.
  openOnA.onSelect(openOnA.variants[0]);
  render();
  expect({ save: calls.save.length, arm: calls.arm.length, assign: assigned().length }).toEqual({ save: 0, arm: 0, assign: 0 });
  // B offers its own sizes, with its own colour.
  await tapHeartOn(jimmykeyBlackPage(), B);
  expect(picker().props.variants.map(v => v.id)).toEqual(['71', '86', '75', '80'].map(s => `jimmykey:${ID}:12:${s}`));
});

test('another store\'s single option is still saved at once, without the picker', async () => {
  const page = 'https://store.test/products/tee';
  const product = { id: 1, handle: 'tee', variants: [{ id: 123, title: 'Default Title', available: true }] };
  // The page asks for its own product data at a relative address, as in a browser.
  const fetch = async url => (new URL(url, page).href === `${page}.js` ? { ok: true, json: async () => product } : Promise.reject(new Error(`unexpected ${url}`)));
  open(page);
  await tapHeartOn('<!DOCTYPE html><html><body></body></html>', page, fetch);
  expect(picker().props.variants).toBeNull();
  expect(calls.save.map(c => c.vars.url)).toEqual([`${page}?variant=123`]);
  calls.save[0].callbacks.onSuccess({ id: 'saved-tee' });
  render();
  expect(assigned()).toEqual([`location.assign(${JSON.stringify(`${page}?variant=123`)}); true;`]);
});

// Main's home-page warning (d51d4e7) sits in front of the size flow: on a store's root
// address the heart first asks, and only "save anyway" starts a capture.
const JK_HOME = 'https://www.jimmykey.com/en';
const LV_HOME = 'https://www.lutvelizade.com.tr/';
// As the saved Lutvelizade home page of 2026-09-09 (sha256 a9211d2a…): no product block, no
// stock dialog, no size list; only product cards.
const lvHomePage = `<!DOCTYPE html><html lang="tr"><head><title>Lutvelizade</title></head><body class="">${lv.RECOMMENDED_CARD}</body></html>`;

describe('the home-page warning in front of the size flow', () => {
  beforeEach(holdTimers);
  afterEach(releaseTimers);

  test('on a store\'s home page the heart only warns, and a warning closed without a choice saves nothing', () => {
    for (const home of [JK_HOME, LV_HOME]) {
      open(home);
      heart().props.onPress();
      render();
      expect(toast()).toMatchObject({ visible: true, message: 'boutique.homeHint', actionLabel: 'boutique.saveAnyway' });
      expect({ inject: calls.inject.length, save: calls.save.length, haptics: calls.haptics.length }).toEqual({ inject: 0, save: 0, haptics: 0 });
      // The warning waits to be read (29 Sep test): time alone does not take it away.
      elapse(6000);
      expect(toast()).toMatchObject({ visible: true, message: 'boutique.homeHint' });
      toast().onClose();
      render();
      expect(toast().visible).toBe(false);
      // Nothing was approved: the next tap asks again and still captures nothing.
      heart().props.onPress();
      render();
      expect(toast()).toMatchObject({ visible: true, actionLabel: 'boutique.saveAnyway' });
      expect({ inject: calls.inject.length, save: calls.save.length }).toEqual({ inject: 0, save: 0 });
      expect(calls.olcum.at(-1)).toEqual(['product_save_attempt', { boutiqueId: 'b-1', isHomePage: true }]);
    }
  });

  test('"save anyway" on a home page saves that page, never a size found on it', async () => {
    // Synthetic for Jimmy Key: the home address even carries a whole product block; the size
    // capture keys on a colour page's address, not on markup.
    for (const [home, html] of [[JK_HOME, jimmykeyPage()], [LV_HOME, lvHomePage]]) {
      open(home);
      heart().props.onPress();
      render();
      toast().onAction();
      render();
      expect(toast().visible).toBe(false);
      expect(calls.inject).toHaveLength(1);
      await runInPage(calls.inject.at(-1), html, home);
      expect(picker().props.variants).toBeNull();
      expect(calls.save.map(c => c.vars.url)).toEqual([home]);
      calls.save[0].callbacks.onSuccess({ id: 'saved-home' });
      render();
      expect(assigned()).toEqual([]);
      // Approved for this address: the next tap captures at once, without asking.
      heart().props.onPress();
      render();
      expect(toast().visible).toBe(false);
      expect(calls.inject).toHaveLength(2);
    }
  });

  test('a "save anyway" from a page the user has left approves nothing: back on the home page the heart warns again', async () => {
    open(JK_HOME);
    heart().props.onPress();
    render();
    const warning = toast();
    navigate(A);
    warning.onAction();
    render();
    navigate(JK_HOME);
    heart().props.onPress();
    render();
    expect(toast()).toMatchObject({ visible: true, message: 'boutique.homeHint', actionLabel: 'boutique.saveAnyway' });
    expect(calls.inject).toHaveLength(0);
    // The warning's own button, on the page it was shown for, still saves that page.
    toast().onAction();
    render();
    expect(calls.inject).toHaveLength(1);
    await runInPage(calls.inject.at(-1), jimmykeyPage(), JK_HOME);
    expect(calls.save.map(c => c.vars.url)).toEqual([JK_HOME]);
  });

  test('a capture the page never answers runs out after 8 s: a failed save is said, the heart is free and a late answer is refused', async () => {
    open(A);
    heart().props.onPress();
    render();
    expect(heart().props.disabled).toBe(true);
    const code = calls.inject.at(-1);
    elapse(8000);
    expect(toast()).toMatchObject({ visible: true, message: 'boutique.saveFailed', tone: 'error' });
    expect(failures()).toEqual(['timeout']);
    expect(heart().props.disabled).toBe(false);
    // The page's answer after the limit opens nothing and saves nothing.
    await runInPage(code, jimmykeyPage(), A);
    expect(picker().props.variants).toBeNull();
    expect(calls.save).toHaveLength(0);
    // The failure notice stays until it is closed, and a new tap captures again.
    elapse(1900);
    expect(toast()).toMatchObject({ visible: true, message: 'boutique.saveFailed' });
    toast().onClose();
    render();
    expect(toast().visible).toBe(false);
    await tapHeartOn(jimmykeyPage(), A);
    expect(picker().props.variants.map(v => v.id)).toEqual(['71', '86', '75', '80'].map(s => `jimmykey:${ID}:61:${s}`));
  });

  test('after the warning a product page offers its own sizes, and the colour and late-reply guards hold', async () => {
    // Warned on Jimmy Key's home page, then on to colour A while the warning is still shown.
    open(JK_HOME);
    heart().props.onPress();
    render();
    const warning = toast();
    navigate(A);
    // Its "save anyway" belongs to the home page, which is no longer shown: it closes the
    // warning and does nothing else - no capture, no approval, no picker, no save.
    warning.onAction();
    render();
    expect(toast().visible).toBe(false);
    expect({ inject: calls.inject.length, save: calls.save.length }).toEqual({ inject: 0, save: 0 });
    expect(picker().props.variants).toBeNull();
    // A's own heart does not ask and offers A's own sizes.
    await tapHeartOn(jimmykeyPage(), A);
    expect(picker().props.variants.map(v => v.id)).toEqual(['71', '86', '75', '80'].map(s => `jimmykey:${ID}:61:${s}`));
    // Colour B while A's picker is open: it closes, and a tap that still reaches it saves nothing.
    const openOnA = picker().props;
    navigate(B);
    expect(picker().props.variants).toBeNull();
    openOnA.onSelect(openOnA.variants[1]);
    render();
    expect(calls.save).toHaveLength(0);
    // B's own size; the reply arrives after the user went back to A and does not pull the
    // browser to B.
    await tapHeartOn(jimmykeyBlackPage(), B);
    picker().props.onSelect(picker().props.variants[1]);
    render();
    expect(calls.save.map(c => c.vars.url)).toEqual([variantUrl(B, `jimmykey:${ID}:12:86`)]);
    navigate(A);
    calls.save[0].callbacks.onSuccess({ id: 'saved-B' });
    render();
    expect(assigned()).toEqual([]);

    // Warned on Lutvelizade's home page, then its product page: the size carries the page's
    // own identities, and a reply on the same page follows the saved address.
    open(LV_HOME);
    heart().props.onPress();
    render();
    expect(toast().visible).toBe(true);
    navigate(lv.LUTVELIZADE_URL);
    await tapHeartOn(lv.lutvelizadePage(), lv.LUTVELIZADE_URL);
    const size38 = picker().props.variants.find(v => v.title === '38');
    expect(picker().props.variants.map(v => v.title)).toEqual(['36', '37', '38', '39', '40']);
    expect(size38).toEqual({ id: `lutvelizade:${lv.PPV}:${lv.SIZE[38]}`, title: '38', available: true });
    picker().props.onSelect(size38);
    render();
    const chosen = variantUrl(lv.LUTVELIZADE_URL, size38.id);
    expect(calls.save.map(c => c.vars.url)).toEqual([chosen]);
    calls.save[0].callbacks.onSuccess({ id: 'saved-38' });
    render();
    expect(assigned()).toEqual([`location.assign(${JSON.stringify(chosen)}); true;`]);
  });
});

describe('a saved size opened again from a list, a notification or a push', () => {
  const chip = icon => one(n => n.type === Pressable && all(n, c => c.type === Ionicons && c.props.name === icon).length > 0);
  const texts = () => all(tree, n => n.type === Text).flatMap(n => [n.props.children].flat()).filter(c => typeof c === 'string');
  const size36 = variantUrl(lv.LUTVELIZADE_URL, `lutvelizade:${lv.PPV}:${lv.SIZE[36]}`);
  const record = { id: 'saved-36', url: size36, title: 'Terlik · 36', restockAlert: 'off' };

  test('opens its exact address and shows it saved, with its size change, stock alert, collections and comments on that record', () => {
    open(size36);
    saved = [record];
    render();
    expect(webView().props.source.uri).toBe(size36);
    expect(size36).toContain('%3A');
    expect(heartLabel()).toBe('boutique.saved');
    expect(texts()).toContain('boutique.changeVariant');
    expect(one(n => n.type === RestockToggle).props.item.id).toBe('saved-36');
    chip('albums-outline').props.onPress();
    render();
    expect(one(n => n.type === CollectionPicker).props).toMatchObject({ visible: true, savedId: 'saved-36' });
    chip('chatbubble-outline').props.onPress();
    expect(calls.routes).toHaveLength(1);
    expect(readCommentsRoute(calls.routes[0].params)).toEqual({ url: size36, title: 'Jimmy Key' });
    // The same page reported with ':' for %3A is the same saved size; another size is not.
    navigate(size36.replaceAll('%3A', ':'));
    expect(heartLabel()).toBe('boutique.saved');
    navigate(variantUrl(lv.LUTVELIZADE_URL, `lutvelizade:${lv.PPV}:${lv.SIZE[38]}`).replaceAll('%3A', ':'));
    expect(heartLabel()).toBe('boutique.save');
    expect(all(tree, n => n.type === RestockToggle)).toEqual([]);
  });

  test('a boutique link from Butika opens with utm and butika_click, yet the screen keeps and saves the clean address', () => {
    open(size36);
    params = webviewRoute({ boutiqueId: 'b-1', url: size36, name: 'Jimmy Key', iz: { tik: 'tik-1', kampanya: 'vitrin' } }).params;
    saved = [record];
    render();
    const tagged = webView().props.source.uri;
    expect(tagged).toContain('utm_source=butika');
    expect(tagged).toContain('butika_click=tik-1');
    // The store reports the tagged address back; the saved record still matches and comments
    // are filed under the address without our parameters.
    navigate(tagged);
    expect(heartLabel()).toBe('boutique.saved');
    chip('chatbubble-outline').props.onPress();
    expect(readCommentsRoute(calls.routes.at(-1).params).url).toBe(size36);
  });

  test('a page naming our size parameter twice binds no save, size change or stock alert, not even of a save with the same text', () => {
    const twice = `${size36}&_butika_variant=${encodeURIComponent(`lutvelizade:${lv.PPV}:${lv.SIZE[38]}`)}`;
    open(twice);
    saved = [{ id: 'saved-twice', url: twice, title: 'Terlik · ?', restockAlert: 'armed' }, record];
    render();
    expect(webView().props.source.uri).toBe(twice);
    expect(heartLabel()).toBe('boutique.save');
    expect(texts()).not.toContain('boutique.changeVariant');
    expect(all(tree, n => n.type === RestockToggle)).toEqual([]);
  });

  test('an unreadable route opens no page and says so, instead of crashing or spinning', () => {
    rt.slots = []; reset();
    for (const bad of [{ adres: 'aHR0cHM6Ly9%' }, { url: encodeURIComponent('https://magaza.test/?q=%E0%A4%A') }, {}]) {
      rt.slots = [];
      params = { boutiqueId: 'b-1', ...bad };
      render();
      expect(all(tree, n => n.type === WebView)).toEqual([]);
      expect(texts()).toContain('boutique.openFailed');
    }
  });
});

// An IKAS product reached by a move inside the store: the page data is still the page the
// store was opened at (ikas.fixture.mjs; measured on vayustore.com on 2026-09-27). The size is
// not read from it; the user is offered a reload of this page, and saves after it.
describe('an IKAS product reached by a move inside the store', () => {
  beforeEach(holdTimers);
  afterEach(releaseTimers);
  const HERA = `${ikas.HOST}/hera-sporcu-sutyeni`;
  const AFRODIT = `${ikas.HOST}/${ikas.SLUG}`;
  const html = `<html><head>${ikas.head({ path: '/hera-sporcu-sutyeni' })}</head><body></body></html>`;
  // The document the store was opened as: the home page's data, loaded at the home page.
  const moved = { window: { __NEXT_DATA__: ikas.homeData() }, loadedAt: `${ikas.HOST}/` };
  // The same page after the reload: loaded at its address, with its own data.
  const reloaded = { window: { __NEXT_DATA__: ikas.productData({ slug: 'hera-sporcu-sutyeni' }) }, loadedAt: HERA };
  const heraSizes = ikas.offered().map(v => v.id);

  test('the page offers a reload; only the user\'s tap reloads it, once, and nothing is saved or captured by itself', async () => {
    open(HERA);
    await tapHeartOn(html, HERA, undefined, moved);
    expect(toast()).toMatchObject({ visible: true, message: 'boutique.variantStale', actionLabel: 'boutique.reloadPage' });
    expect(picker().props.variants).toBeNull();
    expect({ save: calls.save.length, reload: calls.reload.length, inject: calls.inject.length }).toEqual({ save: 0, reload: 0, inject: 1 });
    // Left alone, the offer stays and nothing is reloaded; closed, it goes and still nothing is.
    elapse(6000);
    expect(toast()).toMatchObject({ visible: true, message: 'boutique.variantStale' });
    toast().onClose();
    render();
    expect(toast().visible).toBe(false);
    expect(calls.reload).toEqual([]);
    // Asked again, the tap reloads this page once; the save waits for the user's next tap.
    await tapHeartOn(html, HERA, undefined, moved);
    toast().onAction();
    render();
    expect(toast().visible).toBe(false);
    expect(calls.reload).toEqual([HERA]);
    expect({ save: calls.save.length, update: calls.update.length, inject: calls.inject.length }).toEqual({ save: 0, update: 0, inject: 2 });
  });

  test('the offer shown on a page the user has left reloads nothing', async () => {
    open(HERA);
    await tapHeartOn(html, HERA, undefined, moved);
    const offer = toast();
    navigate(AFRODIT);
    offer.onAction();
    render();
    expect(calls.reload).toEqual([]);
    expect(calls.save).toHaveLength(0);
  });

  test('after the reload, a new tap offers the page\'s own sizes', async () => {
    open(HERA);
    await tapHeartOn(html, HERA, undefined, moved);
    toast().onAction();
    render();
    await tapHeartOn(html, HERA, undefined, reloaded);
    expect(picker().props.variants.map(v => v.id)).toEqual(heraSizes);
    picker().props.onSelect(picker().props.variants[0]);
    render();
    expect(calls.save.map(c => c.vars.url)).toEqual([variantUrl(HERA, heraSizes[0])]);
    expect(calls.reload).toEqual([HERA]);
  });

  test('after the reload, data that still names another page is an error, and no second reload is offered', async () => {
    open(HERA);
    await tapHeartOn(html, HERA, undefined, moved);
    toast().onAction();
    render();
    await tapHeartOn(html, HERA, undefined, { window: { __NEXT_DATA__: ikas.productData() }, loadedAt: HERA });
    expect(toast()).toMatchObject({ visible: true, message: 'boutique.variantFailed', tone: 'error' });
    expect(toast().actionLabel).toBeUndefined();
    expect(picker().props.variants).toBeNull();
    expect({ save: calls.save.length, reload: calls.reload.length }).toEqual({ save: 0, reload: 1 });
  });
});

// Bağlı butik: sayfa sunucunun verdiği Butika etiketli adresle açılır; paylaşılan adreste etiket kalmaz.
describe('a connected boutique opens with the Butika tagged link', () => {
  const URUN = 'https://lujo.test/urun/elbise?renk=siyah';
  const ETIKETLI = `${URUN}&utm_source=butika&utm_medium=app&utm_campaign=baglanti&utm_content=g-1`;
  const BUTIK = '0b6c2f4e-1111-4222-8333-444455556666';
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const webViews = () => all(tree, n => n.type === WebView);
  afterEach(() => { pilotBiliniyor = false; gonderimYaniti = async (_b, url) => ({ url }); });

  test('known pilot: waits for the tagged address, loads it once, and shares the clean address', async () => {
    pilotBiliniyor = true;
    gonderimYaniti = async () => ({ url: ETIKETLI });
    params = webviewRoute({ boutiqueId: BUTIK, url: URUN, name: 'Lujo' }).params;
    render();
    expect(calls.gonderim).toEqual([{ boutiqueId: BUTIK, url: URUN }]);
    expect(webViews()).toEqual([]);
    await tick();
    render();
    expect(webView().props.source.uri).toBe(ETIKETLI);
    // The store reports the tagged address back; the share button sends it without our tag.
    navigate(ETIKETLI);
    one(n => n.type === TurHedefiMarker && n.props.hedefId === 'webview.paylas').props.children.props.onPress();
    expect(calls.share).toHaveLength(1);
    expect(calls.share[0].url).toBe(URUN);
    expect(calls.share[0].message).not.toContain('utm_');
    expect(calls.gonderim).toHaveLength(1);
  });

  test('known pilot: a failed request opens the original address', async () => {
    pilotBiliniyor = true;
    gonderimYaniti = async () => { throw new Error('offline'); };
    params = webviewRoute({ boutiqueId: BUTIK, url: URUN, name: 'Lujo' }).params;
    render();
    await tick();
    render();
    expect(webView().props.source.uri).toBe(URUN);
  });

  test('not a pilot, or pilot not known: no request, the original page opens on the first render', () => {
    let istendi = false;
    gonderimYaniti = async () => { istendi = true; return { url: ETIKETLI }; };
    for (const bilinen of [false, undefined]) {
      rt.slots = []; reset();
      pilotBiliniyor = bilinen;
      params = webviewRoute({ boutiqueId: BUTIK, url: URUN, name: 'Lujo' }).params;
      // Tek geçiş: ilk çizimde WebView zaten orijinal adresle var (bekleme yok).
      rt.i = 0; rt.effects = []; tree = Screen();
      expect(webView().props.source.uri).toBe(URUN);
      for (const run of rt.effects) run();
      render();
      expect(webView().props.source.uri).toBe(URUN);
    }
    expect(calls.gonderim).toEqual([]);
    expect(istendi).toBe(false);
  });
});
