import { boutiques, commentReports, comments, userBlocks, users } from '@butika/db';
import { commentCreateSchema, commentReportCreateSchema } from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { and, count, desc, eq, inArray, isNull, lt, notInArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthContext, requireAuth } from '../lib/auth';
import { db } from '../lib/db';
import { ApiError } from '../lib/errors';
import { icerikUygunMu } from '../lib/icerik-filtresi';
import { isUniqueViolation } from '../lib/pg-errors';

export const commentRoutes = new Hono<AuthContext>();

commentRoutes.use('*', requireAuth);

const listQuerySchema = z.object({
  url: z.string().url().max(2048),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// GET /comments?url=&cursor=&limit=
// Sondan yeniye, cursor-based pagination. Soft-deleted yorumlar gizlenir.
commentRoutes.get('/', zValidator('query', listQuerySchema), async (c) => {
  const userId = c.get('userId');
  const { url, cursor, limit } = c.req.valid('query');

  const conds = [eq(comments.url, url), isNull(comments.deletedAt)];

  // Engellediğin kullanıcıların yorumlarını gizle.
  const blocked = await db
    .select({ id: userBlocks.blockedUserId })
    .from(userBlocks)
    .where(eq(userBlocks.blockerUserId, userId));
  if (blocked.length > 0) {
    conds.push(
      notInArray(
        comments.userId,
        blocked.map((b) => b.id),
      ),
    );
  }

  if (cursor) {
    const [cursorRow] = await db
      .select({ createdAt: comments.createdAt })
      .from(comments)
      .where(eq(comments.id, cursor))
      .limit(1);
    if (cursorRow) conds.push(lt(comments.createdAt, cursorRow.createdAt));
  }

  const rows = await db
    .select({
      id: comments.id,
      userId: comments.userId,
      boutiqueId: comments.boutiqueId,
      url: comments.url,
      body: comments.body,
      createdAt: comments.createdAt,
      userName: users.displayName,
      userAvatar: users.avatarUrl,
      userGender: users.gender,
      userHeight: users.heightCm,
      userWeight: users.weightKg,
      userShowStats: users.showStatsInComments,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(and(...conds))
    .orderBy(desc(comments.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  return c.json({
    items: items.map((r) => ({
      id: r.id,
      userId: r.userId,
      boutiqueId: r.boutiqueId,
      url: r.url,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      user: {
        id: r.userId,
        displayName: r.userName,
        avatarUrl: r.userAvatar,
        gender: r.userShowStats ? (r.userGender as 'female' | 'male' | null) : null,
        heightCm: r.userShowStats ? r.userHeight : null,
        weightKg: r.userShowStats ? r.userWeight : null,
      },
    })),
    nextCursor,
  });
});

// GET /comments/counts?urls=u1,u2,... — batch count for badge display
const countsQuerySchema = z.object({
  urls: z
    .string()
    .min(1)
    .transform((s) =>
      s
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().url()).min(1).max(50)),
});

commentRoutes.get('/counts', zValidator('query', countsQuerySchema), async (c) => {
  const { urls } = c.req.valid('query');
  const rows = await db
    .select({ url: comments.url, n: count() })
    .from(comments)
    .where(and(inArray(comments.url, urls), isNull(comments.deletedAt)))
    .groupBy(comments.url);
  const map = Object.fromEntries(rows.map((r) => [r.url, Number(r.n)] as const));
  return c.json({ counts: Object.fromEntries(urls.map((u) => [u, map[u] ?? 0] as const)) });
});

commentRoutes.post('/', zValidator('json', commentCreateSchema), async (c) => {
  const userId = c.get('userId');
  const body = c.req.valid('json');

  const [boutique] = await db
    .select({ id: boutiques.id })
    .from(boutiques)
    .where(eq(boutiques.id, body.boutiqueId))
    .limit(1);
  if (!boutique) throw ApiError.badRequest('invalid_boutique', 'boutique not found');

  // App Store Review Guideline 1.2: uygunsuz icerik YAYINLANMADAN once elenmeli.
  // Sikayet ve engelleme ayri maddeler, bunun yerini tutmuyor.
  if (!icerikUygunMu(body.body).uygun) {
    throw ApiError.badRequest('inappropriate_content', 'yorum uygunsuz ifade iceriyor');
  }

  const [created] = await db
    .insert(comments)
    .values({
      userId,
      boutiqueId: body.boutiqueId,
      url: body.url,
      body: body.body.trim(),
    })
    .returning();
  if (!created) throw ApiError.internal('create failed');

  const [user] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      gender: users.gender,
      heightCm: users.heightCm,
      weightKg: users.weightKg,
      showStatsInComments: users.showStatsInComments,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return c.json(
    {
      id: created.id,
      userId: created.userId,
      boutiqueId: created.boutiqueId,
      url: created.url,
      body: created.body,
      createdAt: created.createdAt.toISOString(),
      user: {
        id: userId,
        displayName: user?.displayName ?? '—',
        avatarUrl: user?.avatarUrl ?? null,
        gender: user?.showStatsInComments ? (user.gender as 'female' | 'male' | null) : null,
        heightCm: user?.showStatsInComments ? user.heightCm : null,
        weightKg: user?.showStatsInComments ? user.weightKg : null,
      },
    },
    201,
  );
});

// Soft delete — yalnız kendi yorumunu. (Admin'in /admin/comments/:id endpoint'i ayrı.)
commentRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const [existing] = await db
    .select({ userId: comments.userId, deletedAt: comments.deletedAt })
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1);
  if (!existing) throw ApiError.notFound('comment not found');
  if (existing.deletedAt) return c.json({ ok: true });
  if (existing.userId !== userId) throw ApiError.forbidden('sadece kendi yorumunu silebilirsin');

  await db.update(comments).set({ deletedAt: sql`now()` }).where(eq(comments.id, id));
  return c.json({ ok: true });
});

// Yorumu şikayet et (App Store 1.2 moderasyonu). Aynı yorumu bir kez şikayet edebilirsin.
commentRoutes.post('/:id/report', zValidator('json', commentReportCreateSchema), async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const { reason } = c.req.valid('json');

  const [existing] = await db
    .select({ id: comments.id })
    .from(comments)
    .where(and(eq(comments.id, id), isNull(comments.deletedAt)))
    .limit(1);
  if (!existing) throw ApiError.notFound('comment not found');

  try {
    await db.insert(commentReports).values({ commentId: id, reporterUserId: userId, reason });
  } catch (err) {
    if (isUniqueViolation(err)) return c.json({ ok: true, already: true }); // zaten şikayet etti
    throw err;
  }
  return c.json({ ok: true }, 201);
});
