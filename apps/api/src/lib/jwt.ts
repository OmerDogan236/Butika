import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env';

const secret = new TextEncoder().encode(env.JWT_SECRET);

export type TokenType = 'access' | 'refresh' | 'admin_access';

export interface TokenClaims {
  sub: string;
  type: TokenType;
  iat: number;
  exp: number;
}

async function sign(subject: string, type: TokenType, ttlSeconds: number): Promise<string> {
  return new SignJWT({ type })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret);
}

export const signAccessToken = (userId: string) =>
  sign(userId, 'access', env.JWT_ACCESS_TTL_SECONDS);

export const signRefreshToken = (userId: string) =>
  sign(userId, 'refresh', env.JWT_REFRESH_TTL_SECONDS);

export const signAdminAccessToken = (adminUserId: string) =>
  sign(adminUserId, 'admin_access', env.JWT_ACCESS_TTL_SECONDS);

export async function issueTokenPair(userId: string) {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(userId),
    signRefreshToken(userId),
  ]);
  return { accessToken, refreshToken };
}

export async function verifyToken(token: string): Promise<TokenClaims> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as TokenClaims;
}
