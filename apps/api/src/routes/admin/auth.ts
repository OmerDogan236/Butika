import { adminUsers } from '@butika/db';
import { zValidator } from '@hono/zod-validator';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { env } from '../../env';
import { ADMIN_COOKIE } from '../../lib/admin-auth';
import { db } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import { signAdminAccessToken } from '../../lib/jwt';

export const adminAuthRoutes = new Hono();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

adminAuthRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
  // Sabit-zaman karşılaştırma: kullanıcı bulunamadığında bile argon2.verify çalıştırmak için
  // saplama hash ile karşılaştırırız.
  const fallbackHash =
    '$argon2id$v=19$m=65536,t=3,p=4$gZiV/M1gPc22ElAH/Jh1Hw$CWOrkoo7oJBQ/iyh7uJ0LO2aLEfrHwTWll7H7TvQ8oo';
  const ok = await argon2.verify(admin?.passwordHash ?? fallbackHash, password).catch(() => false);
  if (!admin || !ok) throw ApiError.unauthorized('invalid credentials');

  const token = await signAdminAccessToken(admin.id);
  const maxAge = env.JWT_ACCESS_TTL_SECONDS;

  setCookie(c, ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });

  return c.json({
    token,
    expiresAt: new Date(Date.now() + maxAge * 1000).toISOString(),
    admin: {
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName,
    },
  });
});

adminAuthRoutes.post('/logout', (c) => {
  deleteCookie(c, ADMIN_COOKIE, { path: '/' });
  return c.json({ ok: true });
});
