// Türkiye'deki bir bilgisayarda (sahibin Mac'i) çalışır: sunucunun yurtdışından
// doğru okuyamadığı ürünleri sunucuyla aynı kodla, Türkiye IP'sinden okur.
// Girdi (stdin): satır başına {"id": "<tracked product id>", "url": "<ürün adresi>"}
// Çıktı (stdout): satır başına TrGozlem JSON'u (yalnız TL ile başarılı okumalar).
// Veritabanına dokunmaz; kaydı sunucudaki tr-gozlem-kaydet.ts yapar.
//
//   NODE_ENV=development bun run apps/api/scripts/tr-gozlem-oku.ts < liste.jsonl > gozlem.jsonl
import { pazarBaglami } from '../src/lib/price-tracking/pazar';
import { resolveProductPrice } from '../src/lib/price-tracking/price-source-router';

// Bilgisayar Türkiye dışından (ör. VPN ile) çıkıyorsa hiçbir şey okunmaz.
const iz = await fetch('https://www.cloudflare.com/cdn-cgi/trace', {
  signal: AbortSignal.timeout(15_000),
}).then((r) => r.text());
const ulke = /^loc=([A-Z]{2})$/m.exec(iz)?.[1];
if (ulke !== 'TR') {
  console.error(
    `Durduruldu: bu bilgisayar ${ulke ?? 'bilinmeyen'} ülkesinden çıkıyor, Türkiye değil.`,
  );
  process.exit(2);
}

const satirlar = (await Bun.stdin.text()).split('\n').filter((s) => s.trim());
for (const satir of satirlar) {
  const { id, url } = JSON.parse(satir) as { id: string; url: string };
  try {
    const r = await pazarBaglami.run({ ulke: 'TR' }, () =>
      resolveProductPrice({ url, expectedCurrency: 'TRY', trackedProductId: id }),
    );
    if (r.status === 'success' && r.observation.currency === 'TRY') {
      console.log(
        JSON.stringify({
          id,
          priceMinor: r.observation.priceMinor,
          currency: 'TRY',
          availability: r.observation.availability ?? 'unknown',
          observedAt: r.observation.observedAt.toISOString(),
        }),
      );
    } else {
      console.error(
        `okunamadı ${id}: ${r.status === 'success' ? r.observation.currency : `${r.reason} ${String(r.error).slice(0, 80)}`}`,
      );
    }
  } catch (hata) {
    console.error(`okunamadı ${id}: ${String(hata).slice(0, 120)}`);
  }
}
process.exit(0);
