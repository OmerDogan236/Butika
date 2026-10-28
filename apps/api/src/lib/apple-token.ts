import { SignJWT, importPKCS8 } from 'jose';
import { env } from '../env';
import { logger } from './logger';

// Sign in with Apple REST API: giriş kodunu refresh token'a çevirir, hesap silinince
// o token'ı iptal eder. Apple, hesap silmeyi sunan uygulamalardan bunu istiyor:
// https://developer.apple.com/support/offering-account-deletion-in-your-app/

const APPLE_AUDIENCE = 'https://appleid.apple.com';
const TOKEN_URL = 'https://appleid.apple.com/auth/token';
const REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const TIMEOUT_MS = 10_000;

export interface AppleSigninKey {
  teamId: string;
  keyId: string;
  privateKey: string; // .p8 içeriği (PEM)
  clientId: string; // uygulamanın bundle id'si
}

export function appleSigninKeyFromEnv(): AppleSigninKey | null {
  const { APPLE_TEAM_ID, APPLE_SIGNIN_KEY_ID, APPLE_SIGNIN_PRIVATE_KEY, APPLE_BUNDLE_ID } = env;
  if (!APPLE_TEAM_ID || !APPLE_SIGNIN_KEY_ID || !APPLE_SIGNIN_PRIVATE_KEY) return null;
  return {
    teamId: APPLE_TEAM_ID,
    keyId: APPLE_SIGNIN_KEY_ID,
    // .env tek satır tuttuğu için satır sonları "\n" olarak yazılabilir.
    privateKey: APPLE_SIGNIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    clientId: APPLE_BUNDLE_ID,
  };
}

// Apple'ın istediği client_secret: ES256 imzalı, en fazla 6 ay geçerli kısa JWT.
export async function createAppleClientSecret(key: AppleSigninKey, now = new Date()) {
  const signingKey = await importPKCS8(key.privateKey, 'ES256');
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: key.keyId })
    .setIssuer(key.teamId)
    .setSubject(key.clientId)
    .setAudience(APPLE_AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 5 * 60)
    .sign(signingKey);
}

async function postForm(url: string, body: Record<string, string>) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

// Girişte telefondan gelen authorizationCode → refresh_token. Başarısızsa null;
// giriş bunu beklemez, yalnız sonradaki iptal imkânı kaybolur.
export async function exchangeAppleAuthorizationCode(code: string): Promise<string | null> {
  const key = appleSigninKeyFromEnv();
  if (!key) return null;
  try {
    const res = await postForm(TOKEN_URL, {
      client_id: key.clientId,
      client_secret: await createAppleClientSecret(key),
      code,
      grant_type: 'authorization_code',
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'apple token exchange failed');
      return null;
    }
    const data = (await res.json()) as { refresh_token?: unknown };
    return typeof data.refresh_token === 'string' ? data.refresh_token : null;
  } catch (err) {
    logger.warn({ err }, 'apple token exchange error');
    return null;
  }
}

// Hesap silinince Apple yetkisini iptal eder. Apple 200 döner; hata olursa false.
export async function revokeAppleRefreshToken(refreshToken: string): Promise<boolean> {
  const key = appleSigninKeyFromEnv();
  if (!key) return false;
  try {
    const res = await postForm(REVOKE_URL, {
      client_id: key.clientId,
      client_secret: await createAppleClientSecret(key),
      token: refreshToken,
      token_type_hint: 'refresh_token',
    });
    if (!res.ok) logger.warn({ status: res.status }, 'apple token revoke failed');
    return res.ok;
  } catch (err) {
    logger.warn({ err }, 'apple token revoke error');
    return false;
  }
}
