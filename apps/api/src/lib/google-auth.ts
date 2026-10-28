import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../env';

// Google'ın açık imzalama anahtarları.
const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface GoogleIdentity {
  sub: string; // Google'ın kalıcı kullanıcı kimliği (googleSub)
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
}

function audiences(): string[] {
  return [env.GOOGLE_CLIENT_ID_IOS, env.GOOGLE_CLIENT_ID_ANDROID, env.GOOGLE_CLIENT_ID_WEB].filter(
    (v): v is string => Boolean(v),
  );
}

// Google idToken'ını doğrular: imza + iss + aud(bizim client id'lerimiz) + exp.
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const auds = audiences();
  if (auds.length === 0) {
    throw new Error('GOOGLE_CLIENT_ID_* yapılandırılmamış — Google girişi kapalı');
  }

  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: GOOGLE_ISSUERS,
    audience: auds,
  });

  if (!payload.sub) throw new Error('google token missing sub');
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  return {
    sub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    emailVerified,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
  };
}
