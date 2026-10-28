import { categories } from '@butika/db';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthContext, requireAuth } from '../lib/auth';
import { cinsiyetSorgusu } from '../lib/cinsiyet';
import { db } from '../lib/db';
import { kategoriSirala } from '../lib/detayli-test-kategori';
import { logger } from '../lib/logger';
import { resolveMarket } from '../lib/market';
import { kategoriEgilimiIdleri } from './me-detayli-test';

export const categoryRoutes = new Hono<AuthContext>();

// Kategori kurgusu da küratörlük emeğinin parçası; giriş şartına bağlandı.
// (/countries açık kalır — uygulama açılışında, giriş öncesi pazar tespiti için gerekli.)
categoryRoutes.use('*', requireAuth);

const listQuerySchema = z.object({ country: z.string().optional(), cinsiyet: cinsiyetSorgusu });

categoryRoutes.get('/', zValidator('query', listQuerySchema), async (c) => {
  const { country, cinsiyet } = c.req.valid('query');
  const market = await resolveMarket(c, country);
  const rows = await db
    .select({
      id: categories.id,
      countryCode: categories.countryCode,
      slug: categories.slug,
      name: categories.name,
      sortOrder: categories.sortOrder,
      isActive: categories.isActive,
    })
    .from(categories)
    .where(
      and(
        eq(categories.countryCode, market),
        eq(categories.isActive, true),
        eq(categories.cinsiyet, cinsiyet),
      ),
    )
    .orderBy(asc(categories.sortOrder));
  // Detaylı testi olan kişiye özel sıra (spec 2026-10-16 §4). Hata olursa admin sırası.
  try {
    const egilim = await kategoriEgilimiIdleri(c.get('userId'), market);
    if (egilim) return c.json(kategoriSirala(rows, egilim, (k) => k.id));
  } catch (err) {
    logger.warn({ err }, 'kisiye ozel kategori sirasi basarisiz; admin sirasi');
  }
  return c.json(rows);
});
