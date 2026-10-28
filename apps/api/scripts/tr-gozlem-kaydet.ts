// Türkiye'den okunan fiyat gözlemlerini normal kayıt akışına verir (bkz.
// src/lib/price-tracking/tr-gozlem.ts). İndirim olursa bildirim ve push,
// otomatik fiyat takibindeki gibi kendiliğinden oluşur.
// Varsayılan KURU ÇALIŞMA: yalnız doğrular, hiçbir şey yazmaz. Yazmak için --kaydet.
//
// Sunucuda (API container'ı içinde), girdi stdin'den:
//   docker exec -i butika-api bun run apps/api/scripts/tr-gozlem-kaydet.ts [--kaydet] < gozlem.jsonl
import { type TrGozlem, trGozlemleriIsle } from '../src/lib/price-tracking/tr-gozlem';

const kaydet = process.argv.includes('--kaydet');
const gozlemler = (await Bun.stdin.text())
  .split('\n')
  .filter((s) => s.trim())
  .map((s) => JSON.parse(s) as TrGozlem);

const sonuc = await trGozlemleriIsle(gozlemler, { kaydet });
for (const s of sonuc) console.log(JSON.stringify(s));
const say = (d: string) => sonuc.filter((s) => s.durum === d).length;
const indirim = sonuc.reduce((t, s) => t + (s.indirimBildirimi ?? 0), 0);
console.log(
  `ÖZET ${kaydet ? 'kaydedildi' : 'KURU'}: ${sonuc.length} gözlem, ${say('kaydedildi')} kaydedildi, ${say('reddedildi')} reddedildi, ${indirim} indirim bildirimi`,
);
process.exit(0);
