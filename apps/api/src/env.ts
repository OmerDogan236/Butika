import { z } from 'zod';

// Yalnız yerel geliştirme yedekleri. Production süreci bunlarla açılmayı
// reddeder (productionConfigErrors): eksik bir sır sessizce canlıya çıkamaz.
const DEV_DATABASE_URL = 'postgresql://butika:butika@localhost:5432/butika';
const DEV_JWT_SECRET = 'dev-secret-replace-in-prod-with-32-bytes-min';
const DEV_MINIO_SECRET_KEY = 'butika-dev-secret';

const flag = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

// Arka plan işçisi anahtarı. Boş = production dışında açık, production'da
// kapalı: yeni sürüm önce doğrulanır, sonra .env.production düzenlenip API
// container'ı yeniden oluşturularak açılır (veya hızlıca durdurulur).
const workerSwitch = z.enum(['true', 'false', '1', '0']).optional();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().min(1).default(DEV_DATABASE_URL),

  JWT_SECRET: z.string().min(32).default(DEV_JWT_SECRET),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().default(60 * 60),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().default(60 * 60 * 24 * 30),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3001,http://localhost:8081,http://localhost:19006,https://butika.ai')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),

  APPLE_BUNDLE_ID: z.string().default('app.butika'),
  // Sign in with Apple anahtarı (.p8) — hesap silinince Apple yetkisini iptal etmek
  // (revoke) için. Üçü birden yoksa iptal adımı sessizce atlanır; giriş etkilenmez.
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_SIGNIN_KEY_ID: z.string().optional(),
  APPLE_SIGNIN_PRIVATE_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID_IOS: z.string().optional(),
  GOOGLE_CLIENT_ID_ANDROID: z.string().optional(),
  GOOGLE_CLIENT_ID_WEB: z.string().optional(),

  // Yalnız development/test'te anlamlı. Production'da /auth/dev bu değerden
  // bağımsız olarak kapalıdır: doğrulamasız e-postayla her hesaba giriş verirdi.
  DEV_AUTH_ENABLED: flag,

  // App Store / Play Store inceleme girişi. VARSAYILAN KAPALI.
  // Yalnız mağaza incelemesi sürerken açılır, onay gelince kapatılır —
  // kapatmak için uygulamanın yeni sürümü gerekmez, sunucuyu yeniden
  // başlatmak yeterlidir. Açıkken /auth/review sabit inceleme hesabına
  // giriş verir ve uygulamada "İnceleme Girişi" butonu görünür. Kapalıyken
  // inceleme hesabının önceden verilmiş oturumları da reddedilir.
  REVIEW_AUTH_ENABLED: flag,
  REVIEW_AUTH_EMAIL: z.string().default('review@butika.ai'),

  MINIO_ENDPOINT: z.string().default('http://localhost:9000'),
  MINIO_PUBLIC_URL: z.string().default('http://localhost:9000'),
  MINIO_ACCESS_KEY: z.string().default('butika'),
  MINIO_SECRET_KEY: z.string().default(DEV_MINIO_SECRET_KEY),
  MINIO_BUCKET: z.string().default('butika-uploads'),
  MINIO_REGION: z.string().default('us-east-1'),

  // Butikcan AI — key yoksa endpoint yedek (kategori bazlı) öneriye düşer.
  GEMINI_API_KEY: z.string().optional(),
  // Sabit sürüm: "-latest" takma adı 1 Eki'de 3.5-flash-lite'a geçti, cevaplar 1-26 sn arası oynadı
  GEMINI_MODEL: z.string().default('gemini-3.1-flash-lite'),

  // "Paylaş… → Butika": Instagram hesabının biyografisindeki siteyi Meta'nın business discovery
  // servisiyle okumak için Butika'nın Instagram işletme hesabı kimliği ve erişim anahtarı.
  // Boşsa Butika'da olmayan Instagram hesapları yalnız admin önerisi olur (bkz. lib/instagram-profil).
  META_IG_USER_ID: z.string().optional(),
  META_GRAPH_TOKEN: z.string().optional(),

  // Fiyat kontrol zamanlayıcısı ve push gönderim kuyruğu (bkz. workerSwitch).
  PRICE_TRACKING_ENABLED: workerSwitch,
  PUSH_DELIVERY_ENABLED: workerSwitch,
  // İletişim tarama kuyruğu. Kuyrukta iş yoksa hiçbir şey yapmaz; bu anahtar
  // yalnızca acil durdurma içindir. Varsayılan AÇIK.
  CONTACT_DISCOVERY_ENABLED: workerSwitch,
  // Brevo (tanıtım maili). Anahtar YALNIZ sunucuda; panele/koda girmez.
  BREVO_API_KEY: z.string().min(10).optional(),
  // Webhook'u sahte isteklere karşı koruyan bearer token.
  BREVO_WEBHOOK_TOKEN: z.string().min(16).optional(),
  // GERÇEK butiklere gönderimin ana şalteri. Varsayılan KAPALI; test gönderimi
  // bundan bağımsız çalışır.
  OUTREACH_SENDING_ENABLED: workerSwitch,
  // Haftalık butik değişim dedektörü. Açıkça 'true' yazılmadıkça KAPALI (dev
  // dahil); kapalıyken haftalık tur başlamaz, admin'deki "Şimdi çalıştır" çalışır.
  BOUTIQUE_CHECK_ENABLED: workerSwitch,
  // Kaydedilen ürünleri Gemini ile etiketler (tür/renk/malzeme). Açıkça 'true'
  // yazılmadıkça KAPALI. Günlük sınır: urun-etiketi.ts GUNLUK_SINIR.
  URUN_ETIKET_ENABLED: workerSwitch,
  // Kullanıcı profili hesabı: kayıt/test sonrası anlık + her gece toplu (kullanici_profilleri).
  // Açıkça 'true' yazılmadıkça KAPALI; kapalıyken tabloya hiçbir şey yazılmaz.
  PROFIL_HESAP_ENABLED: workerSwitch,
  // Profili kullanma: vitrinde "Sana özel" sıralaması ve Butikcan ön elemesi profil tablosunu
  // okur. Açıkça 'true' yazılmadıkça KAPALI; kapalıyken ikisi de bugünkü gibi çalışır.
  PROFIL_VITRIN_ENABLED: workerSwitch,
  // Admin "Kullanıcı Profilleri" raporunda isim/e-posta. Açıkça 'true' yazılmadıkça KAPALI;
  // açmadan önce aydınlatma metnine ilgili cümle eklenmeli (spec 2026-10-05 §5).
  PROFIL_RAPOR_KIMLIK_GOSTER: workerSwitch,

  // Butik bağlantısı (ikas). Gizli anahtarlar bu 32 baytlık (base64) anahtarla
  // şifrelenip saklanır. Bu üç ayardan biri eksikse API açılır ama bağlantı özelliği
  // kapalı kalır (BAGLANTI_KULLANILABILIR=false, tek uyarı satırı).
  BAGLANTI_SIFRELEME_ANAHTARI: z.string().optional(),
  // ikas uygulaması (Partner paneli). Gizli anahtar loga yazılmaz.
  IKAS_CLIENT_ID: z.string().optional(),
  IKAS_CLIENT_SECRET: z.string().optional(),
  // ikas'a kayıtlı geri dönüş adresi; yetki adresine birebir yazılır.
  IKAS_YONLENDIRME_URL: z.string().default('https://api.butika.ai/katilim/ikas/geri-donus'),
  // Shopify: Partner'a kayıtlı geri dönüş adresi ve sabit Admin API sürümü.
  SHOPIFY_YONLENDIRME_URL: z.string().default('https://api.butika.ai/katilim/shopify/geri-donus'),
  SHOPIFY_API_SURUMU: z.string().default('2026-10'),
  // Deneme görünürlüğü: yalnız bu kullanıcı kimlikleri (virgülle ayrılmış).
  // Boşsa kimse görmez.
  BAGLANTI_PILOT_KULLANICILARI: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  // Bağlı butik işleri; açıkça 'true' yazılmadıkça KAPALI (dev dahil).
  BAGLANTI_ESITLEME_ENABLED: workerSwitch,
  BAGLANTI_SIPARIS_ENABLED: workerSwitch,
  BAGLANTI_OZET_ENABLED: workerSwitch,
  KATILIM_SAYFASI_URL: z.string().default('https://butika.ai/katil/'),

  // PostHog (ürün analitiği) — push gönderim/teslim olayları için. Mobil
  // uygulamadakiyle aynı "Project API Key"; gizli değildir. Olaylar yalnız
  // production'da gönderilir (dev/test PostHog'u kirletmesin).
  POSTHOG_API_KEY: z.string().default(''),
  POSTHOG_HOST: z.string().default('https://eu.i.posthog.com'),
});

type Source = Record<string, string | undefined>;
type ParsedEnv = z.infer<typeof envSchema>;
export type Env = Omit<
  ParsedEnv,
  | 'PRICE_TRACKING_ENABLED'
  | 'PUSH_DELIVERY_ENABLED'
  | 'CONTACT_DISCOVERY_ENABLED'
  | 'OUTREACH_SENDING_ENABLED'
  | 'BOUTIQUE_CHECK_ENABLED'
  | 'URUN_ETIKET_ENABLED'
  | 'PROFIL_HESAP_ENABLED'
  | 'PROFIL_VITRIN_ENABLED'
  | 'PROFIL_RAPOR_KIMLIK_GOSTER'
  | 'BAGLANTI_ESITLEME_ENABLED'
  | 'BAGLANTI_SIPARIS_ENABLED'
  | 'BAGLANTI_OZET_ENABLED'
> & {
  PRICE_TRACKING_ENABLED: boolean;
  PUSH_DELIVERY_ENABLED: boolean;
  CONTACT_DISCOVERY_ENABLED: boolean;
  OUTREACH_SENDING_ENABLED: boolean;
  BOUTIQUE_CHECK_ENABLED: boolean;
  URUN_ETIKET_ENABLED: boolean;
  PROFIL_HESAP_ENABLED: boolean;
  PROFIL_VITRIN_ENABLED: boolean;
  PROFIL_RAPOR_KIMLIK_GOSTER: boolean;
  BAGLANTI_ESITLEME_ENABLED: boolean;
  BAGLANTI_SIPARIS_ENABLED: boolean;
  BAGLANTI_OZET_ENABLED: boolean;
  /** Şifreleme anahtarı ve ikas uygulama kimliği tamam: katılım yolları ve bağlantı işleri çalışır. */
  BAGLANTI_KULLANILABILIR: boolean;
  /** Eksik ya da geçersiz bağlantı ayarlarının adları (değerleri değil). */
  BAGLANTI_EKSIK_AYARLAR: string[];
};

const unset = (value: string | undefined) => !value?.trim() || /CHANGE_ME/i.test(value);

const validEncryptionKey = (value: string | undefined) =>
  Buffer.from(value ?? '', 'base64').length === 32;

/** Production'ın asla onsuz çalışmaması gereken ayarlar. Değerler yazdırılmaz. */
export function productionConfigErrors(source: Source): string[] {
  const errors: string[] = [];
  if (unset(source.DATABASE_URL) || source.DATABASE_URL === DEV_DATABASE_URL) {
    errors.push('DATABASE_URL must point to the production database');
  }
  if (unset(source.JWT_SECRET) || source.JWT_SECRET === DEV_JWT_SECRET) {
    errors.push('JWT_SECRET must be a unique production secret (min 32 chars)');
  }
  if (unset(source.MINIO_SECRET_KEY) || source.MINIO_SECRET_KEY === DEV_MINIO_SECRET_KEY) {
    errors.push('MINIO_SECRET_KEY must be set');
  }
  return errors;
}

/** Butik bağlantısı için eksik/geçersiz ayar adları; boşsa özellik kullanılabilir. */
function baglantiEksikAyarlari(source: Source): string[] {
  const eksik: string[] = [];
  if (unset(source.BAGLANTI_SIFRELEME_ANAHTARI) || !validEncryptionKey(source.BAGLANTI_SIFRELEME_ANAHTARI)) {
    eksik.push('BAGLANTI_SIFRELEME_ANAHTARI');
  }
  if (unset(source.IKAS_CLIENT_ID)) eksik.push('IKAS_CLIENT_ID');
  if (unset(source.IKAS_CLIENT_SECRET)) eksik.push('IKAS_CLIENT_SECRET');
  return eksik;
}

export function loadEnv(source: Source): Env {
  const parsed = envSchema.parse(source);
  if (parsed.NODE_ENV === 'production') {
    const errors = productionConfigErrors(source);
    if (errors.length) {
      throw new Error(`Invalid production configuration:\n- ${errors.join('\n- ')}`);
    }
  }
  // Production dışında yanlış anahtar hemen fark edilsin; production'da özellik kapanır.
  if (
    parsed.NODE_ENV !== 'production' &&
    parsed.BAGLANTI_SIFRELEME_ANAHTARI &&
    !validEncryptionKey(parsed.BAGLANTI_SIFRELEME_ANAHTARI)
  ) {
    throw new Error('BAGLANTI_SIFRELEME_ANAHTARI must be a base64 encoded 32-byte key');
  }
  const baglantiEksik = baglantiEksikAyarlari(source);
  const baglantiVar = baglantiEksik.length === 0;
  const worker = (value: ParsedEnv['PRICE_TRACKING_ENABLED']) =>
    value === undefined ? parsed.NODE_ENV !== 'production' : value === 'true' || value === '1';
  return {
    ...parsed,
    PRICE_TRACKING_ENABLED: worker(parsed.PRICE_TRACKING_ENABLED),
    PUSH_DELIVERY_ENABLED: worker(parsed.PUSH_DELIVERY_ENABLED),
    // Fiyat/push'tan farklı: production'da da varsayılan AÇIK, çünkü kuyruk boşken
    // sisteme yük bindirmiyor ve sahip paneldeki düğmeyle başlatıyor.
    CONTACT_DISCOVERY_ENABLED:
      parsed.CONTACT_DISCOVERY_ENABLED === undefined
        ? true
        : parsed.CONTACT_DISCOVERY_ENABLED === 'true' || parsed.CONTACT_DISCOVERY_ENABLED === '1',
    // GERÇEK butiklere gönderim: açıkça 'true' yazılmadıkça KAPALI (dev dahil).
    // Test gönderimi bu şalterden bağımsızdır.
    OUTREACH_SENDING_ENABLED:
      parsed.OUTREACH_SENDING_ENABLED === 'true' || parsed.OUTREACH_SENDING_ENABLED === '1',
    BOUTIQUE_CHECK_ENABLED:
      parsed.BOUTIQUE_CHECK_ENABLED === 'true' || parsed.BOUTIQUE_CHECK_ENABLED === '1',
    URUN_ETIKET_ENABLED: parsed.URUN_ETIKET_ENABLED === 'true' || parsed.URUN_ETIKET_ENABLED === '1',
    // Bağlantı ayarları eksikse işler açık yazılsa da başlamaz.
    BAGLANTI_ESITLEME_ENABLED:
      baglantiVar &&
      (parsed.BAGLANTI_ESITLEME_ENABLED === 'true' || parsed.BAGLANTI_ESITLEME_ENABLED === '1'),
    BAGLANTI_SIPARIS_ENABLED:
      baglantiVar &&
      (parsed.BAGLANTI_SIPARIS_ENABLED === 'true' || parsed.BAGLANTI_SIPARIS_ENABLED === '1'),
    BAGLANTI_OZET_ENABLED:
      baglantiVar && (parsed.BAGLANTI_OZET_ENABLED === 'true' || parsed.BAGLANTI_OZET_ENABLED === '1'),
    BAGLANTI_KULLANILABILIR: baglantiVar,
    BAGLANTI_EKSIK_AYARLAR: baglantiEksik,
    PROFIL_HESAP_ENABLED:
      parsed.PROFIL_HESAP_ENABLED === 'true' || parsed.PROFIL_HESAP_ENABLED === '1',
    PROFIL_VITRIN_ENABLED:
      parsed.PROFIL_VITRIN_ENABLED === 'true' || parsed.PROFIL_VITRIN_ENABLED === '1',
    PROFIL_RAPOR_KIMLIK_GOSTER:
      parsed.PROFIL_RAPOR_KIMLIK_GOSTER === 'true' || parsed.PROFIL_RAPOR_KIMLIK_GOSTER === '1',
  };
}

/** Açılışı durdurmayan production bulguları; başlangıç logu ve deploy ön kontrolü için. */
export function configWarnings(config: Env): string[] {
  if (config.NODE_ENV !== 'production') return [];
  const warnings: string[] = [];
  if (config.DEV_AUTH_ENABLED) {
    warnings.push('DEV_AUTH_ENABLED is ignored in production; remove it from the env file');
  }
  if (config.REVIEW_AUTH_ENABLED) {
    warnings.push('REVIEW_AUTH_ENABLED is on; disable it once store review is finished');
  }
  if (config.CORS_ORIGINS.some((origin) => /localhost|127\.0\.0\.1/.test(origin))) {
    warnings.push('CORS_ORIGINS contains a local origin');
  }
  if (!config.BAGLANTI_KULLANILABILIR) {
    warnings.push(
      `Boutique connection feature is disabled: missing or invalid ${config.BAGLANTI_EKSIK_AYARLAR.join(', ')}`,
    );
  }
  return warnings;
}

export const env = loadEnv(process.env);
