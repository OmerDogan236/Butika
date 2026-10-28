import { boutiqueCategories, boutiques, categories, kayitliButikler } from '@butika/db';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '../env';
import { type AuthContext, requireAuth } from '../lib/auth';
import { categoryIdsByBoutique } from '../lib/boutique-categories';
import { alfabetikSirala, fiyataGoreSirala, gecerliSiralama } from '../lib/boutique-sort';
import { butikCinsiyetKosulu, cinsiyetSorgusu } from '../lib/cinsiyet';
import { db } from '../lib/db';
import { editorunSeciminiSirala } from '../lib/editorun-secimi';
import { ApiError } from '../lib/errors';
import { firsatSirasinaGore } from '../lib/firsatlar';
import {
  type ProfilSiraGirdisi,
  kisiselSirala,
  profilleSirala,
  seckiyiSonaAl,
} from '../lib/kisisel-siralama';
import { logger } from '../lib/logger';
import { resolveMarket } from '../lib/market';
import { onerilendeProfilKullanilir, profiliOku, vitrinProfili } from '../lib/profil/profil-kullan';
import { kategoriEgilimiIdleri } from './me-detayli-test';
import { kisiselGirdi, sonTarzTesti } from './me-tarz';

export const boutiqueRoutes = new Hono<AuthContext>();

// Küratörlü butik kataloğu ürünün asıl değeri — kimlik doğrulaması olmadan
// tamamı tek istekle indirilebiliyordu. Yalnız giriş yapmış kullanıcılara açık.
boutiqueRoutes.use('*', requireAuth);

const listQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  categorySlug: z.string().optional(),
  country: z.string().optional(),
  // Geçersiz değer hata değil — 'onerilen'e düşer (eski istemciler bozulmasın).
  sort: z.string().optional(),
});

interface BoutiqueRow {
  id: string;
  countryCode: string;
  name: string;
  description: string;
  url: string;
  coverImageUrl: string;
  logoUrl: string | null;
  sortOrder: number;
  createdAt: Date;
  // Sıralama için okunur, yanıta KONULMAZ — fiyat verisi uygulamaya gitmez.
  tarz1: string | null;
  tarz2: string | null;
  fiyatSegmenti: string | null;
  hedefYaslar: string[] | null;
  temsiliFiyatTl: string | null;
  editorSecimi: boolean;
}

const baseColumns = {
  id: boutiques.id,
  countryCode: boutiques.countryCode,
  name: boutiques.name,
  description: boutiques.description,
  url: boutiques.url,
  coverImageUrl: boutiques.coverImageUrl,
  logoUrl: boutiques.logoUrl,
  sortOrder: boutiques.sortOrder,
  createdAt: boutiques.createdAt,
  // Yalnız sıralama için; serializeBoutique bunları dışarı vermez.
  tarz1: boutiques.tarz1,
  tarz2: boutiques.tarz2,
  fiyatSegmenti: boutiques.fiyatSegmenti,
  hedefYaslar: boutiques.hedefYaslar,
  temsiliFiyatTl: boutiques.temsiliFiyatTl,
  editorSecimi: boutiques.editorSecimi,
};

/**
 * Satırları kullanıcı profiline göre dizer; hiçbir satır çıkmaz, eşitlikte gelen sıra korunur.
 * haricKategori: listelenen kategori herkeste ortak olduğu için puana girmez.
 */
async function profilleDiz<T extends BoutiqueRow>(
  userId: string,
  market: string,
  rows: T[],
  profil: ProfilSiraGirdisi,
  haricKategori?: string,
): Promise<T[]> {
  const [egilim, kategoriler] = await Promise.all([
    kategoriEgilimiIdleri(userId, market),
    categoryIdsByBoutique(rows.map((r) => r.id)),
  ]);
  const zengin = rows.map((r) => ({
    satir: r,
    ...r,
    kategoriIdleri: (kategoriler.get(r.id) ?? []).filter((id) => id !== haricKategori),
  }));
  return profilleSirala(zengin, { ...profil, kategoriEgilimi: egilim }).map((z) => z.satir);
}

boutiqueRoutes.get('/', zValidator('query', listQuerySchema), async (c) => {
  const { categoryId, categorySlug, country, sort } = c.req.valid('query');
  const market = await resolveMarket(c, country);

  let resolvedCategoryId = categoryId;
  if (!resolvedCategoryId && categorySlug) {
    // slug pazar-içi benzersiz → çözümü pazarla kısıtla.
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.countryCode, market), eq(categories.slug, categorySlug)))
      .limit(1);
    if (!cat) return c.json([]);
    resolvedCategoryId = cat.id;
  }

  let rows: BoutiqueRow[];
  if (resolvedCategoryId) {
    rows = await db
      .select(baseColumns)
      .from(boutiques)
      .innerJoin(boutiqueCategories, eq(boutiqueCategories.boutiqueId, boutiques.id))
      .where(
        and(
          eq(boutiques.countryCode, market),
          eq(boutiques.isActive, true),
          eq(boutiqueCategories.categoryId, resolvedCategoryId),
        ),
      )
      .orderBy(asc(boutiqueCategories.sortOrder), asc(boutiques.createdAt));
  } else {
    rows = await db
      .select(baseColumns)
      .from(boutiques)
      .where(and(eq(boutiques.countryCode, market), eq(boutiques.isActive, true)))
      .orderBy(asc(boutiques.sortOrder), asc(boutiques.createdAt));
  }

  const siralama = gecerliSiralama(sort);
  let sirali: BoutiqueRow[];
  if (env.PROFIL_VITRIN_ENABLED && (siralama === 'kisisel' || siralama === 'onerilen')) {
    // Profil ile sıralama (spec 2026-10-05 §4; aşama 3): tarz + bütçe + yaş + kategori ilgisi.
    // "Sana özel": dolu her profil (test, davranış ya da ikisi). "Önerilen": yalnız testi
    // olmayan ve profili davranışla dolu kullanıcı (bugünkü uygulama ona "Sana özel"i
    // göstermiyor). Profil yok, boş ya da okunamıyorsa admin sırası. Seçki sona alınır.
    const userId = c.get('userId');
    try {
      const p = await profiliOku(userId);
      const kullan =
        siralama === 'kisisel' ||
        (p?.kaynak === 'davranis' &&
          onerilendeProfilKullanilir(p, Boolean(await sonTarzTesti(userId))));
      const profil = kullan ? vitrinProfili(p) : null;
      sirali = profil
        ? seckiyiSonaAl(await profilleDiz(userId, market, rows, profil, resolvedCategoryId))
        : rows;
    } catch (err) {
      logger.warn({ err }, 'profil siralamasi basarisiz; onerilen');
      sirali = rows;
    }
  } else if (siralama === 'kisisel') {
    // "Sana özel" (sahip kararı, 3 Eki):
    // - tarz testi yoksa: admin'deki elle sıra;
    // - test varsa: tarz testi, favoriler, bütçe ve yaş; eşitlikte admin sırası. O an
    //   seçkide olan butikler sona alınır (seçki şeridinde zaten en üstteler);
    //   detaylı test varsa ilgilenilen kategorilerdeki butikler öne, ilgilenilmeyenler arkaya.
    try {
      const girdi = await kisiselGirdi(c.get('userId'));
      if (girdi.testPuanlari) {
        // Detaylı test varsa butiğin diğer kategorileri de puana girer (spec 2026-10-16 §5).
        const egilim = await kategoriEgilimiIdleri(c.get('userId'), market);
        const kategoriler = egilim ? await categoryIdsByBoutique(rows.map((r) => r.id)) : null;
        // Listelenen kategori herkeste ortak; puana girerse §5'in farkını siler.
        const zengin = rows.map((r) => ({
          ...r,
          kategoriIdleri: (kategoriler?.get(r.id) ?? []).filter((id) => id !== resolvedCategoryId),
        }));
        sirali = seckiyiSonaAl(kisiselSirala(zengin, { ...girdi, kategoriEgilimi: egilim }));
      } else {
        sirali = rows;
      }
    } catch (err) {
      logger.warn({ err }, 'kisisel siralama basarisiz; onerilen');
      sirali = rows;
    }
  } else if (siralama === 'alfabetik') {
    sirali = alfabetikSirala(rows);
  } else {
    sirali = fiyataGoreSirala(rows, siralama);
  }

  const catMap = await categoryIdsByBoutique(sirali.map((r) => r.id));
  return c.json(sirali.map((r) => serializeBoutique(r, catMap.get(r.id) ?? [])));
});

const editorQuerySchema = z.object({ country: z.string().optional(), cinsiyet: cinsiyetSorgusu });

// Vitrinin üstündeki "Editörün Seçimi" şeridi. Kart alanları liste ile aynı + editorNotu;
// editorSecimi/editorSirasi ve sıralama alanları yanıta KONULMAZ.
// '/:id'den ÖNCE kayıtlı olmalı; yoksa yol id sanılır.
boutiqueRoutes.get('/editorun-secimi', zValidator('query', editorQuerySchema), async (c) => {
  const { country, cinsiyet } = c.req.valid('query');
  const market = await resolveMarket(c, country);
  const rows = await db
    .select({
      ...baseColumns,
      editorSirasi: boutiques.editorSirasi,
      editorNotu: boutiques.editorNotu,
    })
    .from(boutiques)
    .where(
      and(
        eq(boutiques.countryCode, market),
        eq(boutiques.isActive, true),
        eq(boutiques.editorSecimi, true),
        butikCinsiyetKosulu(cinsiyet),
      ),
    );

  // Sahip kararı (3 Eki): seçki herkese aynı, admin'deki elle sırayla.
  // Kişiye özel öneriler Butikcan'ın cevaplarında.
  const sirali = editorunSeciminiSirala(rows, null);

  const catMap = await categoryIdsByBoutique(sirali.map((r) => r.id));
  return c.json(
    sirali.map((r) => ({
      ...serializeBoutique(r, catMap.get(r.id) ?? []),
      editorNotu: r.editorNotu,
    })),
  );
});

// Fırsat sekmesi: "Hangi butiklerde indirim var?". Kart alanları liste ile aynı + firsatNotu;
// firsat/firsatSirasi ve sıralama alanları (tarz, fiyat, yaş) yanıta KONULMAZ.
// '/:id'den ÖNCE kayıtlı olmalı; yoksa yol id sanılır.
boutiqueRoutes.get('/firsatlar', zValidator('query', editorQuerySchema), async (c) => {
  const { country, cinsiyet } = c.req.valid('query');
  const market = await resolveMarket(c, country);
  const rows = await db
    .select({
      ...baseColumns,
      firsatSirasi: boutiques.firsatSirasi,
      firsatNotu: boutiques.firsatNotu,
    })
    .from(boutiques)
    .where(
      and(
        eq(boutiques.countryCode, market),
        eq(boutiques.isActive, true),
        eq(boutiques.firsat, true),
        butikCinsiyetKosulu(cinsiyet),
      ),
    );
  // Admin sırası; PROFIL_VITRIN_ENABLED açıksa profile göre (aşama 3). Hiçbir butik çıkmaz,
  // eşitlikte admin firsatSirasi; profil yok, boş ya da okunamıyorsa admin sırası.
  let sirali = firsatSirasinaGore(rows);
  if (env.PROFIL_VITRIN_ENABLED) {
    const userId = c.get('userId');
    try {
      const profil = vitrinProfili(await profiliOku(userId));
      if (profil) sirali = await profilleDiz(userId, market, sirali, profil);
    } catch (err) {
      logger.warn({ err }, 'firsat profil siralamasi basarisiz; admin sirasi');
    }
  }

  const catMap = await categoryIdsByBoutique(sirali.map((r) => r.id));
  return c.json(
    sirali.map((r) => ({
      ...serializeBoutique(r, catMap.get(r.id) ?? []),
      firsatNotu: r.firsatNotu,
    })),
  );
});

boutiqueRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(id))
    throw ApiError.badRequest('invalid_id', 'boutique id is not a UUID');

  // id global benzersiz olduğundan pazar filtresi gerekmez (detay her pazardan açılabilir).
  // Kullanıcının "Paylaş… → Butika" ile eklediği, onay bekleyen butik yalnız onu ekleyen ya da
  // listesine almış kişiye açılır (admin onayına kadar başkası göremez); vitrin listelerine girmez.
  const userId = c.get('userId');
  const [row] = await db
    .select(baseColumns)
    .from(boutiques)
    .where(
      and(
        eq(boutiques.id, id),
        or(
          eq(boutiques.isActive, true),
          and(
            eq(boutiques.kullaniciDurumu, 'bekliyor'),
            or(
              eq(boutiques.ekleyenUserId, userId),
              sql`exists (select 1 from ${kayitliButikler} k where k.boutique_id = ${boutiques.id} and k.user_id = ${userId})`,
            ),
          ),
        ),
      ),
    )
    .limit(1);
  if (!row) throw ApiError.notFound('boutique not found');

  const catMap = await categoryIdsByBoutique([row.id]);
  return c.json(serializeBoutique(row, catMap.get(row.id) ?? []));
});

function serializeBoutique(row: BoutiqueRow, categoryIds: string[]) {
  return {
    id: row.id,
    countryCode: row.countryCode,
    categoryIds,
    categoryId: categoryIds[0] ?? null, // geriye-uyum: yayındaki eski mobil sürümler için
    name: row.name,
    description: row.description,
    url: row.url,
    coverImageUrl: row.coverImageUrl,
    logoUrl: row.logoUrl,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  };
}
