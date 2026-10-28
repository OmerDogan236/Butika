import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Butik bağlantısı gizli anahtarları (ikas client secret vb.) veritabanında
// yalnız şifreli durur. Biçim: v1.<iv>.<etiket>.<veri>, hepsi base64url.
const SURUM = 'v1';
const IV_BAYT = 12;

function anahtarBuffer(anahtarB64: string): Buffer {
  const anahtar = Buffer.from(anahtarB64, 'base64');
  if (anahtar.length !== 32) throw new Error('sifreleme_anahtari_gecersiz');
  return anahtar;
}

export function sifrele(duz: string, anahtarB64: string): string {
  const iv = randomBytes(IV_BAYT);
  const cipher = createCipheriv('aes-256-gcm', anahtarBuffer(anahtarB64), iv);
  const veri = Buffer.concat([cipher.update(duz, 'utf8'), cipher.final()]);
  return [SURUM, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), veri.toString('base64url')].join('.');
}

export function coz(sifreli: string, anahtarB64: string): string {
  try {
    const [surum, iv, etiket, veri, fazla] = sifreli.split('.');
    if (surum !== SURUM || !iv || !etiket || veri === undefined || fazla !== undefined) {
      throw new Error('biçim');
    }
    const decipher = createDecipheriv('aes-256-gcm', anahtarBuffer(anahtarB64), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(etiket, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(veri, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('sifre_cozulemedi');
  }
}
