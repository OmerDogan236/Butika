import { expect, test } from 'bun:test';

// GET /boutiques/firsatlar, admin'de fırsat alanları ve vitrin ayarları (uygulama + admin).
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('fırsatlar: sıra, süzme, gizli alanlar, admin alanları', async () => {
  const url = new URL(testUrl!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/butika_notification_test')
  ) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  const { env } = await import('../env');
  if (env.DATABASE_URL !== testUrl)
    throw new Error('Database configuration was already loaded; run this test file separately');
  const { db } = await import('../lib/db');
  const { boutiqueRoutes } = await import('./boutiques');
  const { adminBoutiqueRoutes } = await import('./admin/boutiques');
  const { signAccessToken, signAdminAccessToken } = await import('../lib/jwt');
  const { errorResponse } = await import('../lib/errors');
  const { Hono } = await import('hono');
  const { eq, inArray } = await import('drizzle-orm');
  const { users, countries, categories, boutiques } = await import('@butika/db');
  const app = new Hono()
    .route('/boutiques', boutiqueRoutes)
    .route('/admin/boutiques', adminBoutiqueRoutes);
  app.onError((err, c) => errorResponse(c, err));

  const kullanici = crypto.randomUUID();
  const kat = crypto.randomUUID();
  const b = {
    ilk: crypto.randomUUID(),
    ikinci: crypto.randomUUID(),
    sirasizA: crypto.randomUUID(),
    sirasizC: crypto.randomUUID(),
    pasif: crypto.randomUUID(),
    firsatDegil: crypto.randomUUID(),
    yabanci: crypto.randomUUID(),
  };
  let adminButik: string | null = null;
  try {
    await db
      .insert(countries)
      .values([
        { code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' },
        { code: 'US', name: 'United States', defaultLanguage: 'en' },
      ])
      .onConflictDoNothing();
    await db
      .insert(categories)
      .values({ id: kat, countryCode: 'TR', slug: `firsat-${kat}`, name: 'Fırsat' });
    const butik = (id: string, name: string, ek: Record<string, unknown> = {}) => ({
      id,
      countryCode: 'TR',
      name,
      url: `https://example.com/${id}`,
      coverImageUrl: `https://example.com/${id}.jpg`,
      firsat: true,
      // Gizli alanlar dolu: yanıta sızmadığı sınansın.
      tarz1: 'minimal',
      fiyatSegmenti: 'orta',
      hedefYaslar: ['25_34'],
      editorSecimi: true,
      editorSirasi: 0,
      ...ek,
    });
    await db
      .insert(boutiques)
      .values([
        butik(b.ikinci, 'Badem', { firsatSirasi: 1 }),
        butik(b.sirasizC, 'Çilek'),
        butik(b.ilk, 'Zeytin', { firsatSirasi: 0, firsatNotu: "%30'a varan sezon sonu" }),
        butik(b.sirasizA, 'Ayva'),
        butik(b.pasif, 'Nar', { firsatSirasi: 0, isActive: false }),
        butik(b.firsatDegil, 'Ceviz', { firsat: false, firsatSirasi: 0 }),
        butik(b.yabanci, 'Walnut', { countryCode: 'US', firsatSirasi: 0 }),
      ]);
    await db.insert(users).values({ id: kullanici, displayName: 'Fırsatçı' });

    const firsatlar = async (country = 'TR') => {
      const token = await signAccessToken(kullanici);
      const res = await app.request(`/boutiques/firsatlar?country=${country}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const rows = (await res.json()) as Record<string, unknown>[];
      // Paylaşılan test veritabanında başka kayıt olabilir: yalnız bu testinkiler.
      const bizim = new Set<unknown>(Object.values(b));
      return rows.filter((r) => bizim.has(r.id));
    };
    const idler = (rows: Record<string, unknown>[]) => rows.map((r) => r.id);

    // Elle sıra, sırasızlar sona ve aralarında ada göre; pasif, fırsat olmayan, başka pazar yok.
    const tr = await firsatlar();
    expect(idler(tr)).toEqual([b.ilk, b.ikinci, b.sirasizA, b.sirasizC]);
    expect(tr[0]?.firsatNotu).toBe("%30'a varan sezon sonu");
    expect(tr[1]?.firsatNotu).toBeNull();
    expect(tr[0]?.name).toBe('Zeytin');
    expect(tr[0]?.coverImageUrl).toBe(`https://example.com/${b.ilk}.jpg`);
    expect(tr[0]?.categoryIds).toEqual([]);

    expect(idler(await firsatlar('US'))).toEqual([b.yabanci]);

    // Gizli alanlar dışarı çıkmaz.
    for (const r of tr) {
      for (const alan of [
        'tarz1',
        'tarz2',
        'fiyatSegmenti',
        'temsiliFiyatTl',
        'hedefYaslar',
        'yasGuven',
        'firsat',
        'firsatSirasi',
        'editorSecimi',
        'editorSirasi',
        'editorNotu',
        'isActive',
      ])
        expect(alan in r).toBe(false);
    }

    // Giriş yapmadan kapalı (vitrinin geri kalanı gibi).
    expect((await app.request('/boutiques/firsatlar?country=TR')).status).toBe(401);

    // Admin: oluştururken ve düzenlerken üç alan alınır ve geri döner.
    const adminToken = await signAdminAccessToken(crypto.randomUUID());
    const adminIstek = (yol: string, method: string, body: unknown) =>
      app.request(`/admin/boutiques${yol}`, {
        method,
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const olustur = await adminIstek('', 'POST', {
      countryCode: 'TR',
      categoryIds: [kat],
      name: 'Kestane',
      url: 'https://example.com/kestane',
      coverImageUrl: 'https://example.com/kestane.jpg',
      firsat: true,
      firsatSirasi: 2,
      firsatNotu: '  Tüm ürünlerde %20  ',
    });
    expect(olustur.status).toBe(201);
    const yeni = (await olustur.json()) as Record<string, unknown>;
    adminButik = yeni.id as string;
    expect(yeni.firsat).toBe(true);
    expect(yeni.firsatSirasi).toBe(2);
    expect(yeni.firsatNotu).toBe('Tüm ürünlerde %20');
    // Editör alanları fırsattan bağımsız.
    expect(yeni.editorSecimi).toBe(false);

    const duzenle = await adminIstek(`/${adminButik}`, 'PATCH', {
      firsat: false,
      firsatSirasi: null,
      firsatNotu: '',
    });
    expect(duzenle.status).toBe(200);
    const duzenlenen = (await duzenle.json()) as Record<string, unknown>;
    expect(duzenlenen.firsat).toBe(false);
    expect(duzenlenen.firsatSirasi).toBeNull();
    expect(duzenlenen.firsatNotu).toBeNull();

    // Admin listesi alanları taşır.
    const liste = await app.request('/admin/boutiques?country=TR', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listeSatiri = ((await liste.json()) as Record<string, unknown>[]).find(
      (r) => r.id === b.ilk,
    );
    expect(listeSatiri?.firsat).toBe(true);
    expect(listeSatiri?.firsatNotu).toBe("%30'a varan sezon sonu");

    // Varsayılan: fırsat değil. Uzun not ve negatif sıra reddedilir.
    expect(
      (await adminIstek(`/${adminButik}`, 'PATCH', { firsatNotu: 'x'.repeat(141) })).status,
    ).toBe(400);
    expect((await adminIstek(`/${adminButik}`, 'PATCH', { firsatSirasi: -1 })).status).toBe(400);
    const [varsayilan] = await db
      .select({ firsat: boutiques.firsat })
      .from(boutiques)
      .where(eq(boutiques.id, b.firsatDegil));
    expect(varsayilan?.firsat).toBe(false);
  } finally {
    await db.delete(users).where(eq(users.id, kullanici));
    await db.delete(boutiques).where(inArray(boutiques.id, Object.values(b)));
    if (adminButik) await db.delete(boutiques).where(eq(boutiques.id, adminButik));
    await db.delete(categories).where(eq(categories.id, kat));
  }
});

test.skipIf(!testUrl)('vitrin ayarları: okuma, admin güncelleme, pazar ayrımı', async () => {
  process.env.DATABASE_URL = testUrl;
  const { db } = await import('../lib/db');
  const { vitrinAyarlariRoutes } = await import('./vitrin-ayarlari');
  const { adminVitrinAyarlariRoutes } = await import('./admin/vitrin-ayarlari');
  const { signAccessToken, signAdminAccessToken } = await import('../lib/jwt');
  const { errorResponse } = await import('../lib/errors');
  const { Hono } = await import('hono');
  const { eq, inArray } = await import('drizzle-orm');
  const { users, countries, vitrinAyarlari } = await import('@butika/db');
  const app = new Hono()
    .route('/vitrin-ayarlari', vitrinAyarlariRoutes)
    .route('/admin/vitrin-ayarlari', adminVitrinAyarlariRoutes);
  app.onError((err, c) => errorResponse(c, err));

  const kullanici = crypto.randomUUID();
  try {
    await db
      .insert(countries)
      .values([
        { code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' },
        { code: 'US', name: 'United States', defaultLanguage: 'en' },
      ])
      .onConflictDoNothing();
    await db.delete(vitrinAyarlari).where(inArray(vitrinAyarlari.countryCode, ['TR', 'US']));
    await db.insert(users).values({ id: kullanici, displayName: 'Vitrin' });
    const token = await signAccessToken(kullanici);
    const oku = async (country: string) => {
      const res = await app.request(`/vitrin-ayarlari?country=${country}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      return (await res.json()) as Record<string, unknown>;
    };

    // Kayıt yokken her alan null.
    expect(await oku('TR')).toEqual({
      seckiBasligi: null,
      guncelSurum: { ios: null, android: null },
    });
    expect((await app.request('/vitrin-ayarlari?country=TR')).status).toBe(401);

    const adminToken = await signAdminAccessToken(crypto.randomUUID());
    const yaz = (country: string, body: unknown) =>
      app.request(`/admin/vitrin-ayarlari/${country}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    // Giriş yapmamış admin yazamaz; kullanıcı tokenı admin değildir.
    const yetkisiz = await app.request('/admin/vitrin-ayarlari/TR', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ seckiBasligi: 'x' }),
    });
    expect(yetkisiz.status).toBe(401);

    const ilk = await yaz('tr', {
      seckiBasligi: '  Sonbahar seçkisi  ',
      guncelSurumIos: '1.3.0',
      guncelSurumAndroid: '',
    });
    expect(ilk.status).toBe(200);
    const ilkSatir = (await ilk.json()) as Record<string, unknown>;
    expect(ilkSatir.countryCode).toBe('TR');
    expect(ilkSatir.seckiBasligi).toBe('Sonbahar seçkisi');
    expect(ilkSatir.guncelSurumAndroid).toBeNull();
    expect(await oku('TR')).toEqual({
      seckiBasligi: 'Sonbahar seçkisi',
      guncelSurum: { ios: '1.3.0', android: null },
    });

    // Verilmeyen alan değişmez; boş başlık null'a döner.
    expect((await yaz('TR', { guncelSurumAndroid: '1.2.1' })).status).toBe(200);
    expect((await yaz('TR', { seckiBasligi: '' })).status).toBe(200);
    expect(await oku('TR')).toEqual({
      seckiBasligi: null,
      guncelSurum: { ios: '1.3.0', android: '1.2.1' },
    });

    // Pazarlar birbirinden ayrı.
    expect((await yaz('US', { seckiBasligi: 'Autumn edit' })).status).toBe(200);
    expect((await oku('US')).seckiBasligi).toBe('Autumn edit');
    expect((await oku('TR')).seckiBasligi).toBeNull();

    // Admin listesi her pazarı döndürür.
    const liste = await app.request('/admin/vitrin-ayarlari', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(liste.status).toBe(200);
    const satirlar = (await liste.json()) as Record<string, unknown>[];
    expect(satirlar.find((r) => r.countryCode === 'US')?.seckiBasligi).toBe('Autumn edit');
    expect(satirlar.find((r) => r.countryCode === 'TR')?.guncelSurumIos).toBe('1.3.0');

    // Bozuk sürüm, uzun başlık ve olmayan pazar reddedilir.
    expect((await yaz('TR', { guncelSurumIos: '1.3' })).status).toBe(400);
    expect((await yaz('TR', { seckiBasligi: 'x'.repeat(61) })).status).toBe(400);
    expect((await yaz('ZZ', { seckiBasligi: 'x' })).status).toBe(404);
  } finally {
    await db.delete(users).where(eq(users.id, kullanici));
    await db.delete(vitrinAyarlari).where(inArray(vitrinAyarlari.countryCode, ['TR', 'US']));
  }
});
