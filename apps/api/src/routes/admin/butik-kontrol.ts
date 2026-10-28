import { boutiques, butikKontrolBulgulari, butikKontrolTurlari, butikSiteDurumu } from '@butika/db';
import { desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { turBaslat, turuSonunaKadarIlerlet } from '../../lib/butik-kontrol/butik-kontrol-job';
import type { SiteGozlemi } from '../../lib/butik-kontrol/siniflandir';
import { db } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import { logger } from '../../lib/logger';

type Gozle = (url: string) => Promise<SiteGozlemi>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ONEM_SIRASI: Record<string, number> = { yuksek: 0, orta: 1, dusuk: 2, bilgi: 3 };

/** Gözlemci testte sahtesiyle değiştirilebilsin diye dışarıdan verilir. */
export function butikKontrolRotalari(gozle?: Gozle) {
  const rotalar = new Hono<AdminContext>();
  rotalar.use('*', requireAdmin);

  rotalar.get('/turlar', async (c) => {
    const satirlar = await db
      .select({
        id: butikKontrolTurlari.id,
        baslangic: butikKontrolTurlari.baslangic,
        bitis: butikKontrolTurlari.bitis,
        durum: butikKontrolTurlari.durum,
        tetik: butikKontrolTurlari.tetik,
        kontrolEdilen: butikKontrolTurlari.kontrolEdilen,
        sorunlu: butikKontrolTurlari.sorunlu,
        sayilar: butikKontrolTurlari.sayilar,
        ozet: butikKontrolTurlari.ozet,
      })
      .from(butikKontrolTurlari)
      .orderBy(desc(butikKontrolTurlari.baslangic))
      .limit(30);
    return c.json(satirlar);
  });

  rotalar.get('/turlar/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID_RE.test(id)) throw ApiError.notFound('tur bulunamadı');
    const [tur] = await db.select().from(butikKontrolTurlari).where(eq(butikKontrolTurlari.id, id));
    if (!tur) throw ApiError.notFound('tur bulunamadı');
    const satirlar = await db
      .select({
        id: butikKontrolBulgulari.id,
        boutiqueId: butikKontrolBulgulari.boutiqueId,
        butikAdi: boutiques.name,
        ulke: boutiques.countryCode,
        tur: butikKontrolBulgulari.tur,
        onem: butikKontrolBulgulari.onem,
        yeni: butikKontrolBulgulari.yeni,
        kanit: butikKontrolBulgulari.kanit,
        oncekiDeger: butikKontrolBulgulari.oncekiDeger,
        simdikiDeger: butikKontrolBulgulari.simdikiDeger,
        yoksay: butikSiteDurumu.yoksay,
      })
      .from(butikKontrolBulgulari)
      .innerJoin(boutiques, eq(boutiques.id, butikKontrolBulgulari.boutiqueId))
      .leftJoin(butikSiteDurumu, eq(butikSiteDurumu.boutiqueId, butikKontrolBulgulari.boutiqueId))
      .where(eq(butikKontrolBulgulari.turId, id));
    const bulgular = satirlar
      .map(({ yoksay, ...b }) => ({
        ...b,
        yoksayildi: ((yoksay ?? {}) as Record<string, string>)[b.tur] === (b.simdikiDeger ?? ''),
      }))
      .sort(
        (a, b) =>
          (ONEM_SIRASI[a.onem] ?? 9) - (ONEM_SIRASI[b.onem] ?? 9) ||
          a.butikAdi.localeCompare(b.butikAdi, 'tr'),
      );
    return c.json({ tur, bulgular });
  });

  rotalar.post('/calistir', async (c) => {
    const arkaPlan = async (turId: string): Promise<boolean> => {
      const p = turuSonunaKadarIlerlet(turId, gozle).catch((error) => {
        logger.error(
          { turId, error: String(error).slice(0, 300) },
          'butik-kontrol: arka plan döngüsü hata verdi',
        );
        return true;
      });
      // Döngü zaten sürüyorsa söz hemen false ile çözülür; aksi halde tur arka planda sürer.
      const ilk = await Promise.race([
        p,
        new Promise<'suruyor'>((r) => setTimeout(r, 0, 'suruyor')),
      ]);
      return ilk !== false;
    };

    const yeni = await turBaslat('elle');
    if (yeni) {
      await arkaPlan(yeni);
      return c.json({ turId: yeni });
    }
    const [suren] = await db
      .select({ id: butikKontrolTurlari.id, tetik: butikKontrolTurlari.tetik })
      .from(butikKontrolTurlari)
      .where(eq(butikKontrolTurlari.durum, 'suruyor'))
      .limit(1);
    if (!suren) throw ApiError.conflict('tur_suruyor', 'tur başlatılamadı');
    // Yarım kalmış elle tur (ör. API yeniden başladı) varsa devam ettirilir.
    if (suren.tetik === 'elle' && (await arkaPlan(suren.id))) return c.json({ turId: suren.id });
    return c.json({ error: 'tur_suruyor', turId: suren.id }, 409);
  });

  rotalar.post('/bulgular/:id/yoksay', async (c) => {
    const id = c.req.param('id');
    if (!UUID_RE.test(id)) throw ApiError.notFound('bulgu bulunamadı');
    const [bulgu] = await db
      .select()
      .from(butikKontrolBulgulari)
      .where(eq(butikKontrolBulgulari.id, id));
    if (!bulgu) throw ApiError.notFound('bulgu bulunamadı');
    // karsilastir ile aynı değer: boş değer '' olarak saklanır
    const deger = bulgu.simdikiDeger ?? '';
    const yama = JSON.stringify({ [bulgu.tur]: deger });
    await db
      .insert(butikSiteDurumu)
      .values({ boutiqueId: bulgu.boutiqueId, yoksay: { [bulgu.tur]: deger } })
      .onConflictDoUpdate({
        target: butikSiteDurumu.boutiqueId,
        set: { yoksay: sql`${butikSiteDurumu.yoksay} || ${yama}::jsonb` },
      });
    return c.json({ ...bulgu, yoksayildi: true });
  });

  return rotalar;
}

export const adminButikKontrolRoutes = butikKontrolRotalari();
