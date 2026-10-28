import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { configWarnings, env } from './env';
import { startAylikOzetJob } from './lib/baglanti/aylik-ozet-job';
import { startBaglantiEsitlemeJob } from './lib/baglanti/urun-esitleme-job';
import { startSiparisTaramaJob } from './lib/baglanti/siparis-tarama-job';
import { startButikKontrolJob } from './lib/butik-kontrol/butik-kontrol-job';
import { startCleanupJob } from './lib/cleanup';
import { startContactDiscoveryJob } from './lib/contact-discovery/discovery-worker';
import { errorResponse } from './lib/errors';
import { guvenlikBasliklari } from './lib/guvenlik-basliklari';
import { startUrunEtiketiJob } from './lib/kayit/urun-etiketi-job';
import { logger } from './lib/logger';
import { startPriceTrackingJob } from './lib/price-tracking/price-tracking-job';
import { configureRetailerRequestCoordinator } from './lib/price-tracking/retailer-http';
import { databaseRetailerCoordinator } from './lib/price-tracking/retailer-request-coordinator';
import { startProfilGeceJob } from './lib/profil/profil-gece';
import { startBildirimPlaniJob } from './lib/push/bildirim-plani-worker';
import { startPushOutboxJob } from './lib/push/push-outbox-worker';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { blockRoutes } from './routes/blocks';
import { boutiqueApplyRoutes } from './routes/boutique-apply';
import { boutiqueRoutes } from './routes/boutiques';
import { brevoWebhookRoutes } from './routes/brevo-webhook';
import { butikcanRoutes } from './routes/butikcan';
import { categoryRoutes } from './routes/categories';
import { collectionRoutes } from './routes/collections';
import { commentRoutes } from './routes/comments';
import { consentRoutes } from './routes/consent';
import { countryRoutes } from './routes/countries';
import { eventRoutes } from './routes/events';
import { gonderimlerRoutes } from './routes/gonderimler';
import { healthRoutes } from './routes/health';
import { katilimRoutes } from './routes/katilim';
import { meRoutes } from './routes/me';
import { notificationRoutes } from './routes/notifications';
import { pushRoutes } from './routes/push';
import { savedRoutes } from './routes/saved';
import { kayitliButikRoutes } from './routes/kayitli-butikler';
import { searchRoutes } from './routes/search';
import { siparislerRoutes } from './routes/siparisler';
import { suggestionRoutes } from './routes/suggestions';
import { vitrinAyarlariRoutes } from './routes/vitrin-ayarlari';

const app = new Hono();

// Güvenlik başlıkları; yalnız ikas paneli kurulum sayfası ikas içinde çerçevelenebilir.
app.use('*', guvenlikBasliklari);
app.use(
  '*',
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use('*', async (c, next) => {
  const start = performance.now();
  await next();
  const ms = (performance.now() - start).toFixed(1);
  logger.info({ method: c.req.method, path: c.req.path, status: c.res.status, ms }, 'req');
});

app.route('/health', healthRoutes);
app.route('/auth', authRoutes);
app.route('/me', meRoutes);
app.route('/gonderimler', gonderimlerRoutes);
app.route('/siparisler', siparislerRoutes);
app.route('/countries', countryRoutes);
app.route('/categories', categoryRoutes);
app.route('/boutiques', boutiqueRoutes);
app.route('/boutique-apply', boutiqueApplyRoutes);
app.route('/consent', consentRoutes);
app.route('/saved', savedRoutes);
app.route('/kayitli-butikler', kayitliButikRoutes);
app.route('/push', pushRoutes);
app.route('/notifications', notificationRoutes);
app.route('/collections', collectionRoutes);
app.route('/search', searchRoutes);
app.route('/butikcan', butikcanRoutes);
app.route('/comments', commentRoutes);
app.route('/blocks', blockRoutes);
app.route('/suggestions', suggestionRoutes);
app.route('/events', eventRoutes);
app.route('/vitrin-ayarlari', vitrinAyarlariRoutes);
app.route('/admin', adminRoutes);
// Butik katılımı (davet linki, ikas OAuth geri dönüşü, ikas bildirimleri)
app.route('/katilim', katilimRoutes);
// Brevo webhook (bearer token korumali)
app.route('/webhooks/brevo', brevoWebhookRoutes);

app.notFound((c) => c.json({ error: { code: 'not_found', message: 'route not found' } }, 404));

app.onError((err, c) => {
  logger.error({ err }, 'unhandled error');
  return errorResponse(c, err);
});

logger.info(
  {
    port: env.PORT,
    env: env.NODE_ENV,
    priceTracking: env.PRICE_TRACKING_ENABLED,
    pushDelivery: env.PUSH_DELIVERY_ENABLED,
  },
  'api starting',
);
for (const warning of configWarnings(env)) logger.warn(warning);

// KVKK: 30 günden eski silinen hesapları kalıcı silen günlük temizlik işi.
startCleanupJob();
configureRetailerRequestCoordinator(databaseRetailerCoordinator);
// Kontrollü açılış / hızlı durdurma anahtarları için bkz. env.ts workerSwitch.
if (env.PRICE_TRACKING_ENABLED) startPriceTrackingJob();
if (env.PUSH_DELIVERY_ENABLED) startPushOutboxJob();
// Admin'den planlanan duyurular; push anahtarı kapanınca planlar bekler.
if (env.PUSH_DELIVERY_ENABLED) startBildirimPlaniJob();
// İletişim tarama kuyruğu: kuyruk boşsa iş yapmaz, yalnız panelden başlatılınca çalışır.
if (env.CONTACT_DISCOVERY_ENABLED) startContactDiscoveryJob();
// Haftalık butik değişim dedektörü (varsayılan KAPALI).
if (env.BOUTIQUE_CHECK_ENABLED) startButikKontrolJob();
// Bağlı butiklerin ürünleri 4 saatte bir eşitlenir (varsayılan KAPALI).
if (env.BAGLANTI_ESITLEME_ENABLED) startBaglantiEsitlemeJob();
// Bağlı butiklerin siparişleri saatte bir taranır (varsayılan KAPALI); webhook ayrıca anında işler.
if (env.BAGLANTI_SIPARIS_ENABLED) startSiparisTaramaJob();
// Bağlı butiklere aylık özet e-postası (varsayılan KAPALI).
if (env.BAGLANTI_OZET_ENABLED) startAylikOzetJob();
// Kaydedilen ürünlerin etiketlenmesi (varsayılan KAPALI).
if (env.URUN_ETIKET_ENABLED) startUrunEtiketiJob();
// Kullanıcı profili gece hesabı; aynı anahtar anlık hesabı da açar (varsayılan KAPALI).
if (env.PROFIL_HESAP_ENABLED) startProfilGeceJob();

export default {
  port: env.PORT,
  fetch: app.fetch,
};
