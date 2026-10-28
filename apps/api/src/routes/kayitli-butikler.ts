import { boutiqueCategories, boutiqueSuggestions, boutiques, categories, kayitliButikler } from '@butika/db';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthContext, requireAuth } from '../lib/auth';
import { db } from '../lib/db';
import { ApiError } from '../lib/errors';
import { resolveMarket } from '../lib/market';
import { type InstagramEki, siteyiDogrula } from '../lib/butik-dogrula';
import { instagramProfili, instagramServisiAcikMi } from '../lib/instagram-profil';
import { logger } from '../lib/logger';
import { urunuKaydet } from '../lib/kayit/urun-kaydet';
import { sayfaTuru } from '../lib/kayit/sayfa-turu';
import { alanAdi, paylasimiCoz } from '../lib/paylasim-coz';
import { urunSayfasiOku } from '../lib/urun-sayfasi';
import { rateLimit } from '../lib/rate-limit';

// Kullanıcının kaydettiği butikler ("Butiklerim") ve telefonun paylaşım menüsünden
// gelen Instagram/site linkiyle butik kaydetme ("Paylaş… → Butika").
//
// Butik olmayan hiçbir şey kaydedilmez: link Butika'daki bir butikle eşleşmezse
// yalnız admin'in onaylayacağı bir öneri oluşur (status 'dogrulama_bekliyor'),
// katalog asla kendiliğinden büyümez.
export const kayitliButikRoutes = new Hono<AuthContext>();

kayitliButikRoutes.use('*', requireAuth);

const butikAlanlari = {
  id: boutiques.id,
  name: boutiques.name,
  url: boutiques.url,
  coverImageUrl: boutiques.coverImageUrl,
  logoUrl: boutiques.logoUrl,
};

// Butik sitesinin "www." olmadan alan adı (SQL tarafı; paylasim-coz.ts alanAdi ile aynı kural).
const butikAlani = sql<string>`lower(regexp_replace(regexp_replace(${boutiques.url}, '^https?://', '', 'i'), '^www\\.|[/:?#].*$', '', 'gi'))`;

kayitliButikRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const rows = await db
    .select({
      ...butikAlanlari,
      kaynak: kayitliButikler.kaynak,
      createdAt: kayitliButikler.createdAt,
      isActive: boutiques.isActive,
    })
    .from(kayitliButikler)
    .innerJoin(boutiques, eq(kayitliButikler.boutiqueId, boutiques.id))
    .where(and(eq(kayitliButikler.userId, userId), gorunurButik(userId)))
    .orderBy(desc(kayitliButikler.createdAt));
  return c.json(
    rows.map(({ isActive, ...r }) => ({ ...r, onayBekliyor: !isActive, createdAt: r.createdAt.toISOString() })),
  );
});

async function kaydet(userId: string, boutiqueId: string, kaynak: string) {
  await db.insert(kayitliButikler).values({ userId, boutiqueId, kaynak }).onConflictDoNothing();
}

kayitliButikRoutes.post(
  '/',
  zValidator('json', z.object({ boutiqueId: z.string().uuid() })),
  async (c) => {
    const userId = c.get('userId');
    const { boutiqueId } = c.req.valid('json');
    const [butik] = await db
      .select({ id: boutiques.id })
      .from(boutiques)
      .where(and(eq(boutiques.id, boutiqueId), gorunurButik(userId)))
      .limit(1);
    if (!butik) throw ApiError.notFound('boutique not found');
    await kaydet(userId, boutiqueId, 'uygulama');
    return c.json({ ok: true }, 201);
  },
);

kayitliButikRoutes.delete('/:boutiqueId', async (c) => {
  const userId = c.get('userId');
  const boutiqueId = c.req.param('boutiqueId');
  if (!z.string().uuid().safeParse(boutiqueId).success) throw ApiError.notFound('boutique not found');
  await db
    .delete(kayitliButikler)
    .where(and(eq(kayitliButikler.userId, userId), eq(kayitliButikler.boutiqueId, boutiqueId)));
  return c.json({ ok: true });
});

// POST /kayitli-butikler/paylasim { metin } — paylaşım menüsünden gelen metin.
// Yanıt `durum`:
//   kaydedildi        → butik Butika'da, kullanıcının butiklerine eklendi (butik alanı dolu)
//   eklendi           → Butika'da yoktu; site gerçek bir butik çıktı, kullanıcı ekledi (butik alanı
//                       dolu). Admin onayına kadar yalnız ekleyenin Butiklerim'inde görünür.
//   butik_degil       → hesap/site bir butik değil (kişisel hesap, haber, toptancı, mağaza değil…)
//   site_yok          → Instagram hesabının biyografisinde web sitesi yok
//   oneri_alindi      → Instagram servisi kapalı: hesap admin önerisi oldu (kullanıcıya bir şey eklenmedi)
//   gonderi_yakinda   → gönderi/reel linki; ürün kaydı sonraki adımda gelecek
//   urun_kaydedildi   → paylaşılan sayfa bir ürün: butik (gerekirse yeni eklenerek, butikYeni) ve
//                       ürün Kayıtlı'ya alındı (urun: id, title, imageUrl)
//   anlasilmadi       → metinde tanınan bir link yok
kayitliButikRoutes.post(
  '/paylasim',
  zValidator('json', z.object({ metin: z.string().max(2000) })),
  async (c) => {
    const userId = c.get('userId');
    if (!rateLimit(`paylasim:${userId}`, 20, 60_000)) {
      return c.json({ error: { code: 'rate_limited', message: 'çok fazla istek' } }, 429);
    }
    const hedef = paylasimiCoz(c.req.valid('json').metin);
    if (!hedef) return c.json({ durum: 'anlasilmadi' });
    if (hedef.tur === 'instagram_gonderi') return c.json({ durum: 'gonderi_yakinda' });
    const market = await resolveMarket(c, c.req.query('country'));

    if (hedef.tur === 'instagram_profil') {
      const [butik] = await db
        .select(butikAlanlari)
        .from(boutiques)
        .where(and(eq(boutiques.instagram, hedef.hesap), gorunurButik(userId), eq(boutiques.countryCode, market)))
        .limit(1);
      if (butik) {
        await kaydet(userId, butik.id, 'instagram');
        return c.json({ durum: 'kaydedildi', butik });
      }
      if (!instagramServisiAcikMi()) return c.json(await oneriAc(userId, hedef.hesap, market));
      const profil = await instagramProfili(hedef.hesap);
      if (!profil) return c.json({ durum: 'butik_degil' });
      if (!profil.website) return c.json({ durum: 'site_yok' });
      const alan = alanAdi(profil.website);
      if (!alan) return c.json({ durum: 'site_yok' });
      return c.json(
        await sitedenEkle(userId, market, {
          alan,
          url: `https://${alan}`,
          hesap: hedef.hesap,
          kaynak: 'instagram',
          instagram: { ad: profil.ad, biyografi: profil.biyografi },
        }),
      );
    }
    const sonuc = await sitedenEkle(userId, market, { alan: hedef.alan, url: hedef.url, hesap: null, kaynak: 'site' });
    // Paylaşılan sayfa bir ürünse ürün de Kayıtlı'ya girer (fiyat/stok takibiyle).
    if ((sonuc.durum === 'kaydedildi' || sonuc.durum === 'eklendi') && sayfaTuru(hedef.adres) === 'urun') {
      const urun = await paylasilanUrunuKaydet(userId, sonuc.butik, hedef.adres);
      return c.json({ durum: 'urun_kaydedildi', butik: sonuc.butik, butikYeni: sonuc.durum === 'eklendi', urun });
    }
    return c.json(sonuc);
  },
);

async function paylasilanUrunuKaydet(userId: string, butik: { id: string; name: string }, adres: string) {
  const bilgi = await urunSayfasiOku(adres);
  // Sayfa okunamazsa ürün yine kaydedilir; adı adresten çıkarılır, fiyatı takip işi doldurur.
  const sonParca = new URL(adres).pathname.split('/').filter(Boolean).pop() ?? '';
  let cozulmus = sonParca;
  try {
    cozulmus = decodeURIComponent(sonParca);
  } catch {
    // bozuk %-kodlama: olduğu gibi kalır
  }
  const yedekAd = cozulmus
    .replace(/[-_]+/g, ' ')
    .replace(/\.[a-z]+$/i, '')
    .trim();
  const { urun } = await urunuKaydet({
    userId,
    boutique: butik,
    url: adres,
    title: bilgi?.title || yedekAd || butik.name,
    imageUrl: bilgi?.imageUrl ?? null,
    priceMinor: bilgi?.priceMinor ?? null,
    currency: bilgi?.currency ?? null,
  });
  return { id: urun.id, title: urun.title, imageUrl: urun.imageUrl };
}

// Görünen butik: admin'in eklediği aktif butikler, ve onay bekleyen kullanıcı butikleri yalnız
// onu ekleyen ya da listesine almış kişiye. Reddedilenler ve admin'in kapattıkları görünmez.
function gorunurButik(userId: string) {
  return or(
    eq(boutiques.isActive, true),
    and(
      eq(boutiques.kullaniciDurumu, 'bekliyor'),
      or(
        eq(boutiques.ekleyenUserId, userId),
        sql`exists (select 1 from ${kayitliButikler} k where k.boutique_id = ${boutiques.id} and k.user_id = ${userId})`,
      ),
    ),
  )!;
}

async function sitedenEkle(
  userId: string,
  market: string,
  p: {
    alan: string;
    url: string;
    hesap: string | null;
    kaynak: 'instagram' | 'site';
    /** Instagram'dan gelindiyse profil adı ve biyografisi: doğrulamada ek bağlam. */
    instagram?: InstagramEki;
  },
) {
  const [varolan] = await db
    .select({
      ...butikAlanlari,
      isActive: boutiques.isActive,
      kullaniciDurumu: boutiques.kullaniciDurumu,
      instagram: boutiques.instagram,
      ekleyenUserId: boutiques.ekleyenUserId,
    })
    .from(boutiques)
    .where(and(sql`${butikAlani} = ${p.alan}`, eq(boutiques.countryCode, market)))
    .orderBy(desc(boutiques.isActive))
    .limit(1);
  if (varolan) {
    const { isActive, kullaniciDurumu, instagram, ekleyenUserId, ...butik } = varolan;
    if (!isActive && kullaniciDurumu !== 'bekliyor') return { durum: 'butik_degil' as const };
    // Instagram hesabı yalnız kullanıcının kendi eklediği (onay bekleyen) butiğe yazılır; admin'in
    // butiklerindeki hesap adını kullanıcı paylaşımı değiştiremez (admin'den ya da listeden gelir).
    if (p.hesap && !instagram && kullaniciDurumu === 'bekliyor' && ekleyenUserId === userId) {
      await db.update(boutiques).set({ instagram: p.hesap }).where(eq(boutiques.id, butik.id));
    }
    await kaydet(userId, butik.id, p.kaynak);
    return { durum: isActive ? ('kaydedildi' as const) : ('eklendi' as const), butik };
  }

  // Yeni butik: pahalı kontrol (site + dil modeli) kişi başına günde sınırlı.
  if (!rateLimit(`paylasim-ekle:${userId}`, 10, 24 * 60 * 60_000)) return { durum: 'butik_degil' as const };
  const kategoriler = await db
    .select({ id: categories.id, ad: categories.name })
    .from(categories)
    .where(and(eq(categories.countryCode, market), eq(categories.isActive, true)));
  const karar = await siteyiDogrula(p.url, kategoriler, {}, p.instagram);
  if (!karar.butik) {
    logger.info({ alan: p.alan, neden: karar.neden }, 'paylaşım: site butik sayılmadı');
    return { durum: 'butik_degil' as const };
  }
  const butik = await db.transaction(async (tx) => {
    // Aynı site için eşzamanlı ikinci istek ikinci bir butik açmasın.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`butik-alan:${market}:${p.alan}`}))`);
    const [ayni] = await tx
      .select(butikAlanlari)
      .from(boutiques)
      .where(and(sql`${butikAlani} = ${p.alan}`, eq(boutiques.countryCode, market)))
      .limit(1);
    if (ayni) {
      await tx.insert(kayitliButikler).values({ userId, boutiqueId: ayni.id, kaynak: p.kaynak }).onConflictDoNothing();
      return ayni;
    }
    const [yeni] = await tx
      .insert(boutiques)
      .values({
        countryCode: market,
        name: karar.ad,
        description: karar.aciklama,
        url: karar.url,
        coverImageUrl: karar.kapak,
        isActive: false,
        sortOrder: 9999,
        instagram: p.hesap,
        kullaniciDurumu: 'bekliyor',
        ekleyenUserId: userId,
      })
      .returning(butikAlanlari);
    if (!yeni) throw ApiError.internal('boutique insert failed');
    await tx
      .insert(boutiqueCategories)
      .values(karar.kategoriIdleri.map((categoryId, i) => ({ boutiqueId: yeni.id, categoryId, sortOrder: i })));
    await tx.insert(kayitliButikler).values({ userId, boutiqueId: yeni.id, kaynak: p.kaynak }).onConflictDoNothing();
    return yeni;
  });
  logger.info({ butikId: butik.id, alan: p.alan }, 'paylaşım: kullanıcı yeni butik ekledi (onay bekliyor)');
  return { durum: 'eklendi' as const, butik };
}

// Instagram servisi kapalıyken Butika'da olmayan hesap: kullanıcının listesine HİÇBİR ŞEY
// eklenmez, admin'e doğrulanmamış öneri düşer. Aynı hesap için açık öneri varsa yenisi açılmaz.
async function oneriAc(userId: string, hesap: string, market: string) {
  const oneriUrl = `https://www.instagram.com/${hesap}`;
  const [acik] = await db
    .select({ id: boutiqueSuggestions.id })
    .from(boutiqueSuggestions)
    .where(eq(boutiqueSuggestions.url, oneriUrl))
    .limit(1);
  if (!acik && rateLimit(`paylasim-oneri:${userId}`, 10, 24 * 60 * 60_000)) {
    await db.insert(boutiqueSuggestions).values({
      userId,
      name: `@${hesap}`,
      url: oneriUrl,
      note: "Instagram'dan paylaşım (doğrulanmadı)",
      status: 'dogrulama_bekliyor',
      countryCode: market,
    });
  }
  return { durum: 'oneri_alindi' as const, hesap };
}
