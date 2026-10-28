import { boutiqueCategories, boutiques, categories } from '@butika/db';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { db } from '../../lib/db';
import { resolveMarket } from '../../lib/market';

export const adminTodoRoutes = new Hono<AdminContext>();

adminTodoRoutes.use('*', requireAdmin);

// Fiyat segmenti YALNIZCA Türkiye kataloğu için hesaplandı. Başka bir pazarda
// "segmenti yok" demek "hesaplanamadı" değil, "henüz hiç denenmedi" demektir —
// o butikleri yapılacaklar listesine koymak sahibi asla bitmeyecek bir işe sokar.
// US için de segment hesaplanırsa bu listeye 'US' eklenir.
const SEGMENT_HESAPLANAN_PAZARLAR = new Set(['TR']);

// Admin'in ELLE karara bağlaması gereken işler.
//
// Şimdilik tek tür var (fiyat segmenti). Tarz etiketleme devreye girdiğinde
// aynı listeye 'tarz' türünde satırlar eklenecek — sayfa yeniden yazılmasın
// diye yanıt baştan `tur` alanı taşıyor.
export interface TodoItem {
  tur: 'fiyat_segmenti';
  boutiqueId: string;
  butikAdi: string;
  kategoriler: string[];
  // Neden elle bakılması gerektiği — metni admin arayüzü Türkçeleştirir.
  durum: 'hic_hesaplanmadi' | 'yetersiz_veri' | 'fiyat_supheli';
  temsiliFiyatTl: string | null;
}

adminTodoRoutes.get('/', async (c) => {
  const market = await resolveMarket(c, c.req.query('country'));
  if (!SEGMENT_HESAPLANAN_PAZARLAR.has(market)) return c.json([]);

  const rows = await db
    .select({
      id: boutiques.id,
      name: boutiques.name,
      fiyatGuven: boutiques.fiyatGuven,
      temsiliFiyatTl: boutiques.temsiliFiyatTl,
      kategoriler: sql<string[]>`
        coalesce(array_agg(${categories.name} ORDER BY ${categories.sortOrder})
                 FILTER (WHERE ${categories.name} IS NOT NULL), '{}')
      `,
    })
    .from(boutiques)
    .leftJoin(boutiqueCategories, eq(boutiqueCategories.boutiqueId, boutiques.id))
    .leftJoin(categories, eq(categories.id, boutiqueCategories.categoryId))
    .where(
      and(
        eq(boutiques.countryCode, market),
        eq(boutiques.isActive, true),
        isNull(boutiques.fiyatSegmenti),
      ),
    )
    .groupBy(boutiques.id)
    .orderBy(asc(boutiques.name));

  const items: TodoItem[] = rows.map((r) => ({
    tur: 'fiyat_segmenti',
    boutiqueId: r.id,
    butikAdi: r.name,
    kategoriler: r.kategoriler ?? [],
    durum:
      r.fiyatGuven === 'fiyat_supheli'
        ? 'fiyat_supheli'
        : r.fiyatGuven === 'yetersiz_veri'
          ? 'yetersiz_veri'
          : 'hic_hesaplanmadi',
    temsiliFiyatTl: r.temsiliFiyatTl,
  }));

  return c.json(items);
});
