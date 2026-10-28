import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { env } from '../env';
import { db } from '../lib/db';
import { logger } from '../lib/logger';

export const healthRoutes = new Hono();

// Deploy sonrası kill switch durumunu dışarıdan doğrulamak için.
const workers = () => ({
  priceTracking: env.PRICE_TRACKING_ENABLED,
  pushDelivery: env.PUSH_DELIVERY_ENABLED,
  boutiqueCheck: env.BOUTIQUE_CHECK_ENABLED,
});

healthRoutes.get('/', async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({
      status: 'ok',
      db: 'ok',
      workers: workers(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, 'health: db check failed');
    return c.json(
      {
        status: 'degraded',
        db: 'down',
        workers: workers(),
        timestamp: new Date().toISOString(),
      },
      503,
    );
  }
});
