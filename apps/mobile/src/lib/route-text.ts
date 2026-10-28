// The one way a store address or a free text travels to another screen. Every caller builds
// its route here and the screen reads it back here, so the address arrives exactly as saved.
//
// Measured on expo-router 6.0.23 (tests/route-text.test.mjs): router.push encodes a param once
// (resolveHref) and decodes it twice (parseQueryParams, then useLocalSearchParams). The store
// screen used to decode it a third time, so a saved size's %3A arrived as ':' and %26, %23, %2F
// and %25 changed what the address says. Texts therefore travel as base64url (RFC 4648 §5,
// without padding) of their UTF-8 bytes: no decoding changes that text, and it is decoded here
// exactly once. Anything unreadable is refused, never guessed.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    let code = char.codePointAt(0) ?? 0xfffd;
    // A lone surrogate has no UTF-8 form; it becomes U+FFFD as in any encoder.
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return bytes;
}

export function encodeRouteText(text: string): string {
  const bytes = utf8(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET.charAt((n >> 18) & 63) + ALPHABET.charAt((n >> 12) & 63);
    if (i + 1 < bytes.length) out += ALPHABET.charAt((n >> 6) & 63);
    if (i + 2 < bytes.length) out += ALPHABET.charAt(n & 63);
  }
  return out;
}

export function decodeRouteText(value: unknown): string | null {
  if (typeof value !== 'string' || !value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;
  const bytes: number[] = [];
  let bits = 0;
  let count = 0;
  for (const char of value) {
    bits = (bits << 6) | ALPHABET.indexOf(char);
    count += 6;
    if (count >= 8) {
      count -= 8;
      bytes.push((bits >> count) & 255);
      bits &= (1 << count) - 1;
    }
  }
  // Leftover bits must be zero, so that every text has exactly one spelling.
  if (bits !== 0) return null;
  try {
    // Strict UTF-8: an invalid or overlong sequence throws and is refused.
    return decodeURIComponent(bytes.map(b => `%${b.toString(16).padStart(2, '0')}`).join(''));
  } catch {
    return null;
  }
}

const webAddress = (text: string | null) => {
  if (text === null) return null;
  try {
    return /^https?:$/.test(new URL(text).protocol) ? text : null;
  } catch {
    return null;
  }
};

type Param = string | string[] | undefined;

export type WebviewRoute = {
  boutiqueId: string;
  url: string;
  name?: string | null;
  cover?: string | null;
  kaynak?: string;
  oneriId?: string;
  // Butiğe yönlendirme tıklamasının izi (trackBoutiqueOutboundClick döndürür); verilirse butik
  // ekranı ilk adrese utm ve butika_click ekler (lib/butik-linki).
  iz?: { tik: string; kampanya: string };
};

export function webviewRoute(route: WebviewRoute) {
  return {
    pathname: '/webview' as const,
    params: {
      boutiqueId: route.boutiqueId,
      adres: encodeRouteText(route.url),
      ...(route.name ? { ad: encodeRouteText(route.name) } : {}),
      ...(route.cover ? { kapak: encodeRouteText(route.cover) } : {}),
      ...(route.kaynak && route.oneriId ? { kaynak: route.kaynak, oneriId: route.oneriId } : {}),
      ...(route.iz ? { tik: encodeRouteText(route.iz.tik), kampanya: encodeRouteText(route.iz.kampanya) } : {}),
    },
  };
}

export type WebviewParams = { boutiqueId?: Param; adres?: Param; ad?: Param; kapak?: Param; kaynak?: Param; oneriId?: Param; tik?: Param; kampanya?: Param };

/** Yönlendirme tıklamasının izi; yoksa ya da okunamazsa null (adres izsiz açılır). */
export function readWebviewIz(params: WebviewParams): { tik: string; kampanya: string } | null {
  const tik = decodeRouteText(params.tik);
  const kampanya = decodeRouteText(params.kampanya);
  return tik && kampanya ? { tik, kampanya } : null;
}

/** The store screen's address (http or https only), name and cover; null where unreadable. */
export function readWebviewRoute(params: WebviewParams): { url: string | null; name: string | null; cover: string | null } {
  return { url: webAddress(decodeRouteText(params.adres)), name: decodeRouteText(params.ad), cover: webAddress(decodeRouteText(params.kapak)) };
}

export function commentsRoute(route: { boutiqueId: string; url: string; title: string }) {
  return {
    pathname: '/comments' as const,
    params: { boutiqueId: route.boutiqueId, adres: encodeRouteText(route.url), baslik: encodeRouteText(route.title) },
  };
}

export function readCommentsRoute(params: { adres?: Param; baslik?: Param }): { url: string | null; title: string | null } {
  return { url: webAddress(decodeRouteText(params.adres)), title: decodeRouteText(params.baslik) };
}
