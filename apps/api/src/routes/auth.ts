import { users } from '@butika/db';
import { appleSignInSchema, countryCodeSchema, googleSignInSchema } from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '../env';
import { verifyAppleIdentityToken } from '../lib/apple-auth';
import { exchangeAppleAuthorizationCode } from '../lib/apple-token';
import { isBlockedReviewAccount, serializeUser } from '../lib/auth';
import { db } from '../lib/db';
import { devGirisAcikMi } from '../lib/dev-auth';
import { ApiError } from '../lib/errors';
import { verifyGoogleIdToken } from '../lib/google-auth';
import { issueTokenPair, verifyToken } from '../lib/jwt';
import { incelemeGirisiAcikMi } from '../lib/inceleme-girisi';
import { cfCountry, isActiveMarket } from '../lib/market';
import { findOrCreateOAuthUser } from '../lib/oauth-user';
import { rateLimit } from '../lib/rate-limit';
import { getClientIp } from '../lib/request-info';

export const authRoutes = new Hono();

// Kaba kuvvet/replay'e karşı IP başına hız sınırı (30 istek / dk).
authRoutes.use('*', async (c, next) => {
  const ip = getClientIp(c) ?? 'unknown';
  if (!rateLimit(`auth:${ip}`, 30, 60_000)) {
    throw new ApiError(429, 'rate_limited', 'çok fazla deneme, lütfen biraz sonra tekrar dene');
  }
  await next();
});

const devSignInSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(64).optional(),
  // Dev login'de hangi pazardan gireceğimizi seçtirir (test için).
  countryCode: countryCodeSchema.optional(),
});

const reviewSignInSchema = z.object({
  countryCode: countryCodeSchema.optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

// POST /auth/dev — yalnız development/test. Production'da DEV_AUTH_ENABLED
// ne olursa olsun kapalı: doğrulamasız e-postayla her hesaba giriş verirdi.
// Mağaza uygulaması bu ucu kullanmaz (giriş Apple/Google/inceleme ile).
authRoutes.post('/dev', zValidator('json', devSignInSchema), async (c) => {
  if (!devGirisAcikMi(env.NODE_ENV, env.DEV_AUTH_ENABLED)) {
    throw ApiError.forbidden('dev sign-in disabled');
  }
  const { email, displayName, countryCode } = c.req.valid('json');
  if (countryCode && !(await isActiveMarket(countryCode))) {
    throw ApiError.badRequest('invalid_country', 'geçersiz veya pasif pazar');
  }

  let [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  if (!user) {
    const fallbackName = displayName ?? email.split('@')[0] ?? 'Misafir';
    [user] = await db
      .insert(users)
      .values({ email, displayName: fallbackName, countryCode: countryCode ?? null })
      .returning();
  } else {
    // Re-login farklı ülkeyle gelirse pazarı güncelle (test kolaylığı).
    await db
      .update(users)
      .set({ lastSeenAt: new Date(), ...(countryCode ? { countryCode } : {}) })
      .where(eq(users.id, user.id));
    if (countryCode) user = { ...user, countryCode };
  }

  if (!user) throw ApiError.internal('user creation failed');

  const tokens = await issueTokenPair(user.id);
  return c.json({ ...tokens, user: serializeUser(user) });
});

// GET /auth/config — istemcinin açılışta sorduğu genel durum.
// Şimdilik yalnız inceleme girişinin açık olup olmadığını bildirir;
// uygulama butonu buna göre gösterir/gizler.
authRoutes.get('/config', (c) => {
  return c.json({
    reviewAuthEnabled: incelemeGirisiAcikMi(env.REVIEW_AUTH_ENABLED === true, cfCountry(c)),
  });
});

// POST /auth/review — mağaza inceleme girişi.
// Yalnız REVIEW_AUTH_ENABLED=true iken çalışır; sabit bir inceleme
// hesabına giriş verir (yönetici değil, sıradan kullanıcı). Onay gelince
// sunucudan kapatılır, uygulamada yeni sürüm gerekmez.
authRoutes.post('/review', zValidator('json', reviewSignInSchema), async (c) => {
  if (!incelemeGirisiAcikMi(env.REVIEW_AUTH_ENABLED === true, cfCountry(c))) {
    throw ApiError.forbidden('review sign-in disabled');
  }
  const { countryCode } = c.req.valid('json');
  if (countryCode && !(await isActiveMarket(countryCode))) {
    throw ApiError.badRequest('invalid_country', 'geçersiz veya pasif pazar');
  }

  const email = env.REVIEW_AUTH_EMAIL;
  let [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email,
        displayName: 'App Review',
        countryCode: countryCode ?? 'TR',
      })
      .returning();
  } else {
    await db
      .update(users)
      .set({ lastSeenAt: new Date(), ...(countryCode ? { countryCode } : {}) })
      .where(eq(users.id, user.id));
    if (countryCode) user = { ...user, countryCode };
  }

  if (!user) throw ApiError.internal('review user creation failed');

  const tokens = await issueTokenPair(user.id);
  return c.json({ ...tokens, user: serializeUser(user) });
});

// POST /auth/apple — Apple identityToken'ı doğrula, kullanıcıyı bul/oluştur, token çifti ver.
authRoutes.post('/apple', zValidator('json', appleSignInSchema), async (c) => {
  const { idToken, rawNonce, displayName, authorizationCode } = c.req.valid('json');
  let identity: Awaited<ReturnType<typeof verifyAppleIdentityToken>>;
  try {
    identity = await verifyAppleIdentityToken(idToken, rawNonce);
  } catch {
    throw ApiError.unauthorized('Apple girişi doğrulanamadı');
  }
  const user = await findOrCreateOAuthUser({
    provider: 'apple',
    sub: identity.sub,
    email: identity.email, // yalnız ilk girişte gelir
    emailVerified: identity.emailVerified,
    name: displayName, // yalnız ilk girişte gelir
  });
  if (authorizationCode) {
    const refreshToken = await exchangeAppleAuthorizationCode(authorizationCode);
    if (refreshToken) {
      await db.update(users).set({ appleRefreshToken: refreshToken }).where(eq(users.id, user.id));
    }
  }
  const tokens = await issueTokenPair(user.id);
  return c.json({ ...tokens, user: serializeUser(user) });
});

// POST /auth/google — Google idToken'ı doğrula, kullanıcıyı bul/oluştur, token çifti ver.
authRoutes.post('/google', zValidator('json', googleSignInSchema), async (c) => {
  const { idToken } = c.req.valid('json');
  let identity: Awaited<ReturnType<typeof verifyGoogleIdToken>>;
  try {
    identity = await verifyGoogleIdToken(idToken);
  } catch {
    throw ApiError.unauthorized('Google girişi doğrulanamadı');
  }
  const user = await findOrCreateOAuthUser({
    provider: 'google',
    sub: identity.sub,
    email: identity.email,
    emailVerified: identity.emailVerified,
    name: identity.name,
    avatar: identity.picture,
  });
  const tokens = await issueTokenPair(user.id);
  return c.json({ ...tokens, user: serializeUser(user) });
});

authRoutes.post('/refresh', zValidator('json', refreshSchema), async (c) => {
  const { refreshToken } = c.req.valid('json');
  let claims: Awaited<ReturnType<typeof verifyToken>>;
  try {
    claims = await verifyToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('invalid refresh token');
  }
  if (claims.type !== 'refresh') {
    throw ApiError.unauthorized('wrong token type');
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, claims.sub), isNull(users.deletedAt)))
    .limit(1);
  if (!user) throw ApiError.unauthorized('user not found');
  if (isBlockedReviewAccount(user)) throw ApiError.unauthorized('review sign-in disabled');

  const tokens = await issueTokenPair(user.id);
  return c.json(tokens);
});

// DELETE /auth/session — stateless: client token'ı atar.
authRoutes.delete('/session', (c) => c.json({ ok: true }));
