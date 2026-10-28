import { vitrinAyarlari } from '@butika/db';
import type { VitrinAyarlari } from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthContext, requireAuth } from '../lib/auth';
import { db } from '../lib/db';
import { resolveMarket } from '../lib/market';

export const vitrinAyarlariRoutes = new Hono<AuthContext>();

// Vitrinin geri kalanı (/boutiques) gibi yalnız giriş yapmış kullanıcılara açık.
vitrinAyarlariRoutes.use('*', requireAuth);

const querySchema = z.object({ country: z.string().optional() });

// GET /vitrin-ayarlari?country=TR — seçki başlığı ve mağazadaki son sürümler.
// Pazarın kaydı yoksa her alan null (uygulama kendi varsayılanına düşer).
vitrinAyarlariRoutes.get('/', zValidator('query', querySchema), async (c) => {
  const market = await resolveMarket(c, c.req.valid('query').country);
  const [row] = await db
    .select()
    .from(vitrinAyarlari)
    .where(eq(vitrinAyarlari.countryCode, market))
    .limit(1);
  const yanit: VitrinAyarlari = {
    seckiBasligi: row?.seckiBasligi ?? null,
    guncelSurum: { ios: row?.guncelSurumIos ?? null, android: row?.guncelSurumAndroid ?? null },
  };
  return c.json(yanit);
});
