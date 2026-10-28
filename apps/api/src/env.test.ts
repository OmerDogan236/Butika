import { expect, test } from 'bun:test';
import { configWarnings, loadEnv } from './env';

const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://butika:strong-password@db.internal:5432/butika',
  JWT_SECRET: 'x'.repeat(64),
  MINIO_SECRET_KEY: 'minio-production-secret',
  BAGLANTI_SIFRELEME_ANAHTARI: Buffer.alloc(32, 7).toString('base64'),
  IKAS_CLIENT_ID: 'ikas-istemci',
  IKAS_CLIENT_SECRET: 'ikas-gizli',
};

test('production refuses development fallbacks and template placeholders', () => {
  expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(
    /DATABASE_URL[\s\S]*JWT_SECRET[\s\S]*MINIO_SECRET_KEY/,
  );
  expect(() =>
    loadEnv({ ...production, JWT_SECRET: 'dev-secret-replace-in-prod-with-32-bytes-min' }),
  ).toThrow('JWT_SECRET');
  expect(() => loadEnv({ ...production, MINIO_SECRET_KEY: 'CHANGE_ME_24_CHARS' })).toThrow(
    'MINIO_SECRET_KEY',
  );
  expect(() => loadEnv(production)).not.toThrow();
});

test('configuration errors name the setting without echoing its value', () => {
  const value = 'CHANGE_ME-but-a-secret-looking-value-1234567890';
  let message = '';
  try {
    loadEnv({ ...production, JWT_SECRET: value });
  } catch (error) {
    message = String(error);
  }
  expect(message).toContain('JWT_SECRET');
  expect(message).not.toContain(value);
});

test('workers stay off in production until explicitly enabled', () => {
  const off = loadEnv(production);
  expect([off.PRICE_TRACKING_ENABLED, off.PUSH_DELIVERY_ENABLED]).toEqual([false, false]);
  const on = loadEnv({ ...production, PRICE_TRACKING_ENABLED: 'true', PUSH_DELIVERY_ENABLED: '1' });
  expect([on.PRICE_TRACKING_ENABLED, on.PUSH_DELIVERY_ENABLED]).toEqual([true, true]);
  const dev = loadEnv({ NODE_ENV: 'development' });
  expect([dev.PRICE_TRACKING_ENABLED, dev.PUSH_DELIVERY_ENABLED]).toEqual([true, true]);
  expect(
    loadEnv({ NODE_ENV: 'development', PUSH_DELIVERY_ENABLED: 'false' }).PUSH_DELIVERY_ENABLED,
  ).toBe(false);
  expect(() => loadEnv({ ...production, PUSH_DELIVERY_ENABLED: 'yes' })).toThrow();
});

test('dev sign-in flag is reported, not honoured, in production', () => {
  const warnings = configWarnings(loadEnv({ ...production, DEV_AUTH_ENABLED: 'true' }));
  expect(warnings.some((warning) => warning.includes('DEV_AUTH_ENABLED'))).toBe(true);
  expect(configWarnings(loadEnv({ NODE_ENV: 'development', DEV_AUTH_ENABLED: 'true' }))).toEqual(
    [],
  );
});

test('boutique check stays off everywhere until explicitly enabled', () => {
  expect(loadEnv(production).BOUTIQUE_CHECK_ENABLED).toBe(false);
  expect(loadEnv({ NODE_ENV: 'development' }).BOUTIQUE_CHECK_ENABLED).toBe(false);
  expect(loadEnv({ ...production, BOUTIQUE_CHECK_ENABLED: 'true' }).BOUTIQUE_CHECK_ENABLED).toBe(
    true,
  );
  expect(() => loadEnv({ ...production, BOUTIQUE_CHECK_ENABLED: 'yes' })).toThrow();
});

test('ürün etiketleme açıkça açılmadıkça her yerde kapalıdır', () => {
  expect(loadEnv(production).URUN_ETIKET_ENABLED).toBe(false);
  expect(loadEnv({ NODE_ENV: 'development' }).URUN_ETIKET_ENABLED).toBe(false);
  expect(loadEnv({ ...production, URUN_ETIKET_ENABLED: 'true' }).URUN_ETIKET_ENABLED).toBe(true);
  expect(() => loadEnv({ ...production, URUN_ETIKET_ENABLED: 'yes' })).toThrow();
});

test('production without connection settings starts with the connection feature off', () => {
  const tamam = loadEnv({ ...production, BAGLANTI_ESITLEME_ENABLED: 'true' });
  expect(tamam.BAGLANTI_KULLANILABILIR).toBe(true);
  expect(tamam.BAGLANTI_ESITLEME_ENABLED).toBe(true);
  expect(configWarnings(tamam).some((w) => w.includes('connection'))).toBe(false);

  for (const eksik of [
    { BAGLANTI_SIFRELEME_ANAHTARI: undefined },
    { BAGLANTI_SIFRELEME_ANAHTARI: Buffer.from('kisa').toString('base64') },
    { IKAS_CLIENT_ID: undefined },
    { IKAS_CLIENT_SECRET: 'CHANGE_ME' },
  ]) {
    const e = loadEnv({
      ...production,
      ...eksik,
      BAGLANTI_ESITLEME_ENABLED: 'true',
      BAGLANTI_SIPARIS_ENABLED: 'true',
      BAGLANTI_OZET_ENABLED: 'true',
    });
    expect(e.BAGLANTI_KULLANILABILIR).toBe(false);
    // İşler açık yazılsa da başlamaz.
    expect([e.BAGLANTI_ESITLEME_ENABLED, e.BAGLANTI_SIPARIS_ENABLED, e.BAGLANTI_OZET_ENABLED]).toEqual([
      false,
      false,
      false,
    ]);
    const uyarilar = configWarnings(e).filter((w) => w.includes('connection'));
    expect(uyarilar).toHaveLength(1);
    expect(uyarilar[0]).toContain(Object.keys(eksik)[0]!);
  }
  // Uyarı ayar adını söyler, değerini yazmaz.
  const gizli = 'CHANGE_ME-gizli-gorunen-deger';
  const uyari = configWarnings(loadEnv({ ...production, IKAS_CLIENT_SECRET: gizli })).join('\n');
  expect(uyari).toContain('IKAS_CLIENT_SECRET');
  expect(uyari).not.toContain(gizli);
  // Production dışında anahtar boş olabilir; doluysa yine 32 bayt olmalı.
  expect(() => loadEnv({})).not.toThrow();
  expect(loadEnv({}).BAGLANTI_KULLANILABILIR).toBe(false);
  expect(() => loadEnv({ BAGLANTI_SIFRELEME_ANAHTARI: 'kisa' })).toThrow('BAGLANTI_SIFRELEME_ANAHTARI');
});

test('connection settings: pilot list, switches default off, join page url', () => {
  const e = loadEnv({ BAGLANTI_PILOT_KULLANICILARI: 'a, b' });
  expect(e.BAGLANTI_PILOT_KULLANICILARI).toEqual(['a', 'b']);
  expect(loadEnv({}).BAGLANTI_PILOT_KULLANICILARI).toEqual([]);
  expect(e.KATILIM_SAYFASI_URL).toBe('https://butika.ai/katil/');
  expect([e.BAGLANTI_ESITLEME_ENABLED, e.BAGLANTI_SIPARIS_ENABLED, e.BAGLANTI_OZET_ENABLED]).toEqual([
    false,
    false,
    false,
  ]);
  const on = loadEnv({
    BAGLANTI_SIFRELEME_ANAHTARI: production.BAGLANTI_SIFRELEME_ANAHTARI,
    IKAS_CLIENT_ID: production.IKAS_CLIENT_ID,
    IKAS_CLIENT_SECRET: production.IKAS_CLIENT_SECRET,
    BAGLANTI_ESITLEME_ENABLED: 'true',
    BAGLANTI_SIPARIS_ENABLED: '1',
    BAGLANTI_OZET_ENABLED: 'true',
  });
  expect([on.BAGLANTI_ESITLEME_ENABLED, on.BAGLANTI_SIPARIS_ENABLED, on.BAGLANTI_OZET_ENABLED]).toEqual([
    true,
    true,
    true,
  ]);
});

test('missing ikas client id or secret does not stop production', () => {
  expect(() => loadEnv({ ...production, IKAS_CLIENT_ID: undefined })).not.toThrow();
  expect(() => loadEnv({ ...production, IKAS_CLIENT_SECRET: 'CHANGE_ME' })).not.toThrow();
  expect(loadEnv({}).IKAS_YONLENDIRME_URL).toBe('https://api.butika.ai/katilim/ikas/geri-donus');
});

test('profil hesabı açıkça açılmadıkça her yerde kapalıdır', () => {
  expect(loadEnv(production).PROFIL_HESAP_ENABLED).toBe(false);
  expect(loadEnv({ NODE_ENV: 'development' }).PROFIL_HESAP_ENABLED).toBe(false);
  expect(loadEnv({ ...production, PROFIL_HESAP_ENABLED: 'true' }).PROFIL_HESAP_ENABLED).toBe(true);
  expect(loadEnv({ ...production, PROFIL_HESAP_ENABLED: '1' }).PROFIL_HESAP_ENABLED).toBe(true);
  expect(() => loadEnv({ ...production, PROFIL_HESAP_ENABLED: 'yes' })).toThrow();
});

test('profili vitrinde/Butikcan’da kullanma açıkça açılmadıkça her yerde kapalıdır', () => {
  expect(loadEnv(production).PROFIL_VITRIN_ENABLED).toBe(false);
  expect(loadEnv({ NODE_ENV: 'development' }).PROFIL_VITRIN_ENABLED).toBe(false);
  expect(loadEnv({ ...production, PROFIL_VITRIN_ENABLED: 'true' }).PROFIL_VITRIN_ENABLED).toBe(
    true,
  );
  expect(loadEnv({ ...production, PROFIL_VITRIN_ENABLED: '1' }).PROFIL_VITRIN_ENABLED).toBe(true);
  expect(() => loadEnv({ ...production, PROFIL_VITRIN_ENABLED: 'yes' })).toThrow();
});

test('profil raporunda isim/e-posta açıkça açılmadıkça gizlidir', () => {
  expect(loadEnv(production).PROFIL_RAPOR_KIMLIK_GOSTER).toBe(false);
  expect(loadEnv({ NODE_ENV: 'development' }).PROFIL_RAPOR_KIMLIK_GOSTER).toBe(false);
  expect(
    loadEnv({ ...production, PROFIL_RAPOR_KIMLIK_GOSTER: 'true' }).PROFIL_RAPOR_KIMLIK_GOSTER,
  ).toBe(true);
  expect(() => loadEnv({ ...production, PROFIL_RAPOR_KIMLIK_GOSTER: 'yes' })).toThrow();
});

test('shopify varsayilanlari', () => {
  const e = loadEnv({});
  expect(e.SHOPIFY_YONLENDIRME_URL).toBe('https://api.butika.ai/katilim/shopify/geri-donus');
  expect(e.SHOPIFY_API_SURUMU).toBe('2026-10');
});
