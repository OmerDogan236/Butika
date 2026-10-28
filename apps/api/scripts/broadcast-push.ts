// Tek seferlik duyuru push'u (fiyat/stok bildirimi DEĞİL). Varsayılan KURU ÇALIŞMA:
// yalnız kime gideceğini sayar, hiçbir şey göndermez. Göndermek için --send ekle.
//
// Sunucuda (API container'ı içinde):
//   docker exec butika-api bun run apps/api/scripts/broadcast-push.ts \
//     --campaign=takipteyiz-2609 --audience=savers \
//     --title="Kaydettiklerin takipte" --body="..."            # kuru çalışma
//   ... aynı komut + --send                                     # gerçekten gönder
//
// --audience=savers  : fiyatı takip edilen ürün kaydetmiş kullanıcılar
// --audience=all     : bildirimi açık tüm kullanıcılar
// --audience=list    : yalnız --user-ids-file=<dosya> içindeki kullanıcılar (satır başına
//                      bir kullanıcı id'si; ör. PostHog'dan çıkarılan eski sürümdekiler)
// Silinmiş hesaplar ve ortak inceleme hesabı (REVIEW_AUTH_EMAIL) hariç. Aynı kampanya
// aynı container'da ikinci kez gönderilmez.
// Token ya da e-posta yazdırmaz.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { duyuruAlicilari, duyuruGonder } from '../src/lib/push/duyuru';

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const campaign = arg('campaign');
const audience = arg('audience');
const title = arg('title');
const body = arg('body');
const send = process.argv.includes('--send');
const userIdsFile = arg('user-ids-file');

if (
  !campaign ||
  !/^[a-z0-9-]{3,60}$/.test(campaign) ||
  !title ||
  !body ||
  (audience !== 'savers' && audience !== 'all' && audience !== 'list') ||
  (audience === 'list' && !userIdsFile)
) {
  console.error(
    'Kullanım: --campaign=<a-z0-9-> --audience=savers|all|list [--user-ids-file=<dosya>] --title="..." --body="..." [--send]',
  );
  process.exit(1);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const listIds =
  audience === 'list' && userIdsFile
    ? [
        ...new Set(
          readFileSync(userIdsFile, 'utf8')
            .split(/\s+/)
            .filter((x) => UUID.test(x)),
        ),
      ]
    : [];
if (audience === 'list' && listIds.length === 0) {
  console.error(`${userIdsFile} içinde geçerli kullanıcı id'si yok.`);
  process.exit(1);
}

const marker = `/tmp/butika-broadcast-${campaign}.done`;
if (send && existsSync(marker)) {
  console.error(
    `"${campaign}" bu container'da zaten gönderilmiş (${marker}). Tekrar gönderilmedi.`,
  );
  process.exit(1);
}

const devices = await duyuruAlicilari(audience, listIds);

const byPlatform = devices.reduce<Record<string, number>>((acc, d) => {
  acc[d.platform] = (acc[d.platform] ?? 0) + 1;
  return acc;
}, {});
console.log(`Kampanya: ${campaign} · kitle: ${audience}`);
console.log(`Başlık: ${title}`);
console.log(`Metin:  ${body}`);
console.log(
  `Alıcı: ${new Set(devices.map((d) => d.userId)).size} kişi, ${devices.length} cihaz`,
  byPlatform,
);

if (!send) {
  console.log('KURU ÇALIŞMA — hiçbir şey gönderilmedi. Göndermek için --send ekle.');
  process.exit(0);
}

const { ok, errors } = await duyuruGonder(devices, { title, body, campaign });
writeFileSync(marker, new Date().toISOString());
console.log(
  `Gönderildi: ${ok}/${devices.length}`,
  Object.keys(errors).length ? { hatalar: errors } : '',
);
// captureServerEvent fire-and-forget; PostHog isteklerinin bitmesi için kısa bekle.
await new Promise((r) => setTimeout(r, 3000));
process.exit(0);
