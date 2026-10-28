// fetch yerine curl. Shopify, Bun fetch'in bağlantısını bot sayıp tek istekte bile
// 429 ("local_rate_limited") döndürüyor; aynı sunucudan curl 200 alıyor. İstekteki
// User-Agent değişmez: çağıran ne gönderiyorsa o gider.
//
// Yönlendirme izlenmez (çağıran elle izler). Adres yalnız http(s) olabilir ve
// --url ile verilir; başlıklarda satır sonu reddedilir; gövde stdin'den gider.
// `baglanAdresi` verilirse curl DNS'e yeniden sormadan o adrese bağlanır
// (önceden doğrulanmış adres; DNS yeniden bağlama yarışını kapatır).

const VARSAYILAN_ZAMAN_ASIMI_SN = 30;
const AYRAC = new TextEncoder().encode('\r\n\r\n');
const CURL_HATALARI: Record<number, string> = {
  6: 'ENOTFOUND',
  7: 'ECONNREFUSED',
  28: 'timeout',
  52: 'ECONNRESET',
  56: 'ECONNRESET',
};
// Bizim taraftaki curl sorunu (seçenek, sertifika deposu, yazma): site hatası değil
const YEREL_CURL_HATALARI = new Set([1, 2, 4, 23, 26, 27, 43, 77]);
const YONTEM = /^[A-Z]{3,7}$/;
const SATIR_SONU = /[\r\n\0]/;

export interface CurlSecenekleri {
  zamanAsimiSn?: number;
  /** Doğrulanmış IP: curl bu adrese bağlanır (--resolve). */
  baglanAdresi?: string;
}

function ayracBul(veri: Uint8Array, bas: number): number {
  for (let i = bas; i + 3 < veri.length; i++) {
    if (
      veri[i] === AYRAC[0] &&
      veri[i + 1] === AYRAC[1] &&
      veri[i + 2] === AYRAC[2] &&
      veri[i + 3] === AYRAC[3]
    )
      return i;
  }
  return -1;
}

function basliklariDuzle(h: RequestInit['headers']): [string, string][] {
  if (!h) return [];
  if (h instanceof Headers) return [...h.entries()];
  if (Array.isArray(h)) return h.map(([k, v]) => [String(k), String(v)]);
  return Object.entries(h).map(([k, v]) => [k, String(v)]);
}

async function govdeBaytlari(govde: RequestInit['body']): Promise<Uint8Array | null> {
  if (govde === null || govde === undefined) return null;
  return new Uint8Array(await new Response(govde).arrayBuffer());
}

function yanitCoz(veri: Uint8Array): Response {
  // 1xx (103 Early Hints vb.) başlık blokları atlanır, son blok asıl yanıttır
  let bas = 0;
  for (;;) {
    const son = ayracBul(veri, bas);
    if (son < 0) throw new Error('curl: yanıt başlığı okunamadı');
    const satirlar = new TextDecoder().decode(veri.subarray(bas, son)).split('\r\n');
    const durum = Number(/^HTTP\/[\d.]+ (\d{3})/.exec(satirlar[0] ?? '')?.[1]);
    if (!durum) throw new Error('curl: durum kodu okunamadı');
    if (durum < 200) {
      bas = son + 4;
      continue;
    }
    const basliklar = new Headers();
    for (const satir of satirlar.slice(1)) {
      const i = satir.indexOf(':');
      if (i > 0) basliklar.append(satir.slice(0, i).trim(), satir.slice(i + 1).trim());
    }
    // curl gövdeyi açtı; uzunluk ve sıkıştırma başlıkları artık doğru değil
    basliklar.delete('content-encoding');
    basliklar.delete('content-length');
    const govdesiz = durum === 204 || durum === 205 || durum === 304;
    return new Response(govdesiz ? null : veri.slice(son + 4), {
      status: durum,
      headers: basliklar,
    });
  }
}

export async function curlIstek(
  girdi: string | URL | Request,
  init: RequestInit = {},
  secenek: CurlSecenekleri = {},
): Promise<Response> {
  const url = typeof girdi === 'string' ? girdi : girdi instanceof URL ? girdi.href : girdi.url;
  let adres: URL;
  try {
    adres = new URL(url);
  } catch {
    throw new Error(`gecersiz_adres: ${url.slice(0, 200)}`);
  }
  if (adres.protocol !== 'http:' && adres.protocol !== 'https:')
    throw new Error(`gecersiz_adres: ${url.slice(0, 200)}`);
  const yontem = (init.method ?? 'GET').toUpperCase();
  if (!YONTEM.test(yontem)) throw new Error(`gecersiz_yontem: ${yontem.slice(0, 20)}`);

  const args = [
    'curl',
    '-sS',
    '--compressed',
    '--max-time',
    String(secenek.zamanAsimiSn ?? VARSAYILAN_ZAMAN_ASIMI_SN),
    '-D',
    '-',
    '-o',
    '-',
    '--proto',
    '=http,https',
  ];
  if (yontem !== 'GET') args.push('--request', yontem);
  for (const [k, v] of basliklariDuzle(init.headers)) {
    if (SATIR_SONU.test(k) || SATIR_SONU.test(v) || k.includes(':'))
      throw new Error('gecersiz_baslik');
    args.push('-H', `${k}: ${v}`);
  }
  const govde = await govdeBaytlari(init.body);
  if (govde) args.push('--data-binary', '@-');
  if (secenek.baglanAdresi) {
    const ip = secenek.baglanAdresi.includes(':')
      ? `[${secenek.baglanAdresi}]`
      : secenek.baglanAdresi;
    const port = adres.port || (adres.protocol === 'https:' ? '443' : '80');
    const host = adres.hostname.replace(/^\[|\]$/g, '');
    args.push('--resolve', `${host}:${port}:${ip}`);
  }
  args.push('--url', adres.href);

  const sinyal = init.signal;
  if (sinyal?.aborted) throw sinyal.reason;
  const surec = Bun.spawn(args, {
    stdin: govde ? 'pipe' : 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (govde && surec.stdin) {
    surec.stdin.write(govde);
    await surec.stdin.end();
  }
  const iptal = () => surec.kill();
  sinyal?.addEventListener('abort', iptal, { once: true });
  try {
    const [cikti, hataCiktisi, kod] = await Promise.all([
      new Response(surec.stdout).arrayBuffer(),
      new Response(surec.stderr).text(),
      surec.exited,
    ]);
    if (sinyal?.aborted) throw sinyal.reason;
    if (YEREL_CURL_HATALARI.has(kod)) throw new Error(`yerel curl hatası (kod ${kod})`);
    if (kod !== 0) {
      const hata = new Error(hataCiktisi.trim().slice(0, 200) || `curl ${kod}`) as Error & {
        code?: string;
      };
      if (CURL_HATALARI[kod] === 'timeout') hata.name = 'TimeoutError';
      else if (CURL_HATALARI[kod]) hata.code = CURL_HATALARI[kod];
      throw hata;
    }
    return yanitCoz(new Uint8Array(cikti));
  } finally {
    sinyal?.removeEventListener('abort', iptal);
  }
}

/** fetch imzasıyla curl (butik kontrolü: 20 sn). */
export const curlFetch = ((girdi: string | URL | Request, init?: RequestInit) =>
  curlIstek(girdi, init, { zamanAsimiSn: 20 })) as unknown as typeof fetch;
