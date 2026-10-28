import { boutiques, savedProducts, searchQueries } from '@butika/db';
import { zValidator } from '@hono/zod-validator';
import { type AnyColumn, type SQL, and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthContext, requireAuth } from '../lib/auth';
import { categoryIdsByBoutique } from '../lib/boutique-categories';
import { SQL_HARF_HEDEF, SQL_HARF_KAYNAK, butikAra, harfSadelestir } from '../lib/butik-arama';
import { getCatalog, getPool } from '../lib/butikcan-catalog';
import { ARAMA_AZAMI, butikcanTarzProfili, checkRate, siraBirlestir } from '../lib/butikcan-ortak';
import { butikCinsiyetKosulu, cinsiyetSorgusu } from '../lib/cinsiyet';
import { db } from '../lib/db';
import { chat, isGeminiEnabled } from '../lib/gemini';
import { logger } from '../lib/logger';
import { resolveMarket } from '../lib/market';

export const searchRoutes = new Hono<AuthContext>();

// Harf farkını yok sayan "içerir": "nisantasi" → Nişantaşı, "molene" → Molène.
function harfsizIcerir(kolon: AnyColumn, aranan: string): SQL {
  const kalip = `%${harfSadelestir(aranan).replace(/[\\%_]/g, '\\$&')}%`;
  return sql`lower(translate(${kolon}, ${SQL_HARF_KAYNAK}, ${SQL_HARF_HEDEF})) like ${kalip}`;
}

searchRoutes.use('*', requireAuth);

const querySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((s) => s),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  country: z.string().optional(),
});

// Vitrin arama kutusu: butik adı, ürün ya da tarz → yalnız eşleşen butikler, alakaya göre.
// Her tuşta çağrıldığı için search_queries'e yazılmaz; uygulama 'search' olayını gönderir.
const butikAramaSchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  country: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  cinsiyet: cinsiyetSorgusu,
});

searchRoutes.get('/butikler', zValidator('query', butikAramaSchema), async (c) => {
  const { q, limit, country, categoryId, cinsiyet } = c.req.valid('query');
  const market = await resolveMarket(c, country);
  const bulunan = butikAra(await getPool(market), q, { kategoriId: categoryId, limit });
  if (bulunan.length === 0) return c.json({ query: q, boutiques: [] });

  const rows = await db
    .select({
      id: boutiques.id,
      countryCode: boutiques.countryCode,
      name: boutiques.name,
      description: boutiques.description,
      url: boutiques.url,
      coverImageUrl: boutiques.coverImageUrl,
      logoUrl: boutiques.logoUrl,
      isActive: boutiques.isActive,
      sortOrder: boutiques.sortOrder,
      createdAt: boutiques.createdAt,
    })
    .from(boutiques)
    .where(
      and(
        inArray(
          boutiques.id,
          bulunan.map((b) => b.id),
        ),
        // Seçili vitrin tarafı (KADIN | ERKEK) dışındaki butikler çıkmaz.
        butikCinsiyetKosulu(cinsiyet),
      ),
    );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return c.json({
    query: q,
    boutiques: bulunan.flatMap((b) => {
      const r = byId.get(b.id);
      if (!r) return [];
      return [{ ...r, categoryIds: b.categoryIds ?? [], createdAt: r.createdAt.toISOString() }];
    }),
  });
});

// Vitrin aramasında klavyedeki "Ara" tuşu + cümle: Butikcan'ın anlayışıyla sıralı butikler.
// Sohbet cevabı dönmez, soru butikcan_queries'e YAZILMAZ (arama metni kullanıcıyla eşleşmesin).
const butikcanAramaSchema = z.object({ q: z.string().trim().min(3).max(200) });

searchRoutes.post('/butikler/butikcan', zValidator('json', butikcanAramaSchema), async (c) => {
  const userId = c.get('userId');
  const { q } = c.req.valid('json');
  const market = await resolveMarket(c, c.req.query('country'));

  if (!isGeminiEnabled()) return c.json({ kullanilabilir: false, boutiques: [] });
  const { aiConsent, tarzProfili, kullaniciProfili, userProfile } =
    await butikcanTarzProfili(userId);
  if (!aiConsent) return c.json({ kullanilabilir: false, boutiques: [] });

  if (!checkRate(userId)) {
    return c.json(
      {
        error: { code: 'rate_limited', message: 'Birazcık yavaşlayalım 🙂 birazdan devam edelim!' },
      },
      429,
    );
  }

  const {
    text: catalog,
    ids,
    siraliIdler,
  } = await getCatalog(market, q, tarzProfili, kullaniciProfili);
  let secimler: string[] = [];
  try {
    const res = await chat({ messages: [{ role: 'user', text: q }], catalog, userProfile });
    secimler = res.picks.map((p) => p.id);
  } catch (err) {
    logger.warn({ err }, 'butikcan arama failed');
  }
  const sirali = siraBirlestir(secimler, ids, siraliIdler, ARAMA_AZAMI);
  if (sirali.length === 0) return c.json({ kullanilabilir: true, boutiques: [] });

  const rows = await db
    .select({
      id: boutiques.id,
      countryCode: boutiques.countryCode,
      name: boutiques.name,
      description: boutiques.description,
      url: boutiques.url,
      coverImageUrl: boutiques.coverImageUrl,
      logoUrl: boutiques.logoUrl,
      isActive: boutiques.isActive,
      sortOrder: boutiques.sortOrder,
      createdAt: boutiques.createdAt,
    })
    .from(boutiques)
    .where(and(inArray(boutiques.id, sirali), eq(boutiques.isActive, true)));
  const catMap = await categoryIdsByBoutique(rows.map((r) => r.id));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return c.json({
    kullanilabilir: true,
    boutiques: sirali.flatMap((id) => {
      const r = byId.get(id);
      if (!r) return [];
      return [{ ...r, categoryIds: catMap.get(id) ?? [], createdAt: r.createdAt.toISOString() }];
    }),
  });
});

searchRoutes.get('/', zValidator('query', querySchema), async (c) => {
  const userId = c.get('userId');
  const { q, limit, country } = c.req.valid('query');
  const market = await resolveMarket(c, country);

  const [boutiqueRows, savedRows] = await Promise.all([
    db
      .select({
        id: boutiques.id,
        name: boutiques.name,
        description: boutiques.description,
        url: boutiques.url,
        coverImageUrl: boutiques.coverImageUrl,
        logoUrl: boutiques.logoUrl,
        sortOrder: boutiques.sortOrder,
        createdAt: boutiques.createdAt,
      })
      .from(boutiques)
      .where(
        and(
          eq(boutiques.countryCode, market),
          eq(boutiques.isActive, true),
          or(harfsizIcerir(boutiques.name, q), harfsizIcerir(boutiques.description, q)),
        ),
      )
      .orderBy(asc(boutiques.sortOrder))
      .limit(limit),
    db
      .select({
        id: savedProducts.id,
        boutiqueId: savedProducts.boutiqueId,
        url: savedProducts.url,
        title: savedProducts.title,
        imageUrl: savedProducts.imageUrl,
        description: savedProducts.description,
        createdAt: savedProducts.createdAt,
        boutiqueName: boutiques.name,
        boutiqueCoverImageUrl: boutiques.coverImageUrl,
      })
      .from(savedProducts)
      .innerJoin(boutiques, eq(savedProducts.boutiqueId, boutiques.id))
      .where(and(eq(savedProducts.userId, userId), harfsizIcerir(savedProducts.title, q)))
      .orderBy(desc(savedProducts.createdAt))
      .limit(limit),
  ]);

  // Analytics — best effort, hata atılırsa request düşmesin.
  db.insert(searchQueries)
    .values({
      userId,
      query: q,
      resultCount: boutiqueRows.length + savedRows.length,
    })
    .catch((err) => logger.warn({ err }, 'search_queries insert failed'));

  const catMap = await categoryIdsByBoutique(boutiqueRows.map((r) => r.id));

  return c.json({
    query: q,
    boutiques: boutiqueRows.map((r) => ({
      ...r,
      categoryIds: catMap.get(r.id) ?? [],
      createdAt: r.createdAt.toISOString(),
    })),
    savedProducts: savedRows.map((r) => ({
      id: r.id,
      boutiqueId: r.boutiqueId,
      url: r.url,
      title: r.title,
      imageUrl: r.imageUrl,
      description: r.description,
      createdAt: r.createdAt.toISOString(),
      boutique: {
        id: r.boutiqueId,
        name: r.boutiqueName,
        coverImageUrl: r.boutiqueCoverImageUrl,
      },
    })),
  });
});
