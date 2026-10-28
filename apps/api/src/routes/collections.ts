import { boutiques, collections, savedProductCollections, savedProducts } from '@butika/db';
import {
  collectionBatchCreateSchema,
  collectionCreateSchema,
  collectionUpdateSchema,
} from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthContext, requireAuth } from '../lib/auth';
import { db } from '../lib/db';
import { ApiError } from '../lib/errors';

export const collectionRoutes = new Hono<AuthContext>();

collectionRoutes.use('*', requireAuth);

// GET / — kullanıcının tüm koleksiyonları + her birinin son 4 ürün kapağı + count
collectionRoutes.get('/', async (c) => {
  const userId = c.get('userId');

  const cols = await db
    .select({
      id: collections.id,
      name: collections.name,
      description: collections.description,
      sortOrder: collections.sortOrder,
      createdAt: collections.createdAt,
      updatedAt: collections.updatedAt,
      productCount: sql<number>`count(${savedProductCollections.collectionId})::int`,
    })
    .from(collections)
    .leftJoin(savedProductCollections, eq(savedProductCollections.collectionId, collections.id))
    .where(eq(collections.userId, userId))
    .groupBy(collections.id)
    .orderBy(asc(collections.sortOrder), desc(collections.createdAt));

  if (cols.length === 0) return c.json([]);

  const collectionIds = cols.map((c) => c.id);

  // Her koleksiyon için tüm image_url'leri çek (sıralı), JS'te ilk 4'ünü grupla.
  // Window function yerine bu yaklaşım daha drizzle-native ve v1 cardinality'de yeterli.
  const allCovers = await db
    .select({
      collectionId: savedProductCollections.collectionId,
      imageUrl: savedProducts.imageUrl,
    })
    .from(savedProductCollections)
    .innerJoin(savedProducts, eq(savedProducts.id, savedProductCollections.savedProductId))
    .where(
      and(
        inArray(savedProductCollections.collectionId, collectionIds),
        isNotNull(savedProducts.imageUrl),
      ),
    )
    .orderBy(desc(savedProductCollections.addedAt));

  const coverMap = new Map<string, string[]>();
  for (const row of allCovers) {
    if (!row.imageUrl) continue;
    const list = coverMap.get(row.collectionId) ?? [];
    if (list.length < 4) {
      list.push(row.imageUrl);
      coverMap.set(row.collectionId, list);
    }
  }

  return c.json(
    cols.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      productCount: r.productCount,
      coverUrls: coverMap.get(r.id) ?? [],
    })),
  );
});

// GET /:id — tek koleksiyonun metadata'sı
collectionRoutes.get('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const [row] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, id), eq(collections.userId, userId)))
    .limit(1);
  if (!row) throw ApiError.notFound('collection not found');
  return c.json({
    id: row.id,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

// GET /:id/products — koleksiyondaki ürünler (cursor pagination, en yeni önce)
const productsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

collectionRoutes.get('/:id/products', zValidator('query', productsQuerySchema), async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const { cursor, limit } = c.req.valid('query');

  // Sahiplik doğrula
  const [own] = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.id, id), eq(collections.userId, userId)))
    .limit(1);
  if (!own) throw ApiError.notFound('collection not found');

  const conds = [eq(savedProductCollections.collectionId, id)];
  if (cursor) {
    const [cursorRow] = await db
      .select({ addedAt: savedProductCollections.addedAt })
      .from(savedProductCollections)
      .where(
        and(
          eq(savedProductCollections.collectionId, id),
          eq(savedProductCollections.savedProductId, cursor),
        ),
      )
      .limit(1);
    if (cursorRow) conds.push(lt(savedProductCollections.addedAt, cursorRow.addedAt));
  }

  const rows = await db
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
    .from(savedProductCollections)
    .innerJoin(savedProducts, eq(savedProducts.id, savedProductCollections.savedProductId))
    .innerJoin(boutiques, eq(boutiques.id, savedProducts.boutiqueId))
    .where(and(...conds))
    .orderBy(desc(savedProductCollections.addedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

  return c.json({
    items: items.map((r) => ({
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
    nextCursor,
  });
});

// POST / — yeni koleksiyon
collectionRoutes.post('/', zValidator('json', collectionCreateSchema), async (c) => {
  const userId = c.get('userId');
  const body = c.req.valid('json');
  try {
    const [created] = await db
      .insert(collections)
      .values({
        userId,
        name: body.name,
        description: body.description ?? null,
      })
      .returning();
    if (!created) throw ApiError.internal('create failed');
    return c.json(
      {
        id: created.id,
        name: created.name,
        description: created.description,
        sortOrder: created.sortOrder,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      201,
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes('collections_user_name_unique')) {
      throw ApiError.conflict('name_taken', 'bu isimde bir koleksiyonun zaten var');
    }
    throw err;
  }
});

// PATCH /:id
collectionRoutes.patch('/:id', zValidator('json', collectionUpdateSchema), async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = c.req.valid('json');
  try {
    const [updated] = await db
      .update(collections)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description ?? null } : {}),
        updatedAt: sql`now()`,
      })
      .where(and(eq(collections.id, id), eq(collections.userId, userId)))
      .returning();
    if (!updated) throw ApiError.notFound('collection not found');
    return c.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      sortOrder: updated.sortOrder,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('collections_user_name_unique')) {
      throw ApiError.conflict('name_taken', 'bu isimde bir koleksiyonun zaten var');
    }
    throw err;
  }
});

// DELETE /:id — junction cascade ile temizler
collectionRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const [deleted] = await db
    .delete(collections)
    .where(and(eq(collections.id, id), eq(collections.userId, userId)))
    .returning({ id: collections.id });
  if (!deleted) throw ApiError.notFound('collection not found');
  return c.json({ ok: true });
});

// POST /batch — onboarding'de seçilen şablonları toplu yarat (atomik, duplicate skip)
collectionRoutes.post('/batch', zValidator('json', collectionBatchCreateSchema), async (c) => {
  const userId = c.get('userId');
  const { names } = c.req.valid('json');
  // Unique constraint conflict'leri sessizce skip et
  const created = await db
    .insert(collections)
    .values(names.map((name) => ({ userId, name })))
    .onConflictDoNothing()
    .returning();

  return c.json(
    {
      created: created.length,
      items: created.map((r) => ({
        id: r.id,
        name: r.name,
      })),
    },
    201,
  );
});
