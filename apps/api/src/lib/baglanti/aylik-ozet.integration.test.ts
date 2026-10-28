import { expect, test } from 'bun:test';

// Aylık özet: hesap, ay sınırı (İstanbul), tekrar göndermeme. Yalnız ayrı, yerel ve adı
// butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('aylık özet: hesap, ay sınırı ve tek seferlik gönderim', async () => {
  const url = new URL(testUrl!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/butika_notification_test')
  ) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  const { env } = await import('../../env');
  if (env.DATABASE_URL !== testUrl)
    throw new Error('Database configuration was already loaded; run this test file separately');
  const { db } = await import('../db');
  const { aylikOzetHesapla, aylikOzetleriGonder } = await import('./aylik-ozet');
  const { eq, inArray } = await import('drizzle-orm');
  const { countries, boutiques, butikBaglantilari, butikSiparisleri, gonderimler, users } = await import(
    '@butika/db'
  );

  const id = () => crypto.randomUUID();
  const kimlik = crypto.randomUUID().slice(0, 8);
  const butik = { lujo: id(), kapali: id(), koptu: id(), yeni: id() };
  const baglanti = { lujo: id(), kapali: id(), koptu: id(), yeni: id() };
  const eposta = (k: string) => `${k}-${kimlik}@example.test`;
  const gId = (n: number) => `${kimlik}g${n}`.padEnd(12, 'x').slice(0, 12);
  const gonderimIdleri = [1, 2, 3, 4, 5].map(gId);
  const ay = { yil: 2026, ay: 10 };
  const kullanici = { a: id(), b: id() };
  const baglantiSatiri = (k: keyof typeof butik, ek: Record<string, unknown> = {}) => ({
    id: baglanti[k],
    boutiqueId: butik[k],
    platform: 'ikas',
    magazaAdi: k,
    kimlikSifreli: 'x',
    durum: 'aktif',
    tahsilat: 'deneme',
    iletisimEposta: eposta(k),
    onaylayanAd: 'Test',
    sartlarSurumu: '2026-10-deneme',
    onayAt: new Date('2026-09-01T00:00:00Z'),
    ...ek,
  });
  const siparis = (n: number, ek: Record<string, unknown>) => ({
    baglantiId: baglanti.lujo,
    boutiqueId: butik.lujo,
    disSiparisId: `${kimlik}-${n}`,
    siparisNo: `S${n}`,
    siparisAt: new Date('2026-10-10T10:00:00Z'),
    gonderimId: gId(1),
    durum: 'teslim',
    odendi: true,
    tutarMinor: 100000,
    currency: 'TRY',
    komisyonMinor: 10000,
    ...ek,
  });

  try {
    await db
      .insert(countries)
      .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
      .onConflictDoNothing();
    await db.insert(boutiques).values(
      (Object.keys(butik) as (keyof typeof butik)[]).map((k) => ({
        id: butik[k],
        countryCode: 'TR',
        name: `Özet ${k}`,
        url: `https://example.com/${butik[k]}`,
        coverImageUrl: 'https://example.com/c.jpg',
      })),
    );
    await db.insert(butikBaglantilari).values([
      baglantiSatiri('lujo'),
      baglantiSatiri('kapali', { durum: 'kapali' }),
      baglantiSatiri('koptu', { durum: 'koptu', tahsilat: 'ikas' }),
      // Ekim içinde değil Kasım'da bağlanmış: Ekim özeti gitmez
      baglantiSatiri('yeni', { onayAt: new Date('2026-11-01T08:00:00Z') }),
    ]);
    await db.insert(users).values([
      { id: kullanici.a, displayName: 'Özet A' },
      { id: kullanici.b, displayName: 'Özet B' },
    ]);
    // Ekim'de üç açılış ama iki kişi (A iki kez açtı).
    await db.insert(gonderimler).values([
      {
        id: gId(1),
        userId: kullanici.a,
        boutiqueId: butik.lujo,
        url: 'https://x',
        createdAt: new Date('2026-10-02T10:00:00Z'),
      },
      {
        id: gId(2),
        userId: kullanici.a,
        boutiqueId: butik.lujo,
        url: 'https://x',
        createdAt: new Date('2026-10-15T10:00:00Z'),
      },
      // 1 Ekim 00:00 İstanbul = 30 Eylül 21:00 UTC: Ekim'e sayılır
      {
        id: gId(3),
        userId: kullanici.b,
        boutiqueId: butik.lujo,
        url: 'https://x',
        createdAt: new Date('2026-09-30T21:00:00Z'),
      },
      // Eylül'ün son saniyesi (İstanbul) ve Kasım'ın ilk anı: sayılmaz
      {
        id: gId(4),
        boutiqueId: butik.lujo,
        url: 'https://x',
        createdAt: new Date('2026-09-30T20:59:59Z'),
      },
      {
        id: gId(5),
        boutiqueId: butik.lujo,
        url: 'https://x',
        createdAt: new Date('2026-10-31T21:00:00Z'),
      },
    ]);
    await db
      .insert(butikSiparisleri)
      .values([
        siparis(1, { komisyonMinor: 10000 }),
        siparis(2, {
          tutarMinor: 234500,
          komisyonMinor: 23450,
          siparisAt: new Date('2026-09-30T21:00:00Z'),
        }),
        siparis(3, { odendi: false, komisyonMinor: null }),
        siparis(4, { gonderimId: null, komisyonMinor: null }),
        siparis(5, { siparisAt: new Date('2026-10-31T21:00:00Z') }),
        siparis(6, { siparisAt: new Date('2026-09-30T20:59:59Z') }),
        // Tamamen iptal: komisyon silinmiş, satış sayılmaz.
        siparis(7, { durum: 'iptal', komisyonMinor: null, iptalGorulduAt: new Date('2026-10-12T10:00:00Z') }),
        // İade: komisyonu kalır, satış sayılır.
        siparis(8, { durum: 'iptal', tutarMinor: 50000, komisyonMinor: 5000 }),
      ]);

    const o = await aylikOzetHesapla(baglanti.lujo, ay);
    expect(o).toEqual({
      kisiSayisi: 2,
      satisAdedi: 3,
      satisTutariMinor: 384500,
      komisyonMinor: 38450,
      currency: 'TRY',
    });
    const bos = await aylikOzetHesapla(baglanti.koptu, ay);
    expect(bos).toEqual({
      kisiSayisi: 0,
      satisAdedi: 0,
      satisTutariMinor: 0,
      komisyonMinor: 0,
      currency: 'TRY',
    });

    // Gönderim: yalnız bu testin bağlantılarına giden mailler izlenir
    const gidenler: { alici: string; text: string }[] = [];
    let basarisiz = false;
    const mailGonder = async (alici: string, icerik: { text: string }) => {
      if (!alici.endsWith(`-${kimlik}@example.test`))
        return { ok: true as const, messageId: 'baska' };
      if (basarisiz) return { ok: false as const, hata: 'x' };
      gidenler.push({ alici, text: icerik.text });
      return { ok: true as const, messageId: 'm1' };
    };
    const sonOzet = async (k: keyof typeof baglanti) =>
      (
        await db
          .select({ s: butikBaglantilari.sonOzetAyi })
          .from(butikBaglantilari)
          .where(eq(butikBaglantilari.id, baglanti[k]))
      )[0]?.s;
    const kasim2 = new Date('2026-11-02T09:00:00Z');

    // Brevo hazır değil: mail yok, işaret yok
    await aylikOzetleriGonder(kasim2, { mailGonder, brevoHazir: () => false });
    expect(gidenler).toHaveLength(0);
    expect(await sonOzet('lujo')).toBeNull();

    // Ayın 1'i 10:00 öncesi: mail yok
    await aylikOzetleriGonder(new Date('2026-11-01T06:00:00Z'), {
      mailGonder,
      brevoHazir: () => true,
    });
    expect(gidenler).toHaveLength(0);

    // Mail başarısız: işaret yazılmaz
    basarisiz = true;
    await aylikOzetleriGonder(kasim2, { mailGonder, brevoHazir: () => true });
    expect(await sonOzet('lujo')).toBeNull();
    basarisiz = false;

    await aylikOzetleriGonder(kasim2, { mailGonder, brevoHazir: () => true });
    expect(gidenler.map((g) => g.alici).sort()).toEqual([eposta('koptu'), eposta('lujo')]);
    const lujoMail = gidenler.find((g) => g.alici === eposta('lujo'));
    expect(lujoMail?.text).toContain('2 kişi');
    expect(lujoMail?.text).toContain('3 satış');
    expect(lujoMail?.text).toContain('3.845,00 TL');
    expect(lujoMail?.text).toContain('tahsil edilmeyecek');
    expect(await sonOzet('lujo')).toBe('2026-10');
    expect(await sonOzet('koptu')).toBe('2026-10');
    expect(await sonOzet('kapali')).toBeNull();
    expect(await sonOzet('yeni')).toBeNull();

    // Aynı ay için ikinci çalışma: mail gitmez
    await aylikOzetleriGonder(new Date('2026-11-03T09:00:00Z'), {
      mailGonder,
      brevoHazir: () => true,
    });
    expect(gidenler).toHaveLength(2);
  } finally {
    await db.delete(boutiques).where(inArray(boutiques.id, Object.values(butik)));
    await db.delete(users).where(inArray(users.id, Object.values(kullanici)));
  }
});
