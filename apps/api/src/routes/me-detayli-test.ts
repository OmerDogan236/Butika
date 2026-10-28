import { type DetayliTestSatiri, categories, detayliTestCevaplari } from '@butika/db';
import {
  type DetayliTest,
  type DetayliTestCevaplari,
  detayliTestCevaplariSchema,
  detayliTestGonderSchema,
} from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AuthContext } from '../lib/auth';
import { db } from '../lib/db';
import { type KategoriEgilimi, kategoriEgilimi, slugAnahtari } from '../lib/detayli-test-kategori';
import { logger } from '../lib/logger';

// Detaylı test: kişi başına tek kayıt. meRoutes altına bağlanır (requireAuth orada).
// Tasarım: docs/superpowers/specs/2026-10-16-detayli-test-tasarim.md (§3)
export const meDetayliTestRoutes = new Hono<AuthContext>();

async function satir(userId: string): Promise<DetayliTestSatiri | undefined> {
  const [s] = await db
    .select()
    .from(detayliTestCevaplari)
    .where(eq(detayliTestCevaplari.userId, userId))
    .limit(1);
  return s;
}

/** Şemaya uymayan (eski sürüm, bozuk) kayıt yok sayılır. */
function cevabiOku(userId: string, s: DetayliTestSatiri | undefined): DetayliTestCevaplari | null {
  if (!s) return null;
  const sonuc = detayliTestCevaplariSchema.safeParse(s.cevaplar);
  if (sonuc.success) return sonuc.data;
  // Geçersiz/eski sürüm kayıt bilerek "doldurulmamış" sayılır; afiş yeniden davet eder.
  logger.warn(
    { userId, testSurumu: s.testSurumu },
    'detayli test kaydi semaya uymuyor; yok sayildi',
  );
  return null;
}

export async function detayliTestCevabi(userId: string): Promise<DetayliTestCevaplari | null> {
  return cevabiOku(userId, await satir(userId));
}

/** Pazarın kategori id'leriyle eğilim; detaylı test yoksa null. */
export async function kategoriEgilimiIdleri(
  userId: string,
  market: string,
): Promise<KategoriEgilimi | null> {
  const cevap = await detayliTestCevabi(userId);
  if (!cevap) return null;
  const e = kategoriEgilimi(cevap);
  const kategoriler = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories)
    .where(eq(categories.countryCode, market));
  const idler = (slugs: Set<string>) => {
    const anahtarlar = new Set([...slugs].map(slugAnahtari));
    return new Set(
      kategoriler.filter((k) => anahtarlar.has(slugAnahtari(k.slug))).map((k) => k.id),
    );
  };
  return { one: idler(e.one), alta: idler(e.alta) };
}

function serialize(s: DetayliTestSatiri, cevaplar: DetayliTestCevaplari): DetayliTest {
  return { testSurumu: s.testSurumu, cevaplar, guncellendi: s.updatedAt.toISOString() };
}

meDetayliTestRoutes.get('/detayli-test', async (c) => {
  const s = await satir(c.get('userId'));
  const cevaplar = cevabiOku(c.get('userId'), s);
  return c.json(s && cevaplar ? serialize(s, cevaplar) : null);
});

meDetayliTestRoutes.put('/detayli-test', zValidator('json', detayliTestGonderSchema), async (c) => {
  const userId = c.get('userId');
  const { testSurumu, cevaplar } = c.req.valid('json');
  const simdi = new Date();
  const [s] = await db
    .insert(detayliTestCevaplari)
    .values({ userId, testSurumu, cevaplar, updatedAt: simdi })
    .onConflictDoUpdate({
      target: detayliTestCevaplari.userId,
      set: { testSurumu, cevaplar, updatedAt: simdi },
    })
    .returning();
  if (!s) throw new Error('detaylı test kaydedilemedi');
  return c.json(serialize(s, cevaplar));
});
