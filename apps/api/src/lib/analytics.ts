import { env } from '../env';
import { logger } from './logger';

/**
 * Sunucu tarafı PostHog olayı. distinctId = kullanıcı id'si; mobil uygulama
 * identifyUser(user.id) ile aynı kimliği kullandığı için olaylar aynı kişiye düşer.
 * Analitik best-effort'tur: hata yutulur, çağıranı asla bekletmez/bozmaz.
 */
export function captureServerEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown> = {},
): void {
  if (env.NODE_ENV !== 'production' || !env.POSTHOG_API_KEY) return;
  void fetch(`${env.POSTHOG_HOST}/i/v0/e/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: env.POSTHOG_API_KEY,
      event,
      distinct_id: distinctId,
      properties: { ...properties, $lib: 'butika-api' },
      timestamp: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    logger.debug({ event }, 'posthog capture failed');
  });
}
