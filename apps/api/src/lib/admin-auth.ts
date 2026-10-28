import { adminUsers } from '@butika/db';
import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { db } from './db';
import { ApiError } from './errors';
import { verifyToken } from './jwt';

export const ADMIN_COOKIE = 'butika_admin_session';

export type AdminContext = {
  Variables: { adminUserId: string };
};

export const requireAdmin: MiddlewareHandler<AdminContext> = async (c, next) => {
  // Önce Authorization header'da Bearer ara (server-to-server için),
  // yoksa cookie'ye düş (tarayıcıdan gelen Next.js server isteği).
  let token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) token = getCookie(c, ADMIN_COOKIE);
  if (!token) throw ApiError.unauthorized('admin session required');

  let claims: Awaited<ReturnType<typeof verifyToken>>;
  try {
    claims = await verifyToken(token);
  } catch {
    throw ApiError.unauthorized('invalid admin token');
  }
  if (claims.type !== 'admin_access') {
    throw ApiError.unauthorized('not an admin session');
  }
  c.set('adminUserId', claims.sub);
  await next();
};

export async function findAdminById(adminUserId: string) {
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, adminUserId)).limit(1);
  return admin;
}
