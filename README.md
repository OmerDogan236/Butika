# Butika

Türkiye'deki bağımsız butik ve markaları tek bir editoryal vitrinde toplayan mobil keşif uygulaması (iOS & Android). Kullanıcı markaları keşfeder, ürünleri markanın kendi sitesinde inceler, farklı markalardan beğendiklerini tek yerde kaydeder; kaydettiği ürün indirime girdiğinde veya tükenen bedeni yeniden stoğa geldiğinde bildirim alır.

> Bu repo, yayındaki uygulamanın kaynak kodunun inceleme amaçlı paylaşılan bir kopyasıdır. Sunucu adresleri, anahtarlar, hesap bilgileri ve kişisel veriler çıkarılmış, yerlerine yer tutucular (`EAS_PROJECT_ID`, `GOOGLE_WEB_CLIENT_ID` vb.) konmuştur.

## Benim katkım: fiyat düşüşü ve stok bildirim sistemi

- Kaydedilen ürünlerin fiyat ve stok bilgisini sunucu tarafında periyodik okuyan takip altyapısı (Shopify, ikas, WooCommerce, yapılandırılmış veri / JSON-LD okuyucuları)
- Stokta olduğu doğrulanan fiyat düşüşlerinde kullanıcıya özel uygulama içi bildirim + Expo push (outbox, receipt kontrolü, hata durumunda yeniden deneme)
- Beden / renk bazında **"Stok gelince haber ver"** alarmı
- Dış isteklere SSRF koruması ve alan adı politikası (iç ağ, bulut metadata adresleri ve yönlendirme hileleri engellenir)
- Özelliği tek ortam değişkeniyle kapatabilen güvenli açılış anahtarları
- Mobilde bildirim kutusu, bildirime dokununca ürünün açılması
- Birim ve PostgreSQL entegrasyon testleri

Ayrıntılı akış ve kurallar: [`docs/bildirim-sistemi.md`](docs/bildirim-sistemi.md)

## Repo yapısı

```
butika/
├── apps/
│   ├── mobile/          # Expo SDK 54, React Native, Expo Router
│   ├── api/             # Bun + Hono
│   └── admin/           # Next.js yönetim paneli
├── packages/
│   ├── db/              # Drizzle ORM şeması + migration'lar (PostgreSQL)
│   ├── types/           # Paylaşılan Zod şemaları
│   └── design-tokens/   # Renk / tipografi / spacing
└── infra/               # Docker Compose, nginx, deploy script'leri
```

## Teknolojiler

TypeScript, React Native (Expo), Bun, Hono, PostgreSQL, Drizzle ORM, Next.js, Zod, Docker, nginx, Expo Push

## Geliştirme — hızlı başlangıç

Önkoşul: Node 20+, pnpm 10+, Bun 1.2+, Docker + Compose.

```bash
# 1. Bağımlılıkları yükle
pnpm install

# 2. Yerel veritabanı ve MinIO'yu başlat
pnpm docker:dev:up

# 3. Veritabanı şemasını uygula
pnpm db:migrate

# 4. Servisleri ayrı terminallerde çalıştır
pnpm dev:api      # http://localhost:3000
pnpm dev:admin    # http://localhost:3001
pnpm dev:mobile   # Expo Dev Tools açılır
```

Ortam değişkenleri için `apps/api/.env.example`, `apps/mobile/.env.example` ve `infra/.env.example` dosyalarına bakın. Gerçek `.env` dosyaları repoya eklenmez.

## Tasarım sistemi

- **Atmosfer**: Editoryal / dergi lüksü
- **Palet**: krem (`#F8F5F0`) / mürekkep (`#0A0A0A`) / altın (`#9B7E5C`)
- **Tipografi**: Fraunces (başlık) + Inter (metin)
- Detay: `packages/design-tokens/`

## Lisans

Tüm hakları saklıdır. Kod yalnızca inceleme amacıyla paylaşılmıştır; izinsiz kopyalanamaz veya ticari olarak kullanılamaz.
