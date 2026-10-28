// Bağlı butiğin sayfası açılırken sunucudan Butika etiketli adres istenir (POST /gonderimler).
// Kullanıcı hiç beklemesin: istek hata verirse, süre dolarsa ya da yanıt web adresi değilse
// orijinal adres açılır. Pilot dışı kullanıcıda sunucu adresi aynen geri verir.

export const ETIKETLI_ADRES_SURESI_MS = 1500;

export async function etiketliAdresAl(
  url: string,
  iste: (signal: AbortSignal) => Promise<{ url?: unknown } | null | undefined>,
  sureMs: number = ETIKETLI_ADRES_SURESI_MS,
): Promise<string> {
  const iptal = new AbortController();
  let zamanlayici: ReturnType<typeof setTimeout> | undefined;
  const sureDoldu = new Promise<null>((resolve) => {
    zamanlayici = setTimeout(() => {
      iptal.abort();
      resolve(null);
    }, sureMs);
  });
  try {
    const yanit = await Promise.race([iste(iptal.signal), sureDoldu]);
    const gelen = yanit?.url;
    return typeof gelen === 'string' && /^https?:\/\//i.test(gelen) ? gelen : url;
  } catch {
    return url;
  } finally {
    clearTimeout(zamanlayici);
  }
}
