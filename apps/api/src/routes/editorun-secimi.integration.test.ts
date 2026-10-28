import { expect, test } from 'bun:test';

// GET /boutiques/editorun-secimi ve admin'de editör alanları.
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('editörün seçimi: herkese elle sıra, admin alanları', async () => {
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
  const { users, countries, categories, boutiques, tarzTestiCevaplari } = await import(
    '@butika/db'
  );
  const app = new Hono()
    .route('/boutiques', boutiqueRoutes)
    .route('/admin/boutiques', adminBoutiqueRoutes);
  app.onError((err, c) => errorResponse(c, err));

  const kullanici = { testli: crypto.randomUUID(), testsiz: crypto.randomUUID() };
  const kat = crypto.randomUUID();
  const b = {
    ilk: crypto.randomUUID(),
    ikinci: crypto.randomUUID(),
    sirasiz: crypto.randomUUID(),
    pasif: crypto.randomUUID(),
    secilmemis: crypto.randomUUID(),
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
      .values({ id: kat, countryCode: 'TR', slug: `editor-${kat}`, name: 'Editör' });
    const butik = (id: string, name: string, ek: Record<string, unknown> = {}) => ({
      id,
      countryCode: 'TR',
      name,
      url: `https://example.com/${id}`,
      coverImageUrl: `https://example.com/${id}.jpg`,
      editorSecimi: true,
      ...ek,
    });
    await db.insert(boutiques).values([
      butik(b.ilk, 'Zeytin', { editorSirasi: 0, editorNotu: 'Modal takımlar.' }),
      butik(b.ikinci, 'Badem', { editorSirasi: 1 }),
      // Sırasız: sona; kişisel uyumu en yüksek olan bu.
      butik(b.sirasiz, 'Nar', {
        tarz1: 'minimal',
        fiyatSegmenti: 'orta',
        hedefYaslar: ['25_34'],
      }),
      butik(b.pasif, 'Ayva', { editorSirasi: 0, isActive: false }),
      butik(b.secilmemis, 'Ceviz', { editorSecimi: false, editorSirasi: 0 }),
      butik(b.yabanci, 'Walnut', { countryCode: 'US', editorSirasi: 0 }),
    ]);
    await db.insert(users).values([
      { id: kullanici.testli, displayName: 'Testli' },
      { id: kullanici.testsiz, displayName: 'Testsiz' },
    ]);
    await db.insert(tarzTestiCevaplari).values({
      userId: kullanici.testli,
      testSurumu: 2,
      senaryoCevaplari: {},
      acikTarzlar: ['minimal'],
      fiyatSegmentleri: ['orta'],
      renkler: [],
      esnek: false,
    });

    const secim = async (userId: string, country = 'TR') => {
      const token = await signAccessToken(userId);
      const res = await app.request(`/boutiques/editorun-secimi?country=${country}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const rows = (await res.json()) as Record<string, unknown>[];
      // Paylaşılan test veritabanında başka kayıt olabilir: yalnız bu testinkiler.
      const bizim = new Set<unknown>(Object.values(b));
      return rows.filter((r) => bizim.has(r.id));
    };
    const idler = (rows: Record<string, unknown>[]) => rows.map((r) => r.id);

    // Profilsiz: elle sıra, sırasız sona; pasif, seçilmemiş ve başka pazar yok.
    const elle = await secim(kullanici.testsiz);
    expect(idler(elle)).toEqual([b.ilk, b.ikinci, b.sirasiz]);
    expect(elle[0]?.editorNotu).toBe('Modal takımlar.');
    expect(elle[1]?.editorNotu).toBeNull();
    expect(elle[0]?.categoryIds).toEqual([]);

    // Profilli kullanıcı da aynı elle sırayı görür (sahip kararı, 3 Eki).
    expect(idler(await secim(kullanici.testli))).toEqual([b.ilk, b.ikinci, b.sirasiz]);

    expect(idler(await secim(kullanici.testsiz, 'US'))).toEqual([b.yabanci]);

    // Gizli alanlar dışarı çıkmaz.
    for (const r of await secim(kullanici.testli)) {
      for (const alan of [
        'tarz1',
        'tarz2',
        'fiyatSegmenti',
        'temsiliFiyatTl',
        'hedefYaslar',
        'editorSecimi',
        'editorSirasi',
        'isActive',
      ])
        expect(alan in r).toBe(false);
    }

    // Giriş yapmadan kapalı (vitrinin geri kalanı gibi).
    expect((await app.request('/boutiques/editorun-secimi?country=TR')).status).toBe(401);

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
      editorSecimi: true,
      editorSirasi: 3,
      editorNotu: '  Yaz akşamları için.  ',
    });
    expect(olustur.status).toBe(201);
    const yeni = (await olustur.json()) as Record<string, unknown>;
    adminButik = yeni.id as string;
    expect(yeni.editorSecimi).toBe(true);
    expect(yeni.editorSirasi).toBe(3);
    expect(yeni.editorNotu).toBe('Yaz akşamları için.');

    const duzenle = await adminIstek(`/${adminButik}`, 'PATCH', {
      editorSecimi: false,
      editorSirasi: null,
      editorNotu: '',
    });
    expect(duzenle.status).toBe(200);
    const duzenlenen = (await duzenle.json()) as Record<string, unknown>;
    expect(duzenlenen.editorSecimi).toBe(false);
    expect(duzenlenen.editorSirasi).toBeNull();
    expect(duzenlenen.editorNotu).toBeNull();

    // Varsayılan: seçili değil. Uzun not reddedilir.
    const varsayilan = await adminIstek('', 'POST', {
      countryCode: 'TR',
      categoryIds: [kat],
      name: 'Fındık',
      url: 'https://example.com/findik',
      coverImageUrl: 'https://example.com/findik.jpg',
    });
    expect(varsayilan.status).toBe(201);
    const varsayilanButik = (await varsayilan.json()) as Record<string, unknown>;
    expect(varsayilanButik.editorSecimi).toBe(false);
    await db.delete(boutiques).where(eq(boutiques.id, varsayilanButik.id as string));
    expect(
      (await adminIstek(`/${adminButik}`, 'PATCH', { editorNotu: 'x'.repeat(141) })).status,
    ).toBe(400);
  } finally {
    await db.delete(users).where(inArray(users.id, Object.values(kullanici)));
    await db.delete(boutiques).where(inArray(boutiques.id, Object.values(b)));
    if (adminButik) await db.delete(boutiques).where(eq(boutiques.id, adminButik));
    await db.delete(categories).where(eq(categories.id, kat));
  }
});
