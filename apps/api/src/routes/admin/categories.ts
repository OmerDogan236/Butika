import { categories } from '@butika/db';
import { countryCodeSchema } from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { asc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { db } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import { isActiveMarket, resolveMarket } from '../../lib/market';
import { isForeignKeyViolation, isUniqueViolation } from '../../lib/pg-errors';

export const adminCategoryRoutes = new Hono<AdminContext>();

adminCategoryRoutes.use('*', requireAdmin);

const createSchema = z.object({
  countryCode: countryCodeSchema,
  name: z.string().min(1).max(64),
  // Slug serbest girilebilir; yine de slugify'dan geçiriyoruz, bu yüzden
  // Türkçe/boşluk/büyük harf reddedilmez, otomatik temizlenir.
  slug: z.string().max(64).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  // Vitrin tarafı: KADIN | ERKEK geçişinde hangisinde görünür.
  cinsiyet: z.enum(['kadin', 'erkek']).optional(),
});

// Pazar değiştirilemez (countryCode hariç).
const updateSchema = createSchema.omit({ countryCode: true }).partial();

adminCategoryRoutes.get('/', async (c) => {
  const market = await resolveMarket(c, c.req.query('country'));
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.countryCode, market))
    .orderBy(asc(categories.sortOrder));
  return c.json(rows);
});

adminCategoryRoutes.post('/', zValidator('json', createSchema), async (c) => {
  const body = c.req.valid('json');
  // Yalnız aktif pazara içerik eklenebilir (FK var olmayı kontrol eder ama pasif
  // pazara izin verirdi; burada aktiflik şart koşuluyor).
  if (!(await isActiveMarket(body.countryCode))) {
    throw ApiError.badRequest('inactive_market', 'Bu ülke aktif bir pazar değil');
  }
  // Girilen slug'ı da slugify'dan geçir (Türkçe/boşluk temizlensin); boşsa ad'dan üret.
  const slug = slugify(body.slug || body.name);
  // Sıra verilmediyse o pazarın sonuna ekle.
  const sortOrder = body.sortOrder ?? (await nextSortOrder(body.countryCode));
  try {
    const [created] = await db
      .insert(categories)
      .values({
        countryCode: body.countryCode,
        name: body.name,
        slug,
        sortOrder,
        isActive: body.isActive ?? true,
        cinsiyet: body.cinsiyet ?? 'kadin',
      })
      .returning();
    return c.json(created, 201);
  } catch (err) {
    if (isUniqueViolation(err))
      throw ApiError.conflict('slug_taken', 'Bu isimde bir kategori zaten var');
    throw err;
  }
});

adminCategoryRoutes.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  // Slug değiştiriliyorsa onu da temizle.
  const patch = body.slug ? { ...body, slug: slugify(body.slug) } : body;
  try {
    const [updated] = await db
      .update(categories)
      .set(patch)
      .where(eq(categories.id, id))
      .returning();
    if (!updated) throw ApiError.notFound('category not found');
    return c.json(updated);
  } catch (err) {
    if (isUniqueViolation(err))
      throw ApiError.conflict('slug_taken', 'Bu isimde bir kategori zaten var');
    throw err;
  }
});

adminCategoryRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const [deleted] = await db.delete(categories).where(eq(categories.id, id)).returning();
    if (!deleted) throw ApiError.notFound('category not found');
    return c.json({ ok: true });
  } catch (err) {
    if (isForeignKeyViolation(err))
      throw ApiError.conflict('has_boutiques', 'önce bu kategorideki butikleri taşı veya sil');
    throw err;
  }
});

const reorderSchema = z.object({
  items: z
    .array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() }))
    .min(1)
    .max(500),
});

adminCategoryRoutes.post('/reorder', zValidator('json', reorderSchema), async (c) => {
  const { items } = c.req.valid('json');
  await db.transaction(async (tx) => {
    for (const it of items) {
      await tx.update(categories).set({ sortOrder: it.sortOrder }).where(eq(categories.id, it.id));
    }
  });
  return c.json({ ok: true, updated: items.length });
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

async function nextSortOrder(countryCode: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${categories.sortOrder}), -1)` })
    .from(categories)
    .where(eq(categories.countryCode, countryCode));
  return Number(row?.max ?? -1) + 1;
}
