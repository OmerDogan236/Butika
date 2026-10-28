import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../env';

// Apple'ın açık imzalama anahtarları (cache'li — jose kendi cache'ler).
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const APPLE_ISSUER = 'https://appleid.apple.com';

export interface AppleIdentity {
  sub: string; // Apple'ın kalıcı kullanıcı kimliği (appleSub)
  email?: string;
  emailVerified?: boolean;
}

// Apple identityToken'ını doğrular: imza + iss + aud(bundle id) + exp + (varsa) nonce.
// rawNonce verilirse, Apple token'ındaki nonce = sha256hex(rawNonce) olmalı (replay koruması).
export async function verifyAppleIdentityToken(
  identityToken: string,
  rawNonce?: string,
): Promise<AppleIdentity> {
  const { payload } = await jwtVerify(identityToken, appleJwks, {
    issuer: APPLE_ISSUER,
    audience: env.APPLE_BUNDLE_ID,
  });

  if (rawNonce) {
    const expected = createHash('sha256').update(rawNonce).digest('hex');
    if (payload.nonce !== expected) {
      throw new Error('apple nonce mismatch');
    }
  }

  if (!payload.sub) throw new Error('apple token missing sub');
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  return {
    sub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    emailVerified,
  };
}
