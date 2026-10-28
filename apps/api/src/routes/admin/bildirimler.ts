import { bildirimPlanlari, boutiques, categories } from '@butika/db';
import {
  type AdminBildirimKitleSayilari,
  type AdminBildirimPlani,
  type BildirimDurumu,
  type BildirimKitlesi,
  bildirimGuncelleSchema,
  bildirimHedefiCoz,
  bildirimKampanyasi,
  bildirimOlusturSchema,
} from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { db } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import { duyuruAlicilari } from '../../lib/push/duyuru';

export const adminBildirimlerRoutes = new Hono<AdminContext>();

adminBildirimlerRoutes.use('*', requireAdmin);

// Planlanan zaman en az bu kadar ileride olmalı: işçi 30 sn'de bir bakıyor.
const EN_AZ_ILERI_MS = 60 * 1000;
const DUZENLENEBILIR: BildirimDurumu[] = ['taslak', 'planlandi'];

type Plan = typeof bildirimPlanlari.$inferSelect;

/** Planların hedeflediği butik ve kategorilerin adları (id → ad). */
async function hedefAdlari(rows: Plan[]): Promise<Map<string, string>> {
  const butik: string[] = [];
  const kategori: string[] = [];
  for (const r of rows) {
    const h = bildirimHedefiCoz(r.hedef);
    if (h?.tur === 'butik') butik.push(h.id);
    if (h?.tur === 'kategori') kategori.push(h.id);
  }
  const [b, k] = await Promise.all([
    butik.length
      ? db
          .select({ id: boutiques.id, ad: boutiques.name })
          .from(boutiques)
          .where(inArray(boutiques.id, butik))
      : [],
    kategori.length
      ? db
          .select({ id: categories.id, ad: categories.name })
          .from(categories)
          .where(inArray(categories.id, kategori))
      : [],
  ]);
  return new Map([...b, ...k].map((x) => [x.id, x.ad]));
}

/** Hedef butik/kategori silinmiş ya da hiç yoksa bildirim boşa açılmasın. */
async function hedefVarMi(hedef: string | null): Promise<void> {
  const h = bildirimHedefiCoz(hedef);
  if (h?.tur !== 'butik' && h?.tur !== 'kategori') return;
  const tablo = h.tur === 'butik' ? boutiques : categories;
  const [row] = await db.select({ id: tablo.id }).from(tablo).where(eq(tablo.id, h.id)).limit(1);
  if (!row) {
    throw ApiError.badRequest(
      'hedef_yok',
      h.tur === 'butik' ? 'Seçilen butik bulunamadı' : 'Seçilen kategori bulunamadı',
    );
  }
}

function serialize(r: Plan, adlar: Map<string, string>): AdminBildirimPlani {
  const h = bildirimHedefiCoz(r.hedef);
  return {
    id: r.id,
    baslik: r.baslik,
    metin: r.metin,
    kitle: r.kitle as BildirimKitlesi,
    hedef: h ? r.hedef : null,
    hedefAdi: h && 'id' in h ? (adlar.get(h.id) ?? null) : null,
    gonderimZamani: r.gonderimZamani.toISOString(),
    durum: r.durum as BildirimDurumu,
    kampanya: bildirimKampanyasi(r.id),
    aliciSayisi: r.aliciSayisi,
    basarili: r.basarili,
    hatali: r.hatali,
    gonderildiAt: r.gonderildiAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

function ileriMi(iso: string): boolean {
  return Date.parse(iso) - Date.now() >= EN_AZ_ILERI_MS;
}

// Son 30 günün ve gelecekteki tüm planlar, yeniden eskiye.
adminBildirimlerRoutes.get('/', async (c) => {
  const rows = await db
    .select()
    .from(bildirimPlanlari)
    .where(gte(bildirimPlanlari.gonderimZamani, sql`now() - interval '30 days'`))
    .orderBy(desc(bildirimPlanlari.gonderimZamani));
  const adlar = await hedefAdlari(rows);
  return c.json(rows.map((r) => serialize(r, adlar)));
});

// Şu an gönderilse kaç kişiye/cihaza giderdi (formda bilgi olarak).
adminBildirimlerRoutes.get('/kitle', async (c) => {
  const [herkes, kaydedenler] = await Promise.all([
    duyuruAlicilari('all'),
    duyuruAlicilari('savers'),
  ]);
  const say = (l: { userId: string }[]) => ({
    kisi: new Set(l.map((d) => d.userId)).size,
    cihaz: l.length,
  });
  const out: AdminBildirimKitleSayilari = { all: say(herkes), savers: say(kaydedenler) };
  return c.json(out);
});

adminBildirimlerRoutes.post('/', zValidator('json', bildirimOlusturSchema), async (c) => {
  const body = c.req.valid('json');
  if (!ileriMi(body.gonderimZamani)) {
    throw ApiError.badRequest('zaman_gecmis', 'Gönderim zamanı en az 1 dakika sonrası olmalı');
  }
  await hedefVarMi(body.hedef);
  const [row] = await db
    .insert(bildirimPlanlari)
    .values({ ...body, gonderimZamani: new Date(body.gonderimZamani) })
    .returning();
  if (!row) throw new Error('insert returned no row');
  return c.json(serialize(row, await hedefAdlari([row])), 201);
});

// Yalnız taslak/planlandi iken: metin, zaman, kitle, hedef, onay (planlandi) ya da iptal.
adminBildirimlerRoutes.patch('/:id', zValidator('json', bildirimGuncelleSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const [mevcut] = await db
    .select()
    .from(bildirimPlanlari)
    .where(eq(bildirimPlanlari.id, id))
    .limit(1);
  if (!mevcut) throw ApiError.notFound('bildirim bulunamadı');
  if (!DUZENLENEBILIR.includes(mevcut.durum as BildirimDurumu)) {
    throw ApiError.badRequest('duzenlenemez', 'Gönderilmiş ya da kapanmış bildirim değiştirilemez');
  }
  const zaman = body.gonderimZamani ?? mevcut.gonderimZamani.toISOString();
  if (
    body.durum !== 'iptal' &&
    (body.gonderimZamani || body.durum === 'planlandi') &&
    !ileriMi(zaman)
  ) {
    throw ApiError.badRequest('zaman_gecmis', 'Gönderim zamanı en az 1 dakika sonrası olmalı');
  }
  if (body.hedef !== undefined) await hedefVarMi(body.hedef);
  const { gonderimZamani, ...diger } = body;
  const [row] = await db
    .update(bildirimPlanlari)
    .set({
      ...diger,
      ...(gonderimZamani ? { gonderimZamani: new Date(gonderimZamani) } : {}),
      updatedAt: sql`now()`,
    })
    // İşçi aynı anda almış olabilir: yalnız hâlâ düzenlenebilirken yaz.
    .where(
      sql`${bildirimPlanlari.id} = ${id} and ${bildirimPlanlari.durum} in ('taslak','planlandi')`,
    )
    .returning();
  if (!row) throw ApiError.badRequest('gonderime_alindi', 'Bildirim bu arada gönderime alındı');
  return c.json(serialize(row, await hedefAdlari([row])));
});
