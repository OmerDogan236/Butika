# Fiyat takibi, fiyat düşüşü ve stok bildirimleri

Kullanıcı bir ürünü butik sayfasında (WebView) beden/renk seçerek kaydeder.
Tek seçenekli üründe (ör. Shopify'ın "Default Title" varyantı) seçici açılmaz,
ürün o varyantla ve kendi adıyla kaydedilir. Sunucu o ürünü takip eder; stokta
olduğu doğrulanan bir fiyat düşüşünde kullanıcıya uygulama içi bildirim ve
push gider. Tükenmiş bir beden için "Stok gelince haber ver" seçilirse o beden
stoğa döndüğünde de bildirim gider. Bildirime dokununca ilgili ürün açılır ve
bildirim okundu olur.

## Akış

WebView kaydet → `saved_products` (kullanıcıya ait) → `tracked_products`
(ürün/varyant başına ortak kayıt) → zamanlayıcı fiyat ve stoğu sunucu
tarafında okur → tek transaction içinde fiyat geçmişi + fiyat düşüşü olayı
(`price_drop_events`) veya stoğa dönüş olayı (`restock_events`) + kullanıcı
bildirimi + `push_outbox` işi → push işçisi Expo'ya gönderir → receipt
kontrolü → bildirime dokununca ürün açılır.

Kod: `apps/api/src/lib/price-tracking/`, `apps/api/src/lib/push/`,
`apps/api/src/routes/{saved,notifications,push}.ts`,
`apps/mobile/src/lib/push-notifications.ts`, `apps/mobile/app/notifications.tsx`.

## Fiyat kuralları

- İlk stoklu sunucu gözlemi başlangıçtır; bildirim üretmez.
- Artış, aynı fiyat, para birimi değişimi, eski veya tekrarlı gözlem ve
  `rebaseline` indirim sayılmaz.
- Yalnız `in_stock` gözlem bildirim açar. `unknown` ve `out_of_stock` fiyat
  geçmişine girer ama son stoklu başlangıç korunur; daha düşük fiyatla stoğa
  dönüş bildirim üretebilir.
- Kullanıcı takibe başlamadan önceki düşüşler ona bildirilmez.
- İstemci/WebView fiyatı ortak kaydı değiştirmez. Tutarlar kuruş (minor
  unit) olarak tutulur.

## Stok gelince haber ver

Kullanıcı tükenmiş bir beden/rengi kaydedip "Stok gelince haber ver"e dokunur:
Kaydedilenler'de, ürün sayfasında ya da beden seçicideki zille (zil, bedeni
kaydedip alarmı tek adımda kurar). O beden stoğa dönünce uygulama içi bildirim
ve push gider: "Stoğa geldi 🎉 — <ürün> tekrar stokta: <fiyat>".

- Alarm kullanıcının kaydındadır (`saved_products.restock_alert_at`); takip
  edilen ürün zaten beden/renk başınadır, yani alarm o bedene özeldir.
- Sunucu o bedeni tükendi gördüyse alarm hemen kurulur (`armed`). Ürün henüz
  hiç kontrol edilmediyse alarm `pending` olur ve ilk "tükendi" gözlemiyle
  kurulur (`restock_confirmed_at`). Stoktaki ürüne (409 `already_in_stock`),
  kontrol edildiği hâlde stoğu okunamayan ürüne (409 `stock_unknown`) ve butik
  dışı bağlantıya (409 `restock_unavailable`) alarm kurulmaz.
- Yalnız kurulmuş alarm bildirim üretir, bir kez: ilk stoklu gözlemde bildirim
  gider ve alarm kapanır. `pending` alarm, ürün tükendi görülmeden stokta
  bulunursa bildirimsiz kapanır. `unknown` gözlem alarmı ne tetikler ne
  kapatır; `rebaseline` sayılmaz.
- Aynı gözlemde fiyat da düştüyse alarmı olan kullanıcıya yalnız "stoğa geldi"
  gider (mesajda eski → yeni fiyat); ayrıca fiyat düşüşü push'u gitmez.
- Beden değiştirilince alarm kapanır. Silinmiş hesaba bildirim gitmez.

## Kapsam ve güvenlik

- Takip yalnız kaydedilen butiğin kendi sitesindeki bağlantılar için açılır
  (aynı host, alt alan adı veya üst alan adı). Diğer bağlantılar yine
  kaydedilir; uygulamada "Bu bağlantı için fiyat takibi yok" görünür.
- Sunucunun mağazalara attığı istekler: yalnız http/https, port 80/443, URL
  içinde kimlik bilgisi yok; iç veya özel adreslere (DNS sonucu dahil) gidilmez;
  her yönlendirme adımı ayrıca kontrol edilir (en fazla 5); yanıt 10 MB ile
  sınırlıdır. Kalan risk DNS rebinding'dir; sunucuda API container'ından özel
  ağlara çıkışı engelleyen bir egress kuralı daha güçlü korumadır.
- Push ve bildirim kutusu içeriği her kullanıcının kendi kaydettiği başlık ve
  linkten oluşur; bir kullanıcının yazdığı metin başkasına gösterilmez.
- Hesap silinince (30 günlük yumuşak silme) push cihazları hemen kapanır;
  silinmiş hesaba yeni bildirim veya push gitmez.
- Kayıt isteği kullanıcı başına dakikada 60 ile sınırlıdır.

## Push teslimatı

- Her bildirim/cihaz çifti için tek iş; 60 sn lease, en fazla 6 gönderim
  denemesi (artan bekleme), 24 saat iş ömrü; ilk receipt 15 dk sonra sorgulanır.
- Göndermeden hemen önce yeniden kontrol edilir: cihaz sahibi ve token, hesap
  silinmemiş, kayıt duruyor, fiyat hâlâ bildirimdeki fiyat, stok kanıtı ve
  son 24 saatte başarılı kontrol. Koşul kalktıysa push iptal edilir; uygulama
  içi bildirim kalır.
- `delivered`, FCM/APNs kabul makbuzudur; telefonda görüldüğünün kanıtı
  değildir. Ağ yanıtı kaybolursa aynı push iki kez gelebilir.

## Zamanlama

- Zamanlayıcı 60 sn'de bir çalışır; turda 25 ürün, 2 işçi. Sağlıklı ürün
  24 saatte bir kontrol edilir; yeni kaydedilen ürün sonraki turda kontrol
  edilir. Stok alarmı olan ve stokta olmayan beden 6 saatte bir kontrol
  edilir; alarm kurulunca sonraki kontrol en geç 6 saat sonraya çekilir. Hata
  sonrası bekleme 15 dk'dan 6 saate kadar artar (engellenmede 30 dk'dan
  başlar). "Anında bildirim" değildir.
- Site başına 1 sn, genel 300 ms, Shopify genel uçları için 3 sn istek
  aralığı; 403/429/503'te bekleme. Aralıklar veritabanında paylaşılır.

## API

- `GET /saved` → her kayıtta `tracking.status`: `pending`, `active`,
  `out_of_stock`, `unverified`, `retrying`, `paused`, `unsupported`; ve
  `restockAlert`: `off`, `pending`, `armed`
- `PATCH /saved/:id/variant` → aynı ürün sayfasında beden/renk değişimi
- `PUT /saved/:id/restock-alert` → `{ restockAlert: 'armed' | 'pending' }`;
  `DELETE /saved/:id/restock-alert` → `{ restockAlert: 'off' }`
- `GET /notifications?limit=30&cursor=<id>` (her öğede `type`: `price_drop`
  veya `back_in_stock`), `GET /notifications/unread-count`
- `PATCH /notifications/:id/read`, `PATCH /notifications/events/:id/read`
- `POST /push/devices`, `DELETE /push/devices/:installationId`

Hepsi oturum gerektirir ve kullanıcıya göre filtrelenir.

## İşletim

- `PRICE_TRACKING_ENABLED`, `PUSH_DELIVERY_ENABLED`: boşsa geliştirmede açık,
  production'da kapalı. Açmak/durdurmak için `.env.production`'ı değiştirip:
  `docker compose -f infra/docker-compose.prod.yml --env-file .env.production up -d api`.
  Durum `/health` yanıtındaki `workers` alanında görünür.
- `EXPO_ACCESS_TOKEN`: Expo projesinde "Enhanced Security for Push" açıksa gerekir.
- Production eksik veya dev sırla (`JWT_SECRET`, `DATABASE_URL`,
  `MINIO_SECRET_KEY`) açılmaz; ön kontrol: `bun run apps/api/src/check-env.ts`.

İzleme sorguları:

```sql
select status, count(*) from push_outbox group by 1;
select last_error, count(*) from push_outbox where status = 'failed' group by 1 order by 2 desc;
select tracking_status, availability, count(*) from tracked_products group by 1, 2;
-- takibe bağlanmayı bekleyen eski kayıtlar (butik dışı bağlantılar kalıcı olarak burada kalır)
select count(*) from saved_products where tracked_product_id is null;
-- geciken kontroller
select count(*) from tracked_products where tracking_status = 'active' and next_check_at < now() - interval '1 hour';
-- bekleyen stok alarmları (armed = sunucu tükendi gördü)
select restock_confirmed_at is not null as armed, count(*) from saved_products where restock_alert_at is not null group by 1;
select type, count(*) from notifications group by 1;
```

## Test

```bash
pnpm typecheck
pnpm --filter @butika/api test
bun test apps/mobile/tests/saved-variant.test.mjs   # bun:test kullanır, node --test ile çalışmaz
bun test apps/mobile/tests/lutvelizade-variant.test.mjs   # uygulamanın beden seçicisi ve sunucu okuyucusu aynı sayfada
bun test apps/mobile/tests/jimmykey-variant.test.mjs   # Jimmy Key: ürün + renk + beden kimliği, seçici ve okuyucu aynı sayfada
bun test apps/mobile/tests/webview-variant-flow.test.mjs   # webview.tsx'in kendi kayıt callback'leri; sahte modüllerle, ekran/WebView değil
```

PostgreSQL entegrasyon testleri yalnız ayrı, yerel ve adı
`butika_notification_test` ile başlayan bir veritabanında çalışır (test URL
verilmezse atlanır). Her dosya ayrı süreçte çalıştırılmalıdır:

```powershell
docker exec butika-postgres-dev createdb -U butika butika_notification_test_1
$env:DATABASE_URL='postgresql://butika:butika@localhost:5432/butika_notification_test_1'
pnpm --filter @butika/db migrate
$env:BUTIKA_NOTIFICATION_TEST_URL=$env:DATABASE_URL
pnpm --filter @butika/api exec bun test src/lib/price-tracking/notifications.integration.test.ts
pnpm --filter @butika/api exec bun test src/lib/price-tracking/scheduler.integration.test.ts
pnpm --filter @butika/api exec bun test src/lib/price-tracking/release-safety.integration.test.ts
pnpm --filter @butika/api exec bun test src/lib/price-tracking/restock.integration.test.ts
pnpm --filter @butika/api exec bun test src/lib/price-tracking/lutvelizade-size-decision.integration.test.ts
pnpm --filter @butika/api exec bun test src/lib/price-tracking/newinshop-size-decision.integration.test.ts
pnpm --filter @butika/api exec bun test src/lib/price-tracking/jimmykey-size-decision.integration.test.ts
pnpm --filter @butika/api exec bun test src/lib/price-tracking/bsl-size-decision.integration.test.ts
pnpm --filter @butika/api exec bun test src/lib/price-tracking/jimmykey-selected-size-decision.integration.test.ts
pnpm --filter @butika/api exec bun test src/lib/push/broadcast-push.integration.test.ts
Remove-Item Env:DATABASE_URL, Env:BUTIKA_NOTIFICATION_TEST_URL
```

Testlerde mağaza ve Expo istekleri taklit edilir; dışarı push gitmez. Geliştirme
veya üretim veritabanında çalıştırmayın.

## Bilinen sınırlar

- Her mağazanın fiyat/stok bilgisi okunamayabilir; stok doğrulanamayan üründe
  bilerek bildirim açılmaz. Stok alarmı yalnız stoğu beden/renk bazında
  okunabilen mağazalarda çalışır; mağaza okuyucusu stoğu yanlış okursa yanlış
  "stoğa geldi" gidebilir.
- Başkasının Expo push token'ını bilen biri o cihazın kaydını kendi hesabına
  alabilir; tokenlar herkese açık değildir.
- Ortak inceleme hesabı (`REVIEW_AUTH_EMAIL`) uygulama içi bildirim alır ama
  push almaz. Kural `REVIEW_AUTH_ENABLED`'dan bağımsızdır; kuyruktaki işler de
  gönderim anında iptal edilir. Tek seferlik duyuru betiği
  (`scripts/broadcast-push.ts`) de bu hesabı alıcılardan çıkarır. Bu hesapla
  telefonda push sınanamaz; teslim ayrı bir test hesabıyla doğrulanır.
