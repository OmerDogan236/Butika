// apps/api/scripts/kayit-temizle.ts
// Mevcut kayıtların başlığını temizler ve sayfa türünü yazar; ürün olmayan sayfaların
// fiyat takibini bırakır (tracked_product_id = null; satır silinmez).
//
//   Kuru çalıştırma (varsayılan, hiçbir şey yazmaz):
//     bun run apps/api/scripts/kayit-temizle.ts
//   Yazma (kuru çalıştırmanın bastığı adım sayısı --onay ile verilmelidir):
//     bun run apps/api/scripts/kayit-temizle.ts --yaz --onay=57
import { boutiques, savedProducts } from '@butika/db';
import { eq } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { temizlikPlani } from '../src/lib/kayit/temizlik-plani';

const yaz = process.argv.includes('--yaz');
const onay = Number(process.argv.find((a) => a.startsWith('--onay='))?.slice(7) ?? Number.NaN);

const satirlar = await db
  .select({
    id: savedProducts.id,
    url: savedProducts.url,
    title: savedProducts.title,
    butikAdi: boutiques.name,
    sayfaTuru: savedProducts.sayfaTuru,
    trackedProductId: savedProducts.trackedProductId,
  })
  .from(savedProducts)
  .innerJoin(boutiques, eq(boutiques.id, savedProducts.boutiqueId));

const plan = temizlikPlani(satirlar);
const adDegisen = plan.filter((p) => p.eskiAd !== p.yeniAd);
const urunDegil = plan.filter((p) => p.sayfaTuru === 'urun_degil');

for (const p of adDegisen) console.log(`AD  ${p.id.slice(0, 8)}  ${p.eskiAd}\n    →           ${p.yeniAd}`);
for (const p of urunDegil) console.log(`ÜRÜN DEĞİL  ${p.id.slice(0, 8)}  ${p.eskiAd}`);
console.log(
  `\nToplam kayıt: ${satirlar.length} · değişecek: ${plan.length} · adı değişen: ${adDegisen.length} · ` +
    `ürün olmayan: ${urunDegil.length} · takibi bırakılacak: ${plan.filter((p) => p.takibiBirak).length}`,
);

if (!yaz) {
  console.log(`\nKuru çalıştırma: hiçbir şey yazılmadı. Yazmak için: --yaz --onay=${plan.length}`);
  process.exit(0);
}
if (onay !== plan.length) {
  console.error(`Durduruldu: --onay=${plan.length} bekleniyordu. Önce kuru çalıştırıp sonucu kontrol edin.`);
  process.exit(2);
}

await db.transaction(async (tx) => {
  for (const p of plan) {
    await tx
      .update(savedProducts)
      .set({
        title: p.yeniAd,
        sayfaTuru: p.sayfaTuru,
        ...(p.takibiBirak ? { trackedProductId: null } : {}),
      })
      .where(eq(savedProducts.id, p.id));
  }
});
console.log(`Yazıldı: ${plan.length} kayıt.`);
process.exit(0);
