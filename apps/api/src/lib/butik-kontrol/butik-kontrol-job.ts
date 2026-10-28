import { boutiques, butikKontrolBulgulari, butikKontrolTurlari, butikSiteDurumu } from '@butika/db';
import { and, asc, desc, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { curlFetch } from '../curl-fetch';
import { db } from '../db';
import { logger } from '../logger';
import { brevoHazirMi, brevoMailGonder } from '../outreach/brevo';
import { type OncekiDurum, karsilastir } from './karsilastir';
import { epostaIcerigi, raporMetni } from './rapor';
import { type BulguTuru, type SiteGozlemi, siniflandir } from './siniflandir';
import { butikaAlanAdiMi, siteGozlemi } from './site-gozlemi';
import { epostaZamaniMi, haftalikTurZamaniMi, turHaftasi } from './zamanlama';

export { epostaZamaniMi, haftalikTurZamaniMi, turHaftasi } from './zamanlama';

// Haftalık butik değişim dedektörü işçisi. Yalnız okur (butik siteleri) ve
// yeni tablolara yazar; hiçbir butik kaydını değiştirmez.

// Shopify aynı IP'den art arda gelen isteklere 429 veriyor: siteler tek tek,
// aralarında kısa bekleme ile okunur (820 butik ≈ 40 dk; haftalık iş için yeterli)
const ESZAMANLI = 1;
const SITE_ARASI_MS = process.env.NODE_ENV === 'test' ? 0 : 1500;
const VARSAYILAN_PARCA = 24;
const SAKLAMA_GUN = 26 * 7;
const EPOSTA_ALICI = 'hello@butika.ai';
const ADMIN_URL = 'https://admin.butika.ai/butik-kontrol';
const ONEM_SIRASI: Record<string, number> = { yuksek: 0, orta: 1, dusuk: 2, bilgi: 3 };
// Brevo hatasında: saatte en çok bir deneme, tur başına en çok 12
const EPOSTA_TEKRAR_MS = 60 * 60 * 1000;
const EPOSTA_EN_COK_DENEME = 12;
// "Şimdi çalıştır" döngüsünde parçalar arası bekleme
const PARCA_ARASI_MS = 200;
// Tur başlatma ve butik başına işleme için Postgres danışma kilitleri
const TUR_KILIDI = sql`hashtext('butik_kontrol_tur_baslat')`;

type Gozle = (url: string, ulke: string) => Promise<SiteGozlemi>;
const varsayilanGozle: Gozle = (url, ulke) => siteGozlemi(url, curlFetch, { ulke });

/** Yeni tur açar. Süren bir tur varsa ya da bu hafta haftalık tur açıldıysa null. */
export async function turBaslat(tetik: 'haftalik' | 'elle'): Promise<string | null> {
  const hafta = turHaftasi(new Date());
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${TUR_KILIDI})`);
    const [suren] = await tx
      .select({ id: butikKontrolTurlari.id })
      .from(butikKontrolTurlari)
      .where(eq(butikKontrolTurlari.durum, 'suruyor'))
      .limit(1);
    if (suren) return null;
    if (tetik === 'haftalik') {
      const [var_] = await tx
        .select({ id: butikKontrolTurlari.id })
        .from(butikKontrolTurlari)
        .where(
          and(
            eq(butikKontrolTurlari.tetik, 'haftalik'),
            eq(butikKontrolTurlari.haftaAnahtari, hafta),
          ),
        )
        .limit(1);
      if (var_) return null;
    }
    const [yeni] = await tx
      .insert(butikKontrolTurlari)
      .values({ tetik, haftaAnahtari: hafta })
      .returning({ id: butikKontrolTurlari.id });
    const id = yeni?.id ?? null;
    logger.info({ turId: id, tetik, hafta }, 'butik-kontrol: tur başladı');
    return id;
  });
}

/** Bu turda henüz işlenmemiş, taranacak butikler (aktif, TR/US, Butika dışı). */
function bekleyenKosulu(turId: string) {
  return and(
    eq(boutiques.isActive, true),
    inArray(boutiques.countryCode, ['TR', 'US']),
    sql`${boutiques.url} !~* '^([a-z]+://)?[^/?#]*butika\\.ai'`,
    sql`not exists (select 1 from ${butikSiteDurumu} where ${butikSiteDurumu.boutiqueId} = ${boutiques.id}
      and ${butikSiteDurumu.turId} = ${turId})`,
  );
}

/** Aynı bağlamdaki (elle ya da haftalık) değil, herhangi bir son tamamlanmış tur. */
async function oncekiTamamTur(turId: string): Promise<string | null> {
  const [onceki] = await db
    .select({ id: butikKontrolTurlari.id })
    .from(butikKontrolTurlari)
    .where(and(eq(butikKontrolTurlari.durum, 'tamam'), ne(butikKontrolTurlari.id, turId)))
    .orderBy(desc(butikKontrolTurlari.bitis))
    .limit(1);
  return onceki?.id ?? null;
}

async function butikIsle(
  turId: string,
  oncekiTurId: string | null,
  b: { id: string; name: string; url: string; countryCode: string },
  gozle: Gozle,
): Promise<void> {
  let g: SiteGozlemi;
  if (butikaAlanAdiMi(b.url)) {
    // SQL süzgecinden kaçan Butika adresi (ör. '//butika.ai/x'): istek atılmaz,
    // bulgu yazılmaz ama bu turda işlendi sayılır (yoksa tur bitmez).
    await db
      .insert(butikSiteDurumu)
      .values({ boutiqueId: b.id, turId })
      .onConflictDoUpdate({ target: butikSiteDurumu.boutiqueId, set: { turId } });
    return;
  }
  try {
    g = await gozle(b.url, b.countryCode);
  } catch (e) {
    logger.warn(
      { boutiqueId: b.id, error: String(e).slice(0, 200) },
      'butik-kontrol: gözlem hatası',
    );
    g = {
      hata: `gozlem_hatasi: ${String(e).slice(0, 200)}`,
      status: null,
      sonUrl: null,
      html: '',
      shopifyParaBirimi: null,
    };
  }
  const { bulgular: ham, ozet } = siniflandir(
    { id: b.id, ad: b.name, url: b.url, ulke: b.countryCode },
    g,
  );

  const oncekiBulgular = new Map<BulguTuru, string | null>();
  if (oncekiTurId) {
    const satirlar = await db
      .select({ tur: butikKontrolBulgulari.tur, simdikiDeger: butikKontrolBulgulari.simdikiDeger })
      .from(butikKontrolBulgulari)
      .where(
        and(
          eq(butikKontrolBulgulari.turId, oncekiTurId),
          eq(butikKontrolBulgulari.boutiqueId, b.id),
        ),
      );
    for (const s of satirlar) oncekiBulgular.set(s.tur as BulguTuru, s.simdikiDeger);
  }

  await db.transaction(async (tx) => {
    // Aynı butik iki kez işlenmesin (yeniden başlatma, eşzamanlı döngü)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`butik_kontrol:${b.id}`}))`);
    const [durum] = await tx
      .select()
      .from(butikSiteDurumu)
      .where(eq(butikSiteDurumu.boutiqueId, b.id));
    if (durum?.turId === turId) return;
    const onceki: OncekiDurum = durum
      ? {
          sonAlanAdi: durum.sonAlanAdi,
          sonParaBirimi: durum.sonParaBirimi,
          sonBaslik: durum.sonBaslik,
          ardisikAcilmama: durum.ardisikAcilmama,
          yoksay: (durum.yoksay ?? {}) as Record<string, string>,
        }
      : null;
    const { bulgular, yeniDurum } = karsilastir(onceki, ham, ozet, oncekiBulgular);

    await tx
      .delete(butikKontrolBulgulari)
      .where(
        and(eq(butikKontrolBulgulari.turId, turId), eq(butikKontrolBulgulari.boutiqueId, b.id)),
      );
    if (bulgular.length) {
      await tx
        .insert(butikKontrolBulgulari)
        .values(bulgular.map((x) => ({ ...x, turId, boutiqueId: b.id })));
    }
    const alanlar = {
      sonAlanAdi: yeniDurum.sonAlanAdi,
      sonParaBirimi: yeniDurum.sonParaBirimi,
      sonBaslik: yeniDurum.sonBaslik,
      ardisikAcilmama: yeniDurum.ardisikAcilmama,
      sonKontrol: new Date(),
      turId,
    };
    // yoksay yalnız admin'den yazılır; burada ezilmez
    await tx
      .insert(butikSiteDurumu)
      .values({ boutiqueId: b.id, ...alanlar })
      .onConflictDoUpdate({ target: butikSiteDurumu.boutiqueId, set: alanlar });
  });
}

async function turuBitir(turId: string): Promise<void> {
  const bulgular = await db
    .select({
      tur: butikKontrolBulgulari.tur,
      onem: butikKontrolBulgulari.onem,
      boutiqueId: butikKontrolBulgulari.boutiqueId,
    })
    .from(butikKontrolBulgulari)
    .where(eq(butikKontrolBulgulari.turId, turId));
  const sayilar: Partial<Record<BulguTuru, { toplam: number; yuksek: number }>> = {};
  const sorunluButikler = new Set<string>();
  for (const b of bulgular) {
    const tur = b.tur as BulguTuru;
    const s = sayilar[tur] ?? { toplam: 0, yuksek: 0 };
    sayilar[tur] = s;
    s.toplam++;
    if (b.onem === 'yuksek') s.yuksek++;
    if (b.tur !== 'elle_bak') sorunluButikler.add(b.boutiqueId);
  }
  // Atlanan Butika adresleri (tur_id yazılır ama taranmaz) sayılmaz
  const islenenler = await db
    .select({ url: boutiques.url })
    .from(butikSiteDurumu)
    .innerJoin(boutiques, eq(boutiques.id, butikSiteDurumu.boutiqueId))
    .where(eq(butikSiteDurumu.turId, turId));
  const n = islenenler.filter((x) => !butikaAlanAdiMi(x.url)).length;
  await db
    .update(butikKontrolTurlari)
    .set({
      durum: 'tamam',
      bitis: new Date(),
      kontrolEdilen: n,
      sorunlu: sorunluButikler.size,
      sayilar,
      ozet: raporMetni({ kontrolEdilen: n, sayilar }),
    })
    .where(and(eq(butikKontrolTurlari.id, turId), eq(butikKontrolTurlari.durum, 'suruyor')));
  logger.info(
    { turId, kontrolEdilen: n, sorunlu: sorunluButikler.size },
    'butik-kontrol: tur tamamlandı',
  );
}

async function bekleyenSayisi(turId: string): Promise<number> {
  const [satir] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(boutiques)
    .where(bekleyenKosulu(turId));
  return satir?.n ?? 0;
}

/**
 * Turdan en çok `limit` butiği (tek tek) işler. Yeniden çağrılabilir:
 * yarıda kalan tur, `butik_site_durumu.tur_id` bu tur olmayan butiklerden sürer.
 */
export async function turIlerlet(
  turId: string,
  gozle: Gozle = varsayilanGozle,
  limit = VARSAYILAN_PARCA,
): Promise<{ islenen: number; bitti: boolean }> {
  const [tur] = await db
    .select({ durum: butikKontrolTurlari.durum })
    .from(butikKontrolTurlari)
    .where(eq(butikKontrolTurlari.id, turId));
  if (!tur || tur.durum !== 'suruyor') return { islenen: 0, bitti: true };

  const secilen = await db
    .select({
      id: boutiques.id,
      name: boutiques.name,
      url: boutiques.url,
      countryCode: boutiques.countryCode,
    })
    .from(boutiques)
    .where(bekleyenKosulu(turId))
    .orderBy(asc(boutiques.id))
    .limit(limit);
  const oncekiTurId = await oncekiTamamTur(turId);

  const kuyruk = [...secilen];
  const isciler = await Promise.allSettled(
    Array.from({ length: ESZAMANLI }, async () => {
      for (let b = kuyruk.shift(); b; b = kuyruk.shift()) {
        await butikIsle(turId, oncekiTurId, b, gozle);
        if (SITE_ARASI_MS > 0) await new Promise((r) => setTimeout(r, SITE_ARASI_MS));
      }
    }),
  );
  for (const i of isciler) if (i.status === 'rejected') throw i.reason;

  const [kalan] = await db
    .select({ id: boutiques.id })
    .from(boutiques)
    .where(bekleyenKosulu(turId))
    .limit(1);
  if (kalan) return { islenen: secilen.length, bitti: false };
  await turuBitir(turId);
  return { islenen: secilen.length, bitti: true };
}

/**
 * Son tamamlanmış haftalık tur sorunluysa (yeni ya da yüksek önemde bulgu),
 * pazartesi 09:00 sonrası bir kez hello@butika.ai'ye gönderir.
 */
// Başarısız gönderimler (süreç içinde; yeniden başlatmada sıfırlanır)
const epostaHatalari = new Map<string, { son: number; deneme: number }>();

export async function epostaGonderGerekirse(simdi = new Date()): Promise<void> {
  if (!brevoHazirMi() || !epostaZamaniMi(simdi)) return;
  const [tur] = await db
    .select()
    .from(butikKontrolTurlari)
    .where(and(eq(butikKontrolTurlari.tetik, 'haftalik'), eq(butikKontrolTurlari.durum, 'tamam')))
    .orderBy(desc(butikKontrolTurlari.bitis))
    .limit(1);
  if (!tur || tur.epostaGonderildiAt || tur.haftaAnahtari !== turHaftasi(simdi)) return;
  const onceki = epostaHatalari.get(tur.id);
  if (
    onceki &&
    (onceki.deneme >= EPOSTA_EN_COK_DENEME || simdi.getTime() - onceki.son < EPOSTA_TEKRAR_MS)
  )
    return;

  const bulgular = await db
    .select({
      ad: boutiques.name,
      tur: butikKontrolBulgulari.tur,
      onem: butikKontrolBulgulari.onem,
      yeni: butikKontrolBulgulari.yeni,
      kanit: butikKontrolBulgulari.kanit,
    })
    .from(butikKontrolBulgulari)
    .innerJoin(boutiques, eq(boutiques.id, butikKontrolBulgulari.boutiqueId))
    .where(eq(butikKontrolBulgulari.turId, tur.id));
  const sorunVar = bulgular.some((b) => b.tur !== 'elle_bak' && (b.yeni || b.onem === 'yuksek'));
  if (!sorunVar) return;

  // Önce işaretle: iki süreç aynı anda gönderemesin
  const [alindi] = await db
    .update(butikKontrolTurlari)
    .set({ epostaGonderildiAt: new Date() })
    .where(and(eq(butikKontrolTurlari.id, tur.id), isNull(butikKontrolTurlari.epostaGonderildiAt)))
    .returning({ id: butikKontrolTurlari.id });
  if (!alindi) return;

  const enOnemliler = [...bulgular]
    .sort(
      (a, b) =>
        (ONEM_SIRASI[a.onem] ?? 9) - (ONEM_SIRASI[b.onem] ?? 9) || Number(b.yeni) - Number(a.yeni),
    )
    .slice(0, 10)
    .map((b) => ({ ad: b.ad, tur: b.tur as BulguTuru, kanit: b.kanit }));
  const sonuc = await brevoMailGonder(
    EPOSTA_ALICI,
    epostaIcerigi(tur.ozet ?? '', enOnemliler, ADMIN_URL),
    ['butik-kontrol'],
  );
  if (!sonuc.ok) {
    const deneme = (onceki?.deneme ?? 0) + 1;
    epostaHatalari.set(tur.id, { son: simdi.getTime(), deneme });
    logger.error(
      { turId: tur.id, deneme, hata: sonuc.hata.slice(0, 80) },
      'butik-kontrol: e-posta gönderilemedi',
    );
    await db
      .update(butikKontrolTurlari)
      .set({ epostaGonderildiAt: null })
      .where(eq(butikKontrolTurlari.id, tur.id));
    return;
  }
  epostaHatalari.delete(tur.id);
  logger.info({ turId: tur.id }, 'butik-kontrol: e-posta gönderildi');
}

/** 26 haftadan eski turları siler (bulgular cascade ile gider). */
export async function eskiTurlariTemizle(): Promise<number> {
  const sinir = new Date(Date.now() - SAKLAMA_GUN * 86_400_000);
  const silinen = await db
    .delete(butikKontrolTurlari)
    .where(lt(butikKontrolTurlari.baslangic, sinir))
    .returning({ id: butikKontrolTurlari.id });
  if (silinen.length)
    logger.info({ silinen: silinen.length }, 'butik-kontrol: eski turlar silindi');
  return silinen.length;
}

// Tek süreç içinde aynı anda yalnız bir ilerletme döngüsü (işçi ya da "Şimdi çalıştır").
let ilerliyor = false;
let jobRunning = false;
let sonTemizlik = 0;

/** "Şimdi çalıştır" için: turu bitene kadar arka planda ilerletir. Başka döngü varsa false. */
export async function turuSonunaKadarIlerlet(
  turId: string,
  gozle: Gozle = varsayilanGozle,
): Promise<boolean> {
  if (ilerliyor) return false;
  ilerliyor = true;
  try {
    let kalan = await bekleyenSayisi(turId);
    for (;;) {
      const { islenen, bitti } = await turIlerlet(turId, gozle);
      if (bitti || islenen === 0) break;
      const yeniKalan = await bekleyenSayisi(turId);
      if (yeniKalan >= kalan) {
        // İlerleme yok: sıkı döngüye girme; tur 'suruyor' kalır, işçi sonra dener
        logger.warn({ turId, kalan: yeniKalan }, 'butik-kontrol: tur ilerlemiyor, durduruldu');
        break;
      }
      kalan = yeniKalan;
      await new Promise((r) => setTimeout(r, PARCA_ARASI_MS));
    }
    return true;
  } catch (error) {
    logger.error(
      { turId, error: String(error).slice(0, 300) },
      'butik-kontrol: tur ilerletilemedi',
    );
    return true;
  } finally {
    ilerliyor = false;
  }
}

async function adim(): Promise<void> {
  const simdi = new Date();
  const [haftalik] = await db
    .select({ id: butikKontrolTurlari.id })
    .from(butikKontrolTurlari)
    .where(
      and(
        eq(butikKontrolTurlari.tetik, 'haftalik'),
        eq(butikKontrolTurlari.haftaAnahtari, turHaftasi(simdi)),
      ),
    )
    .limit(1);
  if (haftalikTurZamaniMi(simdi, !!haftalik)) await turBaslat('haftalik');

  const [suren] = await db
    .select({ id: butikKontrolTurlari.id })
    .from(butikKontrolTurlari)
    .where(eq(butikKontrolTurlari.durum, 'suruyor'))
    .orderBy(asc(butikKontrolTurlari.baslangic))
    .limit(1);
  if (suren && !ilerliyor) {
    ilerliyor = true;
    try {
      await turIlerlet(suren.id);
    } finally {
      ilerliyor = false;
    }
  }

  await epostaGonderGerekirse(simdi);
  if (Date.now() - sonTemizlik > 86_400_000) {
    sonTemizlik = Date.now();
    await eskiTurlariTemizle();
  }
}

async function runGuarded() {
  if (jobRunning) return;
  jobRunning = true;
  try {
    await adim();
  } catch (error) {
    logger.error({ error: String(error).slice(0, 300) }, 'butik-kontrol: adım başarısız');
  } finally {
    jobRunning = false;
  }
}

export function startButikKontrolJob(): void {
  void runGuarded();
  setInterval(() => {
    void runGuarded();
  }, 60_000);
}
