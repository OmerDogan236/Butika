// Deploy ön kontrolü: yeni image içinde `bun run apps/api/src/check-env.ts`.
// Yapılandırmayı API'nin kendi kurallarıyla doğrular; sunucu veya işçi
// başlatmaz, sır değeri yazdırmaz. Geçersizse sıfır olmayan kodla çıkar.
import { configWarnings, env } from './env';

console.log(
  JSON.stringify({
    ok: true,
    nodeEnv: env.NODE_ENV,
    workers: {
      priceTracking: env.PRICE_TRACKING_ENABLED,
      pushDelivery: env.PUSH_DELIVERY_ENABLED,
      boutiqueCheck: env.BOUTIQUE_CHECK_ENABLED,
    },
    warnings: configWarnings(env),
  }),
);
