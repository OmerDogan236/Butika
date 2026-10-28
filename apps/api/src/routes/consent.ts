import { consentSubmitSchema } from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { recordConsents } from '../lib/consent';
import { ApiError } from '../lib/errors';
import { verifyToken } from '../lib/jwt';
import { rateLimit } from '../lib/rate-limit';
import { getClientIp } from '../lib/request-info';

// Public (giriş gerektirmez) — web formu, çerez bandı ve mobil kayıt buraya rıza yazar.
// Kullanıcı kimliği (userId) ASLA gövdeden kabul edilmez: yalnız geçerli bir giriş token'ından
// alınır. Aksi hâlde biri, başka bir kullanıcı adına onay yazıp (ör. Butikcan yapay zekâ
// aktarımı) o kişinin verisinin rızası olmadan işlenmesine yol açabilirdi.
export const consentRoutes = new Hono();

async function userIdFromToken(header: string | undefined): Promise<string | null> {
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const claims = await verifyToken(header.slice('Bearer '.length));
    return claims.type === 'access' ? claims.sub : null;
  } catch {
    return null;
  }
}

consentRoutes.post('/', zValidator('json', consentSubmitSchema), async (c) => {
  if (!rateLimit(`consent:${getClientIp(c) ?? 'unknown'}`, 30, 60_000)) {
    throw new ApiError(429, 'rate_limited', 'too many requests');
  }
  const body = c.req.valid('json');
  const tokenUserId = await userIdFromToken(c.req.header('Authorization'));
  if (body.userId && body.userId !== tokenUserId) {
    throw ApiError.unauthorized('userId yalnız giriş yapmış kullanıcının kendisi için yazılabilir');
  }
  const count = await recordConsents(c, { ...body, userId: tokenUserId ?? undefined });
  return c.json({ ok: true, recorded: count }, 201);
});
