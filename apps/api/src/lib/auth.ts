import { users } from '@butika/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { env } from '../env';
import { db } from './db';
import { ApiError } from './errors';
import { verifyToken } from './jwt';

export type AuthContext = {
  Variables: {
    userId: string;
  };
};

export const requireAuth: MiddlewareHandler<AuthContext> = async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('missing bearer token');
  }
  const token = header.slice('Bearer '.length);

  let claims: Awaited<ReturnType<typeof verifyToken>>;
  try {
    claims = await verifyToken(token);
  } catch {
    throw ApiError.unauthorized('invalid token');
  }
  if (claims.type !== 'access') {
    throw ApiError.unauthorized('wrong token type');
  }
  // Tokens are stateless and outlive both account deletion and the review
  // switch, so every request checks the account itself.
  const user = await findActiveUserById(claims.sub);
  if (!user) {
    throw ApiError.unauthorized('user not found');
  }
  if (isBlockedReviewAccount(user)) {
    throw ApiError.unauthorized('review sign-in disabled');
  }
  c.set('userId', claims.sub);
  await next();
};

// The shared store-review account (same email match as POST /auth/review) is
// usable only while REVIEW_AUTH_ENABLED is on; turning it off ends its sessions.
export function isBlockedReviewAccount(user: { email: string | null }): boolean {
  return !env.REVIEW_AUTH_ENABLED && user.email === env.REVIEW_AUTH_EMAIL;
}

export async function findActiveUserById(userId: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  return user;
}

export function serializeUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    gender: user.gender as 'female' | 'male' | null,
    heightCm: user.heightCm,
    weightKg: user.weightKg,
    showStatsInComments: user.showStatsInComments,
    language: user.language as 'tr' | 'en' | null,
    countryCode: user.countryCode,
    createdAt: user.createdAt.toISOString(),
  };
}
