import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

// Kullanıcı akışı iptal ettiğinde (hata DEĞİL — UI hata göstermemeli).
export class AuthCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'AuthCancelled';
  }
}

function errCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const c = (err as { code?: unknown }).code;
    return typeof c === 'string' ? c : undefined;
  }
  return undefined;
}

// ─── Apple ────────────────────────────────────────────────────────────────
export interface ApplePayload {
  idToken: string;
  rawNonce: string;
  displayName?: string;
  authorizationCode?: string;
}

export async function appleAuthPayload(): Promise<ApplePayload> {
  // Ham nonce üret → sha256 hash'ini Apple'a gönder → backend ham nonce'un hash'ini doğrular.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  try {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!cred.identityToken) throw new Error('apple: identityToken yok');
    const name = cred.fullName
      ? [cred.fullName.givenName, cred.fullName.familyName].filter(Boolean).join(' ').trim()
      : '';
    return {
      idToken: cred.identityToken,
      rawNonce,
      displayName: name || undefined,
      authorizationCode: cred.authorizationCode ?? undefined,
    };
  } catch (err) {
    if (errCode(err) === 'ERR_REQUEST_CANCELED') throw new AuthCancelled();
    throw err;
  }
}

// ─── Google ─────────────────────────────────────────────────────────────────
let googleConfigured = false;
export function configureGoogle() {
  if (googleConfigured) return;
  GoogleSignin.configure({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, // idToken aud = webClientId
    scopes: ['email', 'profile'],
  });
  googleConfigured = true;
}

export interface GooglePayload {
  idToken: string;
}

export async function googleAuthPayload(): Promise<GooglePayload> {
  configureGoogle();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    // Yeni sürüm: { type: 'success'|'cancelled', data }. Eski sürüm: doğrudan user.
    const asRecord = res as { type?: string; data?: { idToken?: string }; idToken?: string };
    if (asRecord.type === 'cancelled') throw new AuthCancelled();
    const idToken = asRecord.data?.idToken ?? asRecord.idToken;
    if (!idToken) throw new Error('google: idToken yok');
    return { idToken };
  } catch (err) {
    if (errCode(err) === statusCodes.SIGN_IN_CANCELLED) throw new AuthCancelled();
    throw err;
  }
}
