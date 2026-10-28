import { boutiques, butikcanQueries } from '@butika/db';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthContext, requireAuth } from '../lib/auth';
import { categoryIdsByBoutique } from '../lib/boutique-categories';
import {
  MAX_ONERI,
  enAzTamamla,
  getCatalog,
  getPool,
  onElemeSorusu,
  oneCikaniBasaAl,
} from '../lib/butikcan-catalog';
import { butikcanTarzProfili, checkRate } from '../lib/butikcan-ortak';
import { kirp } from '../lib/butikcan-soru';
import { db } from '../lib/db';
import { chat, isGeminiEnabled } from '../lib/gemini';
import { logger } from '../lib/logger';
import { resolveMarket } from '../lib/market';

export const butikcanRoutes = new Hono<AuthContext>();
butikcanRoutes.use('*', requireAuth);

const MAX_HISTORY = 12; // Gemini'ye gönderilecek son mesaj sayısı (verimlilik)
// Yapay zekâ cevap veremediğinde gösterilecek butik sayısı; normal cevaptaki 6 öneriyle aynı
// (sahip isteği, 1 Eki: 3 öneri az geliyordu).
const YEDEK_ONERI = 6;

interface SerializedBoutique {
  id: string;
  categoryIds: string[];
  name: string;
  description: string;
  url: string;
  coverImageUrl: string;
  logoUrl: string | null;
  sortOrder: number;
  createdAt: string;
  reason?: string;
}

function serialize(r: typeof boutiques.$inferSelect, categoryIds: string[]): SerializedBoutique {
  return {
    id: r.id,
    categoryIds,
    name: r.name,
    description: r.description,
    url: r.url,
    coverImageUrl: r.coverImageUrl,
    logoUrl: r.logoUrl,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt.toISOString(),
  };
}

async function boutiquesByIds(ids: string[]): Promise<SerializedBoutique[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(boutiques)
    .where(and(inArray(boutiques.id, ids), eq(boutiques.isActive, true)));
  const catMap = await categoryIdsByBoutique(rows.map((r) => r.id));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [serialize(r, catMap.get(r.id) ?? [])] : [];
  });
}

async function popularBoutiques(market: string): Promise<SerializedBoutique[]> {
  const rows = await db
    .select()
    .from(boutiques)
    .where(and(eq(boutiques.countryCode, market), eq(boutiques.isActive, true)))
    .orderBy(asc(boutiques.sortOrder))
    .limit(4);
  const catMap = await categoryIdsByBoutique(rows.map((r) => r.id));
  return rows.map((r) => serialize(r, catMap.get(r.id) ?? []));
}

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'model']),
        text: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(40),
});

butikcanRoutes.post('/chat', zValidator('json', chatSchema), async (c) => {
  const userId = c.get('userId');
  const { messages } = c.req.valid('json');
  const market = await resolveMarket(c, c.req.query('country'));

  // Key yoksa kibar yedek (öneri yerine birkaç popüler butik).
  if (!isGeminiEnabled()) {
    return c.json({
      reply: 'Şu an biraz dalgınım 🙈 ama vitrinden çok sevilen birkaç butiğe göz atabilirsin!',
      boutiques: await popularBoutiques(market),
    });
  }

  if (!checkRate(userId)) {
    return c.json(
      {
        error: { code: 'rate_limited', message: 'Birazcık yavaşlayalım 🙂 birazdan devam edelim!' },
      },
      429,
    );
  }

  // Gemini yavaşlar ya da düşerse (24 Eyl 2026: Google tarafında yavaşlama, 15 sn'lik
  // sınırı aşan istekler hata döndü) kullanıcıyı boş ekranla bırakmamak için ön elemenin
  // sıralı sonucunu saklıyoruz. Bu sıra zaten soruya + tarza + segmente göre puanlanmış.
  let yedekIdler: string[] = [];
  let tarzaGoreSecildi = false;

  try {
    const recent = messages.slice(-MAX_HISTORY);
    // Ön eleme (B): son KULLANICI mesajı (asıl istek) katalog filtresine gider; ürün
    // belirtmeyen devam mesajında önceki isteğin kategorisi korunur (onElemeSorusu) →
    // Gemini'ye 702 yerine soruya en alakalı ~50 aday gider.
    const lastUserMsg = [...recent].reverse().find((m) => m.role === 'user')?.text ?? '';
    // Beden VE tarz testi bilgisi yalnız kullanıcı Butikcan'daki yapay zekâ aktarım onayını
    // verdiyse kullanılır (Apple 5.1.2(i), Açık Rıza m.1). Onay yoksa öneri, yalnız o anki
    // mesaja bakılarak üretilir — eskisi gibi.
    const { tarzProfili, kullaniciProfili, userProfile } = await butikcanTarzProfili(userId);
    const {
      text: catalog,
      ids,
      siraliIdler,
    } = await getCatalog(market, onElemeSorusu(recent), tarzProfili, kullaniciProfili);
    yedekIdler = siraliIdler;
    tarzaGoreSecildi = Boolean(tarzProfili);
    const res = await chat({ messages: recent, catalog, userProfile });

    const reasonById = new Map(res.picks.map((p) => [p.id, p.reason]));
    const geminiIdler = res.picks.map((p) => p.id).filter((id) => ids.has(id));
    // Sohbet/reddetme cevabında (picks boş) liste doldurulmaz.
    const tamam = geminiIdler.length > 0 ? enAzTamamla(geminiIdler, siraliIdler) : [];
    const validIds =
      tamam.length > 0
        ? oneCikaniBasaAl(tamam, await getPool(market), lastUserMsg).slice(0, MAX_ONERI)
        : [];
    const base = await boutiquesByIds(validIds);
    const out = base.map((b) => ({ ...b, reason: reasonById.get(b.id) }));

    // Soru kaydı — anonim (userId tutulmaz), best-effort: hata isteği düşürmez.
    const soru = kirp(lastUserMsg);
    if (soru) {
      db.insert(butikcanQueries)
        .values({
          query: soru,
          turnCount: recent.filter((m) => m.role === 'user').length,
          market,
          boutiqueCount: out.length,
        })
        .catch((err) => logger.warn({ err }, 'butikcan_queries insert failed'));
    }

    return c.json({
      reply: res.reply?.trim() || 'Buyur, seni dinliyorum ✨',
      boutiques: out,
    });
  } catch (err) {
    logger.warn({ err }, 'butikcan chat failed');

    // Yapay zekâ konuşamadı; yine de elimiz boş değil. Ön eleme butikleri soruya,
    // tarza, fiyat segmentine ve etiketlere göre zaten sıralamıştı — en iyi birkaçını
    // gösteriyoruz. Hiç aday yoksa (ör. hata getCatalog'dan önce) popülere düşüyoruz.
    let yedek = await boutiquesByIds(yedekIdler.slice(0, YEDEK_ONERI));
    if (yedek.length === 0) yedek = await popularBoutiques(market);

    if (yedek.length === 0) {
      return c.json({
        reply: 'Ay, bir aksilik oldu 🙈 birazdan tekrar yazar mısın?',
        boutiques: [],
      });
    }

    return c.json({
      reply: tarzaGoreSecildi
        ? 'Ay, kafam bir an dağıldı 🙈 ama tarzına yakın birkaç butik seçtim, göz atar mısın?'
        : 'Ay, kafam bir an dağıldı 🙈 ama aradığına yakın birkaç butik seçtim, göz atar mısın?',
      boutiques: yedek,
    });
  }
});
