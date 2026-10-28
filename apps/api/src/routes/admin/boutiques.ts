import { boutiqueCategories, boutiqueSuggestions, boutiques, categories } from '@butika/db';
import {
  BUTIK_ETIKETLERI,
  TARZLAR,
  YAS_ARALIKLARI,
  countryCodeSchema,
  editorAlanlariSchema,
  firsatAlanlariSchema,
} from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { db } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import { hedefYasAlanlari } from '../../lib/hedef-yas';
import { isActiveMarket, resolveMarket } from '../../lib/market';

export const adminBoutiqueRoutes = new Hono<AdminContext>();

adminBoutiqueRoutes.use('*', requireAdmin);

// db.transaction callback'inin tx parametresinin tipi (helper'lara geçirmek için).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const createSchema = z.object({
  countryCode: countryCodeSchema,
  categoryIds: z.array(z.string().uuid()).min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(400).optional().default(''),
  url: z.string().url(),
  coverImageUrl: z.string().url(),
  logoUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional(),
  suggestionId: z.string().uuid().optional(),
  // Hedef yaş aralıkları; elle verilince güven 'yuksek' olur.
  hedefYaslar: z.array(z.enum(YAS_ARALIKLARI)).max(5).nullable().optional(),
  // Editörün Seçimi: işaret, elle sıra, kart notu (hepsi isteğe bağlı).
  ...editorAlanlariSchema.partial().shape,
  // Fırsat sekmesi: işaret, elle sıra, indirim notu (hepsi isteğe bağlı).
  ...firsatAlanlariSchema.partial().shape,
});

// Pazar (countryCode) edit ile değiştirilemez — butik tek pazara sabit.
const updateSchema = createSchema
  .omit({ suggestionId: true, countryCode: true })
  .partial()
  .extend({
    // Elle fiyat segmenti ataması. null = "belirsiz bırak" (karar geri alınır).
    fiyatSegmenti: z.enum(['uygun', 'orta', 'yuksek', 'luks']).nullable().optional(),
    // Elle tarz ataması (en fazla 2). null = etiketsiz bırak.
    tarz1: z.enum(TARZLAR).nullable().optional(),
    tarz2: z.enum(TARZLAR).nullable().optional(),
    // Grup etiketleri (güzellik/parfüm). Tarzdan ayrıdır, tarz testine girmez.
    etiketler: z.array(z.enum(BUTIK_ETIKETLERI)).max(3).optional(),
  });

adminBoutiqueRoutes.get('/', async (c) => {
  const market = await resolveMarket(c, c.req.query('country'));
  const rows = await db
    .select()
    .from(boutiques)
    .where(eq(boutiques.countryCode, market))
    .orderBy(asc(boutiques.sortOrder), asc(boutiques.createdAt));
  const ids = rows.map((r) => r.id);
  const memberships = ids.length
    ? await db
        .select({
          boutiqueId: boutiqueCategories.boutiqueId,
          categoryId: boutiqueCategories.categoryId,
          sortOrder: boutiqueCategories.sortOrder,
        })
        .from(boutiqueCategories)
        .where(inArray(boutiqueCategories.boutiqueId, ids))
    : [];
  const byBoutique = new Map<string, { categoryId: string; sortOrder: number }[]>();
  for (const m of memberships) {
    const list = byBoutique.get(m.boutiqueId) ?? [];
    list.push({ categoryId: m.categoryId, sortOrder: m.sortOrder });
    byBoutique.set(m.boutiqueId, list);
  }
  return c.json(
    rows.map((b) => {
      const ms = byBoutique.get(b.id) ?? [];
      return { ...b, categoryIds: ms.map((m) => m.categoryId), memberships: ms };
    }),
  );
});

adminBoutiqueRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const [row] = await db.select().from(boutiques).where(eq(boutiques.id, id)).limit(1);
  if (!row) throw ApiError.notFound('boutique not found');
  const ms = await db
    .select({
      categoryId: boutiqueCategories.categoryId,
      sortOrder: boutiqueCategories.sortOrder,
    })
    .from(boutiqueCategories)
    .where(eq(boutiqueCategories.boutiqueId, id))
    .orderBy(asc(boutiqueCategories.sortOrder));
  return c.json({ ...row, categoryIds: ms.map((m) => m.categoryId), memberships: ms });
});

adminBoutiqueRoutes.post('/', zValidator('json', createSchema), async (c) => {
  const body = c.req.valid('json');
  // Yalnız aktif pazara butik eklenebilir (pasif/var-olmayan pazara izin verme).
  if (!(await isActiveMarket(body.countryCode))) {
    throw ApiError.badRequest('inactive_market', 'Bu ülke aktif bir pazar değil');
  }
  const { suggestionId, sortOrder, categoryIds, hedefYaslar, ...rest } = body;
  const yasAlanlari = hedefYasAlanlari(null, hedefYaslar);
  const finalSortOrder = sortOrder ?? (await nextSortOrder(rest.countryCode));

  const created = await db.transaction(async (tx) => {
    const [b] = await tx
      .insert(boutiques)
      .values({ ...rest, ...yasAlanlari, sortOrder: finalSortOrder })
      .returning();
    if (!b) throw ApiError.internal('create failed');

    for (const categoryId of categoryIds) {
      const order = await nextSortOrderInCategory(tx, categoryId);
      await tx
        .insert(boutiqueCategories)
        .values({ boutiqueId: b.id, categoryId, sortOrder: order });
    }

    if (suggestionId) {
      await tx
        .update(boutiqueSuggestions)
        .set({ status: 'approved', boutiqueId: b.id, approvedAt: sql`now()` })
        .where(eq(boutiqueSuggestions.id, suggestionId));
    }
    return b;
  });

  return c.json(created, 201);
});

adminBoutiqueRoutes.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const { categoryIds, fiyatSegmenti, tarz1, tarz2, hedefYaslar, ...rest } = c.req.valid('json');

  const updated = await db.transaction(async (tx) => {
    let row = (await tx.select().from(boutiques).where(eq(boutiques.id, id)).limit(1))[0];
    if (!row) return undefined;

    // Fiyat segmenti yalnız GERÇEKTEN DEĞİŞTİYSE elle atanmış sayılır.
    // Aksi hâlde açıklama düzeltmek gibi sıradan bir kayıt bile butiği
    // otomatik hesaplamanın dışına çıkarırdı.
    const segmentAlanlari: Record<string, unknown> = {};
    if (fiyatSegmenti !== undefined && fiyatSegmenti !== row.fiyatSegmenti) {
      segmentAlanlari.fiyatSegmenti = fiyatSegmenti;
      // temsiliFiyatTl her koşulda silinir: hesaplanmış fiyat zaten yanlıştı
      // (elle düzeltmenin sebebi bu) — segment içi sıralamada hayatta kalıp
      // butiği yanlış yere taşımamalı. "Belirsiz bırak" ile de aynı sonuç:
      // butik "hiç hesaplanmadı" durumuna döner.
      segmentAlanlari.temsiliFiyatTl = null;
      if (fiyatSegmenti === null) {
        segmentAlanlari.fiyatGuven = null;
        // Silinen hesaplama bir tarih taşımamalı — otomatik tur bu satırı
        // "60 günden eski" filtresine takılmadan hemen yeniden dener.
        segmentAlanlari.fiyatHesapTarihi = null;
      } else {
        segmentAlanlari.fiyatGuven = 'elle_atandi';
        segmentAlanlari.fiyatHesapTarihi = new Date();
      }
    }

    // Tarz da yalnız GERÇEKTEN DEĞİŞTİYSE elle atanmış sayılır (fiyat segmentiyle aynı mantık).
    const yeniTarz1 = tarz1 === undefined ? row.tarz1 : tarz1;
    let yeniTarz2 = tarz2 === undefined ? row.tarz2 : tarz2;
    if (!yeniTarz1 || yeniTarz2 === yeniTarz1) yeniTarz2 = null; // ikincil, birincil olmadan olmaz
    if (yeniTarz1 !== row.tarz1 || yeniTarz2 !== row.tarz2) {
      Object.assign(segmentAlanlari, {
        tarz1: yeniTarz1,
        tarz2: yeniTarz2,
        tarzGuven: null,
        tarzGerekce: null,
        tarzDurumu: yeniTarz1 ? 'elle_atandi' : null,
        tarzHesapTarihi: yeniTarz1 ? new Date() : null,
      });
    }

    Object.assign(segmentAlanlari, hedefYasAlanlari(row.hedefYaslar, hedefYaslar, row.yasGuven));

    // DİKKAT: koşul ikisini birden kapsamalı. Yalnız segment değişip başka
    // hiçbir alan gelmediğinde (API'ye doğrudan {"fiyatSegmenti":"orta"}
    // gönderildiğinde) rest boş kalır ve güncelleme atlanırdı.
    if (Object.keys(rest).length > 0 || Object.keys(segmentAlanlari).length > 0) {
      const [updated] = await tx
        .update(boutiques)
        .set({ ...rest, ...segmentAlanlari })
        .where(eq(boutiques.id, id))
        .returning();
      if (!updated) throw ApiError.internal('update failed');
      row = updated;
    }

    if (categoryIds) {
      const current = await tx
        .select({ categoryId: boutiqueCategories.categoryId })
        .from(boutiqueCategories)
        .where(eq(boutiqueCategories.boutiqueId, id));
      const currentSet = new Set(current.map((m) => m.categoryId));
      const nextSet = new Set(categoryIds);

      const toRemove = [...currentSet].filter((cid) => !nextSet.has(cid));
      if (toRemove.length > 0) {
        await tx
          .delete(boutiqueCategories)
          .where(
            and(
              eq(boutiqueCategories.boutiqueId, id),
              inArray(boutiqueCategories.categoryId, toRemove),
            ),
          );
      }
      for (const cid of categoryIds) {
        if (!currentSet.has(cid)) {
          const order = await nextSortOrderInCategory(tx, cid);
          await tx
            .insert(boutiqueCategories)
            .values({ boutiqueId: id, categoryId: cid, sortOrder: order });
        }
      }
    }
    return row;
  });

  if (!updated) throw ApiError.notFound('boutique not found');
  return c.json(updated);
});

adminBoutiqueRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  // Junction satırları FK onDelete:cascade ile otomatik silinir.
  const [deleted] = await db.delete(boutiques).where(eq(boutiques.id, id)).returning();
  if (!deleted) throw ApiError.notFound('boutique not found');
  return c.json({ ok: true });
});

// Kategori-bazlı reorder — admin'de seçili sekmedeki sürükle-bırak sonrası.
const reorderSchema = z.object({
  categoryId: z.string().uuid(),
  items: z
    .array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() }))
    .min(1)
    .max(500),
});

adminBoutiqueRoutes.post('/reorder', zValidator('json', reorderSchema), async (c) => {
  const { categoryId, items } = c.req.valid('json');
  await db.transaction(async (tx) => {
    for (const it of items) {
      await tx
        .update(boutiqueCategories)
        .set({ sortOrder: it.sortOrder })
        .where(
          and(
            eq(boutiqueCategories.boutiqueId, it.id),
            eq(boutiqueCategories.categoryId, categoryId),
          ),
        );
    }
  });
  return c.json({ ok: true, updated: items.length });
});

// Kategori taşıma — admin'de satırdaki "Taşı" menüsü. Hedefte yoksa en üste eklenir
// (hedefteki diğer sıralar bir kaydırılır); "tasi" ayrıca kaynak kategoriden çıkarır.
const moveSchema = z
  .object({
    fromCategoryId: z.string().uuid(),
    toCategoryId: z.string().uuid(),
    mode: z.enum(['tasi', 'ekle']),
  })
  .refine((v) => v.fromCategoryId !== v.toCategoryId, { message: 'kaynak ve hedef aynı' });

adminBoutiqueRoutes.post('/:id/move', zValidator('json', moveSchema), async (c) => {
  const id = c.req.param('id');
  const { fromCategoryId, toCategoryId, mode } = c.req.valid('json');

  const sonuc = await db.transaction(async (tx) => {
    const [butik] = await tx
      .select({ countryCode: boutiques.countryCode })
      .from(boutiques)
      .where(eq(boutiques.id, id))
      .limit(1);
    if (!butik) throw ApiError.notFound('boutique not found');

    const kategoriler = await tx
      .select({ id: categories.id, countryCode: categories.countryCode })
      .from(categories)
      .where(inArray(categories.id, [fromCategoryId, toCategoryId]));
    if (kategoriler.length !== 2 || kategoriler.some((k) => k.countryCode !== butik.countryCode)) {
      throw ApiError.badRequest('invalid_category', 'kategori bu butiğin pazarında değil');
    }

    const uyelikler = await tx
      .select({ categoryId: boutiqueCategories.categoryId })
      .from(boutiqueCategories)
      .where(
        and(
          eq(boutiqueCategories.boutiqueId, id),
          inArray(boutiqueCategories.categoryId, [fromCategoryId, toCategoryId]),
        ),
      );
    if (!uyelikler.some((u) => u.categoryId === fromCategoryId)) {
      throw ApiError.badRequest('not_in_category', 'butik kaynak kategoride değil');
    }
    const hedefte = uyelikler.some((u) => u.categoryId === toCategoryId);

    if (!hedefte) {
      await tx
        .update(boutiqueCategories)
        .set({ sortOrder: sql`${boutiqueCategories.sortOrder} + 1` })
        .where(eq(boutiqueCategories.categoryId, toCategoryId));
      await tx
        .insert(boutiqueCategories)
        .values({ boutiqueId: id, categoryId: toCategoryId, sortOrder: 0 });
    }
    if (mode === 'tasi') {
      await tx
        .delete(boutiqueCategories)
        .where(
          and(
            eq(boutiqueCategories.boutiqueId, id),
            eq(boutiqueCategories.categoryId, fromCategoryId),
          ),
        );
    }
    return { ok: true as const, eklendi: !hedefte, cikarildi: mode === 'tasi' };
  });

  return c.json(sonuc);
});

async function nextSortOrder(countryCode: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${boutiques.sortOrder}), -1)` })
    .from(boutiques)
    .where(eq(boutiques.countryCode, countryCode));
  return Number(row?.max ?? -1) + 1;
}

async function nextSortOrderInCategory(tx: Tx, categoryId: string): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number>`coalesce(max(${boutiqueCategories.sortOrder}), -1)` })
    .from(boutiqueCategories)
    .where(eq(boutiqueCategories.categoryId, categoryId));
  return Number(row?.max ?? -1) + 1;
}
