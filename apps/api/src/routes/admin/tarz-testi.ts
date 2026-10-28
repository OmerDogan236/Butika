import { events, boutiques, detayliTestCevaplari, tarzTestiCevaplari } from '@butika/db';
import type { TarzTestiRaporu } from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { and, gte, inArray, ne, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { db } from '../../lib/db';
import { detayliTestRaporu } from '../../lib/detayli-test-rapor';
import {
  fiyatRenkRaporu,
  katilimRaporu,
  kisiBasinaSon,
  oneriRaporu,
  senaryoRaporu,
  tarzRaporu,
  yasRaporu,
} from '../../lib/tarz-testi-rapor';

export const adminTarzTestiRoutes = new Hono<AdminContext>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

adminTarzTestiRoutes.use('*', requireAdmin);

const RANGE_DAYS = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 } as const;

adminTarzTestiRoutes.get(
  '/',
  zValidator('query', z.object({ range: z.enum(['1d', '7d', '30d', '90d']).default('30d') })),
  async (c) => {
    const { range } = c.req.valid('query');
    const since = new Date(Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000);

    const [cevaplar, olaylar, detayliSatirlar] = await Promise.all([
      db
        .select({
          userId: tarzTestiCevaplari.userId,
          testSurumu: tarzTestiCevaplari.testSurumu,
          senaryo: tarzTestiCevaplari.senaryoCevaplari,
          acikTarzlar: tarzTestiCevaplari.acikTarzlar,
          fiyatSegmentleri: tarzTestiCevaplari.fiyatSegmentleri,
          renkler: tarzTestiCevaplari.renkler,
          yasAraligi: tarzTestiCevaplari.yasAraligi,
          tarz1: tarzTestiCevaplari.tarz1,
          senaryoTarz1: tarzTestiCevaplari.senaryoTarz1,
          favoriTarz1: tarzTestiCevaplari.favoriTarz1,
          esnek: tarzTestiCevaplari.esnek,
          createdAt: tarzTestiCevaplari.createdAt,
        })
        .from(tarzTestiCevaplari)
        .where(gte(tarzTestiCevaplari.createdAt, since)),
      db
        .select({
          userId: events.userId,
          type: events.type,
          payload: sql<Record<string, unknown>>`${events.payload}`,
          createdAt: events.createdAt,
        })
        .from(events)
        .where(
          and(
            gte(events.createdAt, since),
            inArray(events.type, [
              'tarz_testi_basladi',
              'tarz_testi_adim',
              'oneri_gosterildi',
              'oneri_tiklandi',
              'product_saved',
              'detayli_davet',
            ]),
            // Kaydetmelerden yalnız öneriden gelenler gerekir.
            or(ne(events.type, 'product_saved'), sql`${events.payload}->>'kaynak' = 'oneri'`),
          ),
        ),
      db
        .select({ cevaplar: detayliTestCevaplari.cevaplar })
        .from(detayliTestCevaplari)
        .where(gte(detayliTestCevaplari.updatedAt, since)),
    ]);

    const son = kisiBasinaSon(cevaplar);
    const oneri = oneriRaporu(olaylar);
    // İkinci savunma katmanı: oneriRaporu zaten yalnız sunucunun yazdığı
    // oneri_gosterildi listesindeki butikId'leri sayar, ama uuid olmayan bir
    // değer buraya kadar sızarsa inArray(...) Postgres'te "invalid input
    // syntax for type uuid" ile 500 döner; bu yüzden sorgudan önce süzülür.
    const ids = oneri.enCokTiklanan.map((b) => b.butikId).filter((id) => UUID_RE.test(id));
    const adlar = ids.length
      ? await db
          .select({ id: boutiques.id, name: boutiques.name })
          .from(boutiques)
          .where(inArray(boutiques.id, ids))
      : [];
    const ad = new Map(adlar.map((a) => [a.id, a.name]));

    const rapor: TarzTestiRaporu = {
      range,
      katilim: katilimRaporu(cevaplar, olaylar),
      yas: yasRaporu(son),
      tarz: tarzRaporu(son),
      fiyatRenk: fiyatRenkRaporu(son),
      oneri: {
        ...oneri,
        enCokTiklanan: oneri.enCokTiklanan.map((b) => ({ ...b, ad: ad.get(b.butikId) ?? '—' })),
      },
      senaryo: senaryoRaporu(son),
      detayli: detayliTestRaporu(
        detayliSatirlar.map((s) => s.cevaplar),
        olaylar,
      ),
    };
    return c.json(rapor);
  },
);
