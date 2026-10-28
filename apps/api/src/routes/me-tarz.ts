import {
  events,
  type TarzTestiCevabi,
  boutiqueCategories,
  boutiques,
  savedProducts,
  tarzTestiCevaplari,
} from '@butika/db';
import {
  type OneriYaniti,
  type ProfilDurumu,
  type SonTarzTesti,
  type Tarz,
  tarzTestiGonderSchema,
} from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, gte } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '../env';
import type { AuthContext } from '../lib/auth';
import { db } from '../lib/db';
import type { KisiselGirdi } from '../lib/kisisel-siralama';
import { logger } from '../lib/logger';
import { resolveMarket } from '../lib/market';
import { type Oneri, type OneriAdayi, onerileriSec } from '../lib/oneriler';
import { tarzPuanlari, tarziCikar } from '../lib/profil-ozet';
import { profiliArkaplandaHesapla } from '../lib/profil/profil-kaydet';
import { profilDolu, profiliOku } from '../lib/profil/profil-kullan';
import { kayittanTestPuanlari, testSonucunuHesapla } from '../lib/tarz-testi';

// Tarz testi ve "Sana önerilen butikler". meRoutes altına bağlanır (requireAuth orada).
// Tasarım: docs/superpowers/specs/2026-09-16-tarz-testi-ve-oneriler-tasarim.md
export const meTarzRoutes = new Hono<AuthContext>();

// Profile her dönüşte aynı liste için yeni gösterim olayı yazılmasın.
const GOSTERIM_TEKRAR_MS = 30 * 60 * 1000;

export async function sonTarzTesti(userId: string): Promise<TarzTestiCevabi | undefined> {
  const [satir] = await db
    .select()
    .from(tarzTestiCevaplari)
    .where(eq(tarzTestiCevaplari.userId, userId))
    .orderBy(desc(tarzTestiCevaplari.createdAt))
    .limit(1);
  return satir;
}

function serialize(s: TarzTestiCevabi): SonTarzTesti {
  return {
    testSurumu: s.testSurumu,
    senaryo: s.senaryoCevaplari,
    acikTarzlar: s.acikTarzlar as Tarz[],
    fiyatSegmentleri: s.fiyatSegmentleri as SonTarzTesti['fiyatSegmentleri'],
    renkler: s.renkler as SonTarzTesti['renkler'],
    yasAraligi: s.yasAraligi as SonTarzTesti['yasAraligi'],
    tarz1: s.tarz1 as Tarz | null,
    tarz2: s.tarz2 as Tarz | null,
    createdAt: s.createdAt.toISOString(),
  };
}

/** Kullanıcının kayıtlı ürünlerinin butikleri (ürün başına bir satır). */
function favoriButikleri(userId: string) {
  return db
    .select({
      boutiqueId: savedProducts.boutiqueId,
      tarz1: boutiques.tarz1,
      tarz2: boutiques.tarz2,
    })
    .from(savedProducts)
    .innerJoin(boutiques, eq(boutiques.id, savedProducts.boutiqueId))
    .where(eq(savedProducts.userId, userId));
}

/** Vitrindeki "Sana özel" sıralaması için kullanıcının test + favori girdisi. */
export async function kisiselGirdi(userId: string): Promise<KisiselGirdi> {
  const [test, favoriler] = await Promise.all([sonTarzTesti(userId), favoriButikleri(userId)]);
  return {
    testPuanlari: test ? kayittanTestPuanlari(test) : null,
    favoriPuanlari: tarzPuanlari(favoriler) as Record<string, number>,
    fiyatSegmentleri: test?.fiyatSegmentleri ?? [],
    yasAraligi: test?.yasAraligi ?? null,
  };
}

// Sunucu bu kullanıcıyı profile göre sıralıyor mu (aşama 3). Mobil, tarz testi olmasa da
// "Sana özel"i buna göre gösterir. Anahtar kapalı, profil yok/boş ya da hata → false.
meTarzRoutes.get('/profil-durumu', async (c) => {
  let dolu = false;
  if (env.PROFIL_VITRIN_ENABLED) {
    try {
      dolu = profilDolu(await profiliOku(c.get('userId')));
    } catch (err) {
      logger.warn({ err }, 'profil durumu okunamadı');
    }
  }
  return c.json({ dolu } satisfies ProfilDurumu);
});

meTarzRoutes.get('/tarz-testi', async (c) => {
  const satir = await sonTarzTesti(c.get('userId'));
  return c.json(satir ? serialize(satir) : null);
});

meTarzRoutes.post('/tarz-testi', zValidator('json', tarzTestiGonderSchema), async (c) => {
  const userId = c.get('userId');
  const cevap = c.req.valid('json');
  const sonuc = testSonucunuHesapla(cevap);
  const favori = tarziCikar(await favoriButikleri(userId));
  const [satir] = await db
    .insert(tarzTestiCevaplari)
    .values({
      userId,
      testSurumu: cevap.testSurumu,
      senaryoCevaplari: cevap.senaryo,
      acikTarzlar: cevap.acikTarzlar,
      fiyatSegmentleri: cevap.fiyatSegmentleri,
      renkler: cevap.renkler,
      yasAraligi: cevap.testSurumu === 2 ? (cevap.yasAraligi ?? null) : null,
      tarz1: sonuc.tarz1,
      tarz2: sonuc.tarz2,
      senaryoTarz1: sonuc.senaryoTarz1,
      senaryoTarz2: sonuc.senaryoTarz2,
      favoriTarz1: favori.birincil,
      favoriTarz2: favori.ikincil,
      esnek: sonuc.esnek,
    })
    .returning();
  if (!satir) throw new Error('tarz testi kaydedilemedi');
  profiliArkaplandaHesapla(userId);
  return c.json(serialize(satir), 201);
});

const onerilerSorgusu = z.object({
  country: z.string().optional(),
  kategoriler: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : []))
    .pipe(z.array(z.string().uuid()).max(30)),
});

async function gosterimiKaydet(userId: string, oneriler: Oneri[]): Promise<string | null> {
  if (oneriler.length === 0) return null;
  const idler = oneriler.map((o) => o.id).join(',');
  const [son] = await db
    .select({ payload: events.payload })
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        eq(events.type, 'oneri_gosterildi'),
        gte(events.createdAt, new Date(Date.now() - GOSTERIM_TEKRAR_MS)),
      ),
    )
    .orderBy(desc(events.createdAt))
    .limit(1);
  const onceki = son?.payload as { oneriId?: string; items?: { butikId: string }[] } | undefined;
  if (onceki?.oneriId && onceki.items?.map((i) => i.butikId).join(',') === idler)
    return onceki.oneriId;

  const oneriId = crypto.randomUUID();
  await db.insert(events).values({
    userId,
    type: 'oneri_gosterildi',
    payload: {
      oneriId,
      items: oneriler.map((o, i) => ({
        butikId: o.id,
        sira: i + 1,
        puan: Math.round(o.puan * 100) / 100,
        eslesme: o.eslesme,
      })),
    },
  });
  return oneriId;
}

meTarzRoutes.get('/oneriler', zValidator('query', onerilerSorgusu), async (c) => {
  const userId = c.get('userId');
  const { country, kategoriler } = c.req.valid('query');
  const market = await resolveMarket(c, country);
  const aktifPazar = and(eq(boutiques.countryCode, market), eq(boutiques.isActive, true));

  const [test, favoriler, butikSatirlari, uyelikler] = await Promise.all([
    sonTarzTesti(userId),
    favoriButikleri(userId),
    db
      .select({
        id: boutiques.id,
        name: boutiques.name,
        coverImageUrl: boutiques.coverImageUrl,
        tarz1: boutiques.tarz1,
        tarz2: boutiques.tarz2,
        fiyatSegmenti: boutiques.fiyatSegmenti,
        createdAt: boutiques.createdAt,
      })
      .from(boutiques)
      .where(aktifPazar),
    db
      .select({
        boutiqueId: boutiqueCategories.boutiqueId,
        categoryId: boutiqueCategories.categoryId,
        sortOrder: boutiqueCategories.sortOrder,
      })
      .from(boutiqueCategories)
      .innerJoin(boutiques, eq(boutiques.id, boutiqueCategories.boutiqueId))
      .where(aktifPazar),
  ]);

  const siralar = new Map<string, Record<string, number>>();
  for (const u of uyelikler) {
    const m = siralar.get(u.boutiqueId) ?? {};
    m[u.categoryId] = u.sortOrder;
    siralar.set(u.boutiqueId, m);
  }
  const adaylar: OneriAdayi[] = butikSatirlari.map((b) => ({
    ...b,
    kategoriSiralari: siralar.get(b.id) ?? {},
  }));

  const haricButikler = new Set(favoriler.map((f) => f.boutiqueId));
  const ilgiKategorileri = new Set(kategoriler);
  for (const id of haricButikler) {
    for (const k of Object.keys(siralar.get(id) ?? {})) ilgiKategorileri.add(k);
  }

  const oneriler = onerileriSec(adaylar, {
    testPuanlari: test ? kayittanTestPuanlari(test) : null,
    favoriPuanlari: tarzPuanlari(favoriler),
    fiyatSegmentleri: test?.fiyatSegmentleri ?? [],
    ilgiKategorileri,
    onboardingKategorileri: kategoriler,
    esnek: test?.esnek ?? false,
    haricButikler,
  });

  const yanit: OneriYaniti = {
    oneriId: await gosterimiKaydet(userId, oneriler),
    items: oneriler.map(({ id, name, coverImageUrl }) => ({ id, name, coverImageUrl })),
  };
  return c.json(yanit);
});
