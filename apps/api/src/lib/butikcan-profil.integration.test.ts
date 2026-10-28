import { expect, test } from 'bun:test';
import type { NewKullaniciProfiliSatiri } from '@butika/db';

// Butikcan: PROFIL_VITRIN_ENABLED açıkken profil, yalnız AI rızası varsa kullanılır.
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('Butikcan tarz bilgisi: profil, test ve rıza', async () => {
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
  const { db } = await import('./db');
  const { butikcanTarzProfili } = await import('./butikcan-ortak');
  const { inArray } = await import('drizzle-orm');
  const { users, consentRecords, tarzTestiCevaplari, kullaniciProfilleri } = await import(
    '@butika/db'
  );

  const k = {
    rizaliProfilli: crypto.randomUUID(),
    rizasizProfilli: crypto.randomUUID(),
    rizaliProfilsiz: crypto.randomUUID(),
    rizaliBosProfil: crypto.randomUUID(),
    // Aşama 3: tarz testi yok, profil yalnız davranıştan
    rizaliTestsizDavranis: crypto.randomUUID(),
  };
  const profil = (userId: string, bos = false): NewKullaniciProfiliSatiri => ({
    userId,
    tarz: bos ? {} : { minimal: 1, sokak: 0.4 },
    butce: { segmentler: bos ? {} : { orta: 1, luks: 0.2 }, ortanca: {} },
    kategoriler: {},
    urunEtiketleri: { tur: bos ? {} : { gomlek: 1 }, renk: {}, malzeme: {} },
    yasAraligi: null,
    kayitSayisi: 4,
    kaynak: bos ? 'bos' : 'karisik',
    guncellendi: new Date(),
  });
  try {
    await db
      .insert(users)
      .values(Object.values(k).map((id) => ({ id, displayName: 'Butikcan', gender: 'female' })));
    await db.insert(tarzTestiCevaplari).values(
      Object.values(k)
        .filter((id) => id !== k.rizaliTestsizDavranis)
        .map((userId) => ({
          userId,
          testSurumu: 2,
          senaryoCevaplari: {},
          acikTarzlar: ['bohem'],
          fiyatSegmentleri: ['uygun'],
          renkler: [],
          tarz1: 'bohem',
          esnek: false,
        })),
    );
    await db.insert(consentRecords).values(
      [k.rizaliProfilli, k.rizaliProfilsiz, k.rizaliBosProfil, k.rizaliTestsizDavranis].map(
        (userId) => ({
          userId,
          consentType: 'yapay_zeka_aktarim',
          granted: true,
          textVersion: 'v1',
          source: 'test',
        }),
      ),
    );
    await db
      .insert(kullaniciProfilleri)
      .values([
        profil(k.rizaliProfilli),
        profil(k.rizasizProfilli),
        profil(k.rizaliBosProfil, true),
        { ...profil(k.rizaliTestsizDavranis), kaynak: 'davranis' },
      ]);

    const p = await butikcanTarzProfili(k.rizaliProfilli);
    expect(p.tarzProfili).toEqual({
      tarz1: 'minimal',
      tarz2: 'sokak',
      fiyatSegmentleri: ['orta'],
      aramaIpuclari: ['gömlek'],
    });
    expect(p.userProfile?.tarzlar).toEqual(['minimal', 'sokak']);
    // Profil öncesi seçim (öneri sayısı tabanı) bugünkü test bilgisiyle yapılır
    expect(p.kullaniciProfili).toEqual({
      taban: { tarz1: 'bohem', tarz2: null, fiyatSegmentleri: ['uygun'] },
    });

    // Rıza yoksa profil de test de kullanılmaz (bugünkü kural)
    const rizasiz = await butikcanTarzProfili(k.rizasizProfilli);
    expect(rizasiz.tarzProfili).toBeUndefined();
    expect(rizasiz.userProfile).toBeUndefined();

    // Profil yok ya da boş → bugünkü gibi tarz testi
    const testten = { tarz1: 'bohem', tarz2: null, fiyatSegmentleri: ['uygun'] };
    expect((await butikcanTarzProfili(k.rizaliProfilsiz)).tarzProfili).toEqual(testten);
    expect((await butikcanTarzProfili(k.rizaliProfilsiz)).kullaniciProfili).toBeUndefined();
    expect((await butikcanTarzProfili(k.rizaliBosProfil)).tarzProfili).toEqual(testten);

    // Testi olmayan, davranış profili dolu kullanıcı da kişiselleştirme alır; taban yok
    const davranis = await butikcanTarzProfili(k.rizaliTestsizDavranis);
    expect(davranis.tarzProfili?.tarz1).toBe('minimal');
    expect(davranis.kullaniciProfili).toEqual({ taban: undefined });
  } finally {
    await db.delete(consentRecords).where(inArray(consentRecords.userId, Object.values(k)));
    await db.delete(users).where(inArray(users.id, Object.values(k)));
  }
});
