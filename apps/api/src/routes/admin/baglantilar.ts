import { randomBytes } from 'node:crypto';
import {
  adminUsers,
  baglantiDavetleri,
  baglantiUrunleri,
  boutiques,
  butikBaglantilari,
  butikSiparisleri,
  gonderimler,
  shopifyUygulamalari,
} from '@butika/db';
import { zValidator } from '@hono/zod-validator';
import { and, asc, count, eq, gte, inArray, isNotNull, isNull, sql, sum } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '../../env';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { magazaAdiSchema } from '../../lib/baglanti/kurallar';
import { shopifyMagazaAdi } from '../../lib/baglanti/shopify/shopify-oauth';
import { shopifyUygulamasiKaydet } from '../../lib/baglanti/shopify/shopify-uygulamalari';
import { db } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import { logger } from '../../lib/logger';

export const adminBaglantilarRoutes = new Hono<AdminContext>();

adminBaglantilarRoutes.use('*', requireAdmin);

// Bu ayın başlangıcı, Europe/Istanbul takvimine göre.
const ayBasi = sql`(date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul')`;

const ikasDavetSchema = z.object({
  platform: z.literal('ikas'),
  boutiqueId: z.string().uuid(),
  // ikas mağaza adı biliniyorsa; butik katılım sayfasında değiştiremez.
  magazaAdi: magazaAdiSchema.optional(),
});

// Shopify: mağaza başına ayrı Partner uygulaması (özel dağıtım); anahtarları admin girer.
const shopifyDavetSchema = z.object({
  platform: z.literal('shopify'),
  boutiqueId: z.string().uuid(),
  magazaAdi: z
    .string()
    .max(200)
    .transform((v, ctx) => {
      const ad = shopifyMagazaAdi(v);
      if (!ad) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'gecersiz_magaza_adi' });
      return ad ?? '';
    }),
  clientId: z.string().trim().min(1).max(200),
  clientSecret: z.string().trim().min(1).max(500),
});

// Platform yazılmadıysa ikas (eski istemciler).
const davetSchema = z.preprocess(
  (v) =>
    v && typeof v === 'object' && !Array.isArray(v) && !('platform' in v)
      ? { ...v, platform: 'ikas' }
      : v,
  z.discriminatedUnion('platform', [ikasDavetSchema, shopifyDavetSchema]),
);

const duzenleSchema = z.object({
  iadePolitikasi: z
    .string()
    .max(600)
    .nullable()
    .transform((v) => {
      const t = v?.trim();
      return t ? t : null;
    }),
});

// Davet formundaki butik seçimi için: aktif butikler (ada göre).
adminBaglantilarRoutes.get('/butikler', async (c) => {
  const rows = await db
    .select({ id: boutiques.id, name: boutiques.name, countryCode: boutiques.countryCode })
    .from(boutiques)
    .where(eq(boutiques.isActive, true))
    .orderBy(asc(boutiques.name));
  return c.json(rows);
});

adminBaglantilarRoutes.post(
  '/davet',
  // Hata yanıtı girdiyi geri yazmasın (client secret).
  zValidator('json', davetSchema, (sonuc, c) => {
    if (!sonuc.success) return c.json({ hata: 'gecersiz_istek' }, 400);
  }),
  async (c) => {
    const body = c.req.valid('json');
    const { boutiqueId, magazaAdi, platform } = body;
    const [butik] = await db
      .select({ id: boutiques.id })
      .from(boutiques)
      .where(eq(boutiques.id, boutiqueId))
      .limit(1);
    if (!butik) throw ApiError.notFound('boutique not found');

    const [admin] = await db
      .select({ email: adminUsers.email })
      .from(adminUsers)
      .where(eq(adminUsers.id, c.get('adminUserId')))
      .limit(1);
    const olusturan = admin?.email ?? c.get('adminUserId');

    if (body.platform === 'shopify' && !env.BAGLANTI_SIFRELEME_ANAHTARI) {
      logger.error('admin: şifreleme anahtarı yok, shopify anahtarı saklanamaz');
      return c.json({ hata: 'baglanti_kapali' }, 503);
    }

    const token = randomBytes(32).toString('base64url');
    const sonuc = await db.transaction(async (tx) => {
      if (body.platform === 'shopify') {
        // Aktif bağlantının uygulaması başka bir client id ile ezilmesin (admin hatası).
        const [aktif] = await tx
          .select({ clientId: shopifyUygulamalari.clientId })
          .from(butikBaglantilari)
          .leftJoin(
            shopifyUygulamalari,
            eq(shopifyUygulamalari.magaza, butikBaglantilari.magazaAdi),
          )
          .where(
            and(
              eq(butikBaglantilari.platform, 'shopify'),
              eq(butikBaglantilari.magazaAdi, body.magazaAdi),
              eq(butikBaglantilari.durum, 'aktif'),
            ),
          )
          .limit(1);
        if (aktif && aktif.clientId !== body.clientId) return 'cakisma' as const;
      }
      await tx
        .update(baglantiDavetleri)
        .set({ iptalAt: new Date() })
        .where(
          and(
            eq(baglantiDavetleri.boutiqueId, boutiqueId),
            isNull(baglantiDavetleri.kullanildiAt),
            isNull(baglantiDavetleri.iptalAt),
          ),
        );
      await tx.insert(baglantiDavetleri).values({
        token,
        boutiqueId,
        olusturan,
        platform,
        magazaAdi: magazaAdi ?? null,
        magazaAdiKaynak: magazaAdi ? 'admin' : null,
      });
      // Anahtar davetle birlikte yazılır: davet yazılamazsa anahtar da kalmaz.
      if (body.platform === 'shopify') {
        await shopifyUygulamasiKaydet(body.magazaAdi, body.clientId, body.clientSecret, tx);
      }
      return 'tamam' as const;
    });
    if (sonuc === 'cakisma') return c.json({ hata: 'shopify_anahtar_cakisiyor' }, 400);

    return c.json({ token, link: `${env.KATILIM_SAYFASI_URL}?davet=${token}` }, 201);
  },
);

adminBaglantilarRoutes.get('/', async (c) => {
  const baglantilar = await db
    .select({
      id: butikBaglantilari.id,
      boutiqueId: butikBaglantilari.boutiqueId,
      butikAdi: boutiques.name,
      platform: butikBaglantilari.platform,
      magazaAdi: butikBaglantilari.magazaAdi,
      durum: butikBaglantilari.durum,
      tahsilat: butikBaglantilari.tahsilat,
      sonUrunEsitlemeAt: butikBaglantilari.sonUrunEsitlemeAt,
      sonHata: butikBaglantilari.sonHata,
      iadePolitikasi: butikBaglantilari.iadePolitikasi,
      onayAt: butikBaglantilari.onayAt,
    })
    .from(butikBaglantilari)
    .innerJoin(boutiques, eq(boutiques.id, butikBaglantilari.boutiqueId))
    .orderBy(asc(boutiques.name));

  const butikIdleri = baglantilar.map((b) => b.boutiqueId);
  const baglantiIdleri = baglantilar.map((b) => b.id);
  if (butikIdleri.length === 0) return c.json([]);

  const [urunler, gonderim, satis] = await Promise.all([
    db
      .select({ baglantiId: baglantiUrunleri.baglantiId, adet: count() })
      .from(baglantiUrunleri)
      .where(
        and(inArray(baglantiUrunleri.baglantiId, baglantiIdleri), eq(baglantiUrunleri.aktif, true)),
      )
      .groupBy(baglantiUrunleri.baglantiId),
    db
      .select({ boutiqueId: gonderimler.boutiqueId, adet: count() })
      .from(gonderimler)
      .where(and(inArray(gonderimler.boutiqueId, butikIdleri), gte(gonderimler.createdAt, ayBasi)))
      .groupBy(gonderimler.boutiqueId),
    db
      .select({
        baglantiId: butikSiparisleri.baglantiId,
        currency: butikSiparisleri.currency,
        adet: count(),
        komisyon: sum(butikSiparisleri.komisyonMinor),
      })
      .from(butikSiparisleri)
      .where(
        and(
          inArray(butikSiparisleri.baglantiId, baglantiIdleri),
          eq(butikSiparisleri.odendi, true),
          isNotNull(butikSiparisleri.gonderimId),
          // Satış = komisyon taşıyabilen sipariş; tamamen iptal edilen sayılmaz (aylık özetle aynı).
          isNotNull(butikSiparisleri.komisyonMinor),
          gte(butikSiparisleri.siparisAt, ayBasi),
        ),
      )
      .groupBy(butikSiparisleri.baglantiId, butikSiparisleri.currency),
  ]);

  const urunMap = new Map(urunler.map((r) => [r.baglantiId, r.adet]));
  const gonderimMap = new Map(gonderim.map((r) => [r.boutiqueId, r.adet]));

  return c.json(
    baglantilar.map((b) => {
      const satirlar = satis.filter((s) => s.baglantiId === b.id);
      return {
        id: b.id,
        boutiqueId: b.boutiqueId,
        butikAdi: b.butikAdi,
        platform: b.platform,
        magazaAdi: b.magazaAdi,
        durum: b.durum,
        tahsilat: b.tahsilat,
        urunSayisi: urunMap.get(b.id) ?? 0,
        sonUrunEsitlemeAt: b.sonUrunEsitlemeAt?.toISOString() ?? null,
        sonHata: b.sonHata,
        iadePolitikasi: b.iadePolitikasi,
        onayAt: b.onayAt.toISOString(),
        buAy: {
          gonderim: gonderimMap.get(b.boutiqueId) ?? 0,
          satis: satirlar.reduce((t, s) => t + s.adet, 0),
          // Para birimi karışmasın diye ayrı ayrı.
          komisyon: satirlar
            .filter((s) => s.komisyon !== null)
            .map((s) => ({ currency: s.currency, minor: Number(s.komisyon) })),
        },
      };
    }),
  );
});

adminBaglantilarRoutes.post('/:id/kapat', async (c) => {
  const id = c.req.param('id');
  const bulundu = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(butikBaglantilari)
      // Kaldırmadaki gibi token da silinir.
      .set({ durum: 'kapali', kimlikSifreli: '', updatedAt: new Date() })
      .where(eq(butikBaglantilari.id, id))
      .returning({ id: butikBaglantilari.id });
    if (!row) return false;
    await tx
      .update(baglantiUrunleri)
      .set({ aktif: false })
      .where(eq(baglantiUrunleri.baglantiId, id));
    return true;
  });
  if (!bulundu) throw ApiError.notFound('baglanti not found');
  return c.json({ ok: true });
});

adminBaglantilarRoutes.patch('/:id', zValidator('json', duzenleSchema), async (c) => {
  const id = c.req.param('id');
  const { iadePolitikasi } = c.req.valid('json');
  const [row] = await db
    .update(butikBaglantilari)
    .set({ iadePolitikasi, updatedAt: new Date() })
    .where(eq(butikBaglantilari.id, id))
    .returning({ id: butikBaglantilari.id, iadePolitikasi: butikBaglantilari.iadePolitikasi });
  if (!row) throw ApiError.notFound('baglanti not found');
  return c.json(row);
});
