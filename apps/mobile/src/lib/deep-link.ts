// Dışarıdan gelen bağlantılar (butika://…, bildirim dışı sistem açılışları) için yönlendirme kuralı.
// Uygulama içi tarayıcı yalnız uygulamanın kendi ekranlarından açılır; dışarıdan gelen bir
// bağlantı herhangi bir siteyi "Butika içinde, bir butiğin adıyla" açtıramaz (oltalama riski).
const BLOCKED_EXTERNAL_ROUTES = new Set(['webview']);
// Yalnız iOS'ta dışarıya kapalı: paylaşımı orada ayrı pencere yapar (targets/paylas). Android'de
// butika://paylasim paylaşım menüsünden gelir; dışarıdan geleni MainActivity gizli işaretle eler.
const BLOCKED_EXTERNAL_ROUTES_IOS = new Set(['paylasim']);

/** Sistemden gelen yolun ilk rota parçasını döndürür: "butika://webview?x" → "webview". */
export function firstRouteSegment(path: string): string {
  let rest = path.trim();
  // Expo Go biçimi: exp://host:port/--/rota
  const expoGo = rest.indexOf('/--/');
  if (expoGo >= 0) rest = rest.slice(expoGo + 4);
  else rest = rest.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ''); // şema (butika://)
  rest = rest.split(/[?#]/)[0] ?? '';
  const segments = rest
    .split('/')
    .map((s) => decodeURIComponentSafe(s).trim().toLowerCase())
    .filter((s) => s.length > 0 && !/^\(.*\)$/.test(s)); // (tabs) gibi grup klasörleri
  return segments[0] ?? '';
}

export function isBlockedExternalPath(path: string, os?: string): boolean {
  const ilk = firstRouteSegment(path);
  return BLOCKED_EXTERNAL_ROUTES.has(ilk) || (os === 'ios' && BLOCKED_EXTERNAL_ROUTES_IOS.has(ilk));
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// Universal Link (iPhone) / App Link (Android): butika.ai'deki bir link uygulamayı doğrudan açar.
// Sistem yolu tam adres olarak verir; uygulama rotasına çevrilir (https://butika.ai/b/vena → /b/vena).
const BUTIKA_WEB = /^https?:\/\/(?:www\.)?butika\.ai(?=[/?#]|$)/i;

export function webLinkToAppPath(path: string): string {
  const trimmed = path.trim();
  const match = trimmed.match(BUTIKA_WEB);
  if (!match) return path;
  const rest = trimmed.slice(match[0].length);
  return rest.startsWith('/') ? rest : `/${rest}`;
}

/** http(s) adresin alan adı, küçük harf ve www'siz; okunamazsa (kullanıcı adı, başka şema) null. */
function anaAlan(url: string): string | null {
  const match = url.trim().match(/^https?:\/\/([^/?#]+)(?:[/?#]|$)/i);
  const host = match?.[1];
  if (!host || host.includes('@') || host.includes('\\')) return null;
  return (
    host
      .toLowerCase()
      .replace(/:\d+$/, '')
      .replace(/^www\./, '')
      .replace(/\.$/, '') || null
  );
}

/**
 * Linkle gelen ürün adresi bu butiğin kendi sitesinde mi? Uygulama içi tarayıcı yalnız butiğin alan
 * adını açar; başka bir site "Butika içinde, bir butiğin adıyla" açılamaz (oltalama).
 */
export function urunButiginMi(urun: string, butikUrl: string): boolean {
  const u = anaAlan(urun);
  return u !== null && u === anaAlan(butikUrl);
}
