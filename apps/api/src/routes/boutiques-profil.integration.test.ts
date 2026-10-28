import { expect, test } from 'bun:test';
import type { NewKullaniciProfiliSatiri } from '@butika/db';

// GET /boutiques?sort=kisisel — PROFIL_VITRIN_ENABLED açıkken profil tablosu kullanılır.
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('vitrin "Sana özel" profil ile sıralanır', async () => {
  const url = new URL(testUrl!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/butika_notification_test')
  ) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  process.env.PROFIL_VITRIN_ENABLED = 'true';
  const { env } = await import('../env');
  if (env.DATABASE_URL !== testUrl || !env.PROFIL_VITRIN_ENABLED)
    throw new Error('Database configuration was already loaded; run this test file separately');
  const { db } = await import('../lib/db');
  const { boutiqueRoutes } = await import('./boutiques');
  const { signAccessToken } = await import('../lib/jwt');
  const { errorResponse } = await import('../lib/errors');
  const { Hono } = await import('hono');
  const { eq, inArray } = await import('drizzle-orm');
  const {
    users,
    countries,
    categories,
    boutiques,
    boutiqueCategories,
    tarzTestiCevaplari,
    kullaniciProfilleri,
  } = await import('@butika/db');
  const app = new Hono().route('/boutiques', boutiqueRoutes);
  app.onError((err, c) => errorResponse(c, err));

  const kullanici = {
    profilli: crypto.randomUUID(),
    bos: crypto.randomUUID(),
    davranis: crypto.randomUUID(),
    profilsizTestli: crypto.randomUUID(),
    // Profili hâlâ 'davranis' ama testi sonradan yapmış (profil henüz yeniden hesaplanmamış)
    davranisTestli: crypto.randomUUID(),
  };
  const kat = { liste: crypto.randomUUID(), ilgi: crypto.randomUUID() };
  const b = {
    a: crypto.randomUUID(),
    b: crypto.randomUUID(),
    c: crypto.randomUUID(),
    d: crypto.randomUUID(),
  };
  try {
    await db
      .insert(countries)
      .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
      .onConflictDoNothing();
    await db.insert(categories).values([
      { id: kat.liste, countryCode: 'TR', slug: `profil-${kat.liste}`, name: 'Liste' },
      { id: kat.ilgi, countryCode: 'TR', slug: `profil-${kat.ilgi}`, name: 'İlgi' },
    ]);
    const butik = (id: string, name: string, ek: Record<string, unknown> = {}) => ({
      id,
      countryCode: 'TR',
      name,
      url: `https://example.com/${id}`,
      coverImageUrl: `https://example.com/${id}.jpg`,
      ...ek,
    });
    await db
      .insert(boutiques)
      .values([
        butik(b.a, 'Zeytin', { tarz1: 'minimal', fiyatSegmenti: 'luks' }),
        butik(b.b, 'Badem'),
        butik(b.c, 'Nar', { tarz1: 'bohem', fiyatSegmenti: 'orta' }),
        butik(b.d, 'Ayva', { tarz1: 'bohem', fiyatSegmenti: 'luks' }),
      ]);
    await db.insert(boutiqueCategories).values([
      { boutiqueId: b.a, categoryId: kat.liste, sortOrder: 0 },
      { boutiqueId: b.b, categoryId: kat.liste, sortOrder: 1 },
      { boutiqueId: b.c, categoryId: kat.liste, sortOrder: 2 },
      { boutiqueId: b.d, categoryId: kat.liste, sortOrder: 3 },
      // Badem ayrıca kullanıcının ilgilendiği kategoride
      { boutiqueId: b.b, categoryId: kat.ilgi, sortOrder: 0 },
    ]);
    await db.insert(users).values([
      { id: kullanici.profilli, displayName: 'Profilli' },
      { id: kullanici.bos, displayName: 'Boş' },
      { id: kullanici.davranis, displayName: 'Davranış' },
      { id: kullanici.profilsizTestli, displayName: 'Profilsiz' },
      { id: kullanici.davranisTestli, displayName: 'Davranış testli' },
    ]);
    // Testte minimal seçmiş ama profili (kayıtlarla) bohem + orta: profil kazanmalı.
    await db.insert(tarzTestiCevaplari).values(
      [kullanici.profilli, kullanici.profilsizTestli, kullanici.davranisTestli].map((userId) => ({
        userId,
        testSurumu: 2,
        senaryoCevaplari: {},
        acikTarzlar: ['minimal'],
        fiyatSegmentleri: ['luks'],
        renkler: [],
        esnek: false,
      })),
    );
    const profil = (
      userId: string,
      kaynak: 'karisik' | 'bos' | 'davranis',
    ): NewKullaniciProfiliSatiri => ({
      userId,
      tarz: kaynak === 'bos' ? {} : { bohem: 1, minimal: 0.3 },
      butce: { segmentler: kaynak === 'bos' ? {} : { orta: 1 }, ortanca: {} },
      kategoriler: kaynak === 'bos' ? {} : { [kat.ilgi]: 1 },
      urunEtiketleri: { tur: {}, renk: {}, malzeme: {} },
      yasAraligi: null,
      kayitSayisi: 5,
      kaynak,
      guncellendi: new Date(),
    });
    await db
      .insert(kullaniciProfilleri)
      .values([
        profil(kullanici.profilli, 'karisik'),
        profil(kullanici.bos, 'bos'),
        profil(kullanici.davranis, 'davranis'),
        profil(kullanici.davranisTestli, 'davranis'),
      ]);

    const liste = async (userId: string, sort?: string) => {
      const token = await signAccessToken(userId);
      const q = `categoryId=${kat.liste}${sort ? `&sort=${sort}` : ''}`;
      const res = await app.request(`/boutiques?${q}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      return ((await res.json()) as Record<string, unknown>[]).map((r) => r.id);
    };
    const admin = [b.a, b.b, b.c, b.d];

    // Nar: 3 (bohem) + 2 (orta) = 5; Ayva: 3; Zeytin: 0.9 (minimal 0.3); Badem: 1 (kategori ilgisi)
    const profilSirasi = [b.c, b.d, b.b, b.a];
    expect(await liste(kullanici.profilli, 'kisisel')).toEqual(profilSirasi);
    // Aşama 3: testi olmayan, davranışla dolu profil de "Sana özel" alır
    expect(await liste(kullanici.davranis, 'kisisel')).toEqual(profilSirasi);
    // Boş profil ve profili hiç olmayan (test yapmış olsa da) → admin sırası
    expect(await liste(kullanici.bos, 'kisisel')).toEqual(admin);
    expect(await liste(kullanici.profilsizTestli, 'kisisel')).toEqual(admin);

    // "Önerilen": yalnız testsiz + davranış profilli kullanıcıda profile göre
    expect(await liste(kullanici.davranis)).toEqual(profilSirasi);
    expect(await liste(kullanici.davranis, 'onerilen')).toEqual(profilSirasi);
    expect(await liste(kullanici.profilli)).toEqual(admin);
    expect(await liste(kullanici.davranisTestli)).toEqual(admin);
    expect(await liste(kullanici.bos)).toEqual(admin);
    expect(await liste(kullanici.profilsizTestli)).toEqual(admin);
    // Fiyat ve A–Z sıralamaları profilden etkilenmez
    expect(await liste(kullanici.davranis, 'uygun_once')).toEqual(
      await liste(kullanici.bos, 'uygun_once'),
    );
    expect(await liste(kullanici.davranis, 'alfabetik')).toEqual(
      await liste(kullanici.bos, 'alfabetik'),
    );

    // Fırsat: hiçbir butik çıkmaz, yalnız sıra; eşitlikte admin firsatSirasi
    for (const [id, sira] of [
      [b.a, 1],
      [b.b, 2],
      [b.c, 3],
      [b.d, 4],
    ] as const) {
      await db
        .update(boutiques)
        .set({ firsat: true, firsatSirasi: sira })
        .where(eq(boutiques.id, id));
    }
    const firsatlar = async (userId: string) => {
      const token = await signAccessToken(userId);
      const res = await app.request('/boutiques/firsatlar?country=TR', {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const govde = (await res.json()) as Record<string, unknown>[];
      for (const r of govde) {
        for (const alan of ['tarz1', 'fiyatSegmenti', 'firsatSirasi', 'hedefYaslar'])
          expect(alan in r).toBe(false);
      }
      return govde
        .map((r) => r.id)
        .filter((id) => (Object.values(b) as string[]).includes(id as string));
    };
    expect(await firsatlar(kullanici.profilli)).toEqual(profilSirasi);
    expect(await firsatlar(kullanici.davranis)).toEqual(profilSirasi);
    expect(await firsatlar(kullanici.bos)).toEqual(admin);
    expect(await firsatlar(kullanici.profilsizTestli)).toEqual(admin);
    // Eşit puanda admin sırası: Zeytin (1) ile Badem (2) profilsiz eşit → 1 önce
    await db
      .update(kullaniciProfilleri)
      .set({ tarz: { vintage: 1 }, butce: { segmentler: {}, ortanca: {} }, kategoriler: {} })
      .where(eq(kullaniciProfilleri.userId, kullanici.davranis));
    expect(await firsatlar(kullanici.davranis)).toEqual(admin);

    // Seçkideki butik "Sana özel"de sona iner
    await db.update(boutiques).set({ editorSecimi: true }).where(eq(boutiques.id, b.c));
    expect(await liste(kullanici.profilli, 'kisisel')).toEqual([b.d, b.b, b.a, b.c]);
  } finally {
    await db.delete(users).where(inArray(users.id, Object.values(kullanici)));
    await db.delete(boutiques).where(inArray(boutiques.id, Object.values(b)));
    await db.delete(categories).where(inArray(categories.id, Object.values(kat)));
  }
});
