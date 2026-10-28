import { expect, test } from 'bun:test';

// KADIN | ERKEK vitrini (1.2.4): kategoriler, seçki ve Fırsat seçili tarafa göre süzülür;
// parametresiz istek (eski uygulama) bugünkü kadın vitrinidir.
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('kadın / erkek vitrini: kategoriler, seçki, Fırsat', async () => {
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
  const { categoryRoutes } = await import('./categories');
  const { signAccessToken } = await import('../lib/jwt');
  const { errorResponse } = await import('../lib/errors');
  const { Hono } = await import('hono');
  const { inArray } = await import('drizzle-orm');
  const { users, countries, categories, boutiques, boutiqueCategories } = await import(
    '@butika/db'
  );
  const app = new Hono().route('/boutiques', boutiqueRoutes).route('/categories', categoryRoutes);
  app.onError((err, c) => errorResponse(c, err));

  const kullanici = crypto.randomUUID();
  const kat = { kadin: crypto.randomUUID(), erkek: crypto.randomUUID() };
  const b = {
    kadin: crypto.randomUUID(),
    erkek: crypto.randomUUID(),
    ikisi: crypto.randomUUID(),
    kategorisiz: crypto.randomUUID(),
  };
  try {
    await db
      .insert(countries)
      .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
      .onConflictDoNothing();
    await db.insert(categories).values([
      { id: kat.kadin, countryCode: 'TR', slug: `k-${kat.kadin}`, name: 'Elbise' },
      {
        id: kat.erkek,
        countryCode: 'TR',
        slug: `e-${kat.erkek}`,
        name: 'Erkek Giyim',
        cinsiyet: 'erkek',
      },
    ]);
    const butik = (id: string, name: string) => ({
      id,
      countryCode: 'TR',
      name,
      url: `https://example.com/${id}`,
      coverImageUrl: `https://example.com/${id}.jpg`,
      editorSecimi: true,
      firsat: true,
      firsatNotu: '%20',
    });
    await db
      .insert(boutiques)
      .values([
        butik(b.kadin, 'Lale'),
        butik(b.erkek, 'Kaptan'),
        butik(b.ikisi, 'Ortak'),
        butik(b.kategorisiz, 'Yeni'),
      ]);
    await db.insert(boutiqueCategories).values([
      { boutiqueId: b.kadin, categoryId: kat.kadin },
      { boutiqueId: b.erkek, categoryId: kat.erkek },
      { boutiqueId: b.ikisi, categoryId: kat.kadin },
      { boutiqueId: b.ikisi, categoryId: kat.erkek },
    ]);
    await db.insert(users).values({ id: kullanici, displayName: 'Deneme' });
    const auth = { Authorization: `Bearer ${await signAccessToken(kullanici)}` };
    const al = async (yol: string) => {
      const r = await app.request(yol, { headers: auth });
      expect(r.status).toBe(200);
      return (await r.json()) as { id: string }[];
    };
    const benim = (liste: { id: string }[], idler: string[]) =>
      liste.map((x) => x.id).filter((id) => idler.includes(id));
    const kategoriler = Object.values(kat);
    const butikler = Object.values(b);

    // Kategoriler: parametresiz = kadın; erkek yalnız erkek kategorileri.
    expect(benim(await al('/categories?country=TR'), kategoriler)).toEqual([kat.kadin]);
    expect(benim(await al('/categories?country=TR&cinsiyet=erkek'), kategoriler)).toEqual([
      kat.erkek,
    ]);

    // Seçki ve Fırsat: kadın vitrini yalnız-erkek butiği göstermez (kategorisiz bugünkü gibi görünür);
    // erkek vitrini en az bir erkek kategorisi olanları gösterir.
    for (const yol of ['/boutiques/editorun-secimi', '/boutiques/firsatlar']) {
      const kadin = benim(await al(`${yol}?country=TR`), butikler).sort();
      expect(kadin).toEqual([b.kadin, b.ikisi, b.kategorisiz].sort());
      const erkek = benim(await al(`${yol}?country=TR&cinsiyet=erkek`), butikler).sort();
      expect(erkek).toEqual([b.erkek, b.ikisi].sort());
    }

    // Geçersiz taraf reddedilir.
    const hatali = await app.request('/categories?country=TR&cinsiyet=cocuk', { headers: auth });
    expect(hatali.status).toBe(400);
  } finally {
    await db
      .delete(boutiqueCategories)
      .where(inArray(boutiqueCategories.boutiqueId, Object.values(b)));
    await db.delete(boutiques).where(inArray(boutiques.id, Object.values(b)));
    await db.delete(categories).where(inArray(categories.id, Object.values(kat)));
    await db.delete(users).where(inArray(users.id, [kullanici]));
  }
});
