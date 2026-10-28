import { userBlocks, users } from '@butika/db';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { type AuthContext, requireAuth } from '../lib/auth';
import { db } from '../lib/db';
import { ApiError } from '../lib/errors';
import { isUniqueViolation } from '../lib/pg-errors';

export const blockRoutes = new Hono<AuthContext>();

blockRoutes.use('*', requireAuth);

// GET /blocks — engellediğin kullanıcılar (yönetim ekranı için).
blockRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const rows = await db
    .select({
      id: userBlocks.blockedUserId,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      createdAt: userBlocks.createdAt,
    })
    .from(userBlocks)
    .innerJoin(users, eq(userBlocks.blockedUserId, users.id))
    .where(eq(userBlocks.blockerUserId, userId))
    .orderBy(desc(userBlocks.createdAt));
  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

// POST /blocks/:userId — kullanıcıyı engelle.
blockRoutes.post('/:userId', async (c) => {
  const userId = c.get('userId');
  const target = c.req.param('userId');
  if (target === userId) throw ApiError.badRequest('self_block', 'kendini engelleyemezsin');

  const [exists] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, target))
    .limit(1);
  if (!exists) throw ApiError.notFound('user not found');

  try {
    await db.insert(userBlocks).values({ blockerUserId: userId, blockedUserId: target });
  } catch (err) {
    if (isUniqueViolation(err)) return c.json({ ok: true, already: true });
    throw err;
  }
  return c.json({ ok: true }, 201);
});

// DELETE /blocks/:userId — engeli kaldır.
blockRoutes.delete('/:userId', async (c) => {
  const userId = c.get('userId');
  const target = c.req.param('userId');
  await db
    .delete(userBlocks)
    .where(and(eq(userBlocks.blockerUserId, userId), eq(userBlocks.blockedUserId, target)));
  return c.json({ ok: true });
});
