// Bir adres listesini sunucuyla aynı fiyat okuyucudan geçirir ve her adres için
// hangi sağlayıcının ne dediğini basar. Veritabanına dokunmaz.
//
//   NODE_ENV=development bun run apps/api/scripts/fiyat-teshis.ts < docs/veri-kalitesi/fiyat-teshis-urller.txt
import { pazarBaglami } from '../src/lib/price-tracking/pazar';
import { resolveProductPrice } from '../src/lib/price-tracking/price-source-router';

const iz = await fetch('https://www.cloudflare.com/cdn-cgi/trace', { signal: AbortSignal.timeout(15_000) })
  .then((r) => r.text())
  .catch(() => '');
console.log(`# çıkış ülkesi: ${/^loc=([A-Z]{2})$/m.exec(iz)?.[1] ?? 'bilinmiyor'}`);

let grup = '';
for (const satir of (await Bun.stdin.text()).split('\n')) {
  const s = satir.trim();
  if (!s) continue;
  if (s.startsWith('#')) {
    grup = s.slice(1).trim();
    continue;
  }
  const basla = Date.now();
  try {
    const r = await pazarBaglami.run({ ulke: 'TR' }, () => resolveProductPrice({ url: s, expectedCurrency: 'TRY' }));
    console.log(
      JSON.stringify({
        grup,
        url: s,
        durum: r.status,
        ...(r.status === 'success'
          ? {
              fiyat: r.observation.priceMinor,
              para: r.observation.currency,
              saglayici: r.observation.provider,
              yontem: r.observation.method,
            }
          : { neden: r.reason, hata: r.error }),
        denemeler: r.attempts.map(
          (a) => `${a.provider}:${a.status}${a.reason ? `(${a.reason})` : ''}${a.error ? ` ${a.error.slice(0, 120)}` : ''}`,
        ),
        ms: Date.now() - basla,
      }),
    );
  } catch (e) {
    console.log(JSON.stringify({ grup, url: s, durum: 'istisna', hata: String(e), ms: Date.now() - basla }));
  }
  // Aynı siteye art arda yüklenmemek için.
  await new Promise((r) => setTimeout(r, 2000));
}
process.exit(0);
