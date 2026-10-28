import { contactDiscoveryJobs } from '@butika/db';
import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { db } from '../db';
import { logger } from '../logger';
import { iletisimBilgisiAra } from './discover-contacts';
import { taramaSonucunuKaydet } from './store-contacts';

// Toplu iletisim taramasi kuyrugu.
//
// push_outbox ile ayni desen: DB tabanli kuyruk + kiralama (lease).
// - Tarayici sekmesi kapansa da is surer (calisan sunucuda).
// - Sunucu yeniden baslarsa yarim kalan isin kirasi dolar ve is tekrar alinir.
// - Ayni is iki kez islenmez (FOR UPDATE SKIP LOCKED).
//
// Sahibin kurallari degismiyor: adres tahmin edilmez, sonuclar 'onay_bekliyor'
// olarak gelir, hicbiri kendiliginden 'onaylandi' olmaz.

/** Ayni anda en fazla kac butik taranir. Fiyat takibiyle ayni: 2. */
const ESZAMANLI = 2;
/** Bir turda alinacak en fazla is. Tur basi ~20-30 sn surer. */
const TUR_BASINA = 10;
/** Kac basarisiz denemeden sonra "tarama hatasi" olarak birakilir. */
const MAKS_DENEME = 3;
/** Kira suresi: is bu sure icinde bitmezse baska bir kopya devralabilir. */
const KIRA_MS = 3 * 60 * 1000;
const TUR_ARALIGI_MS = 10_000;

type Job = typeof contactDiscoveryJobs.$inferSelect;

/**
 * Hatadan sonra ne kadar beklenecek. Ustel artis: 1dk, 4dk, 9dk...
 * Fiyat takibindeki mantikla ayni: siteyi rahatsiz etmemek icin agirdan al.
 */
export function beklemeSuresiMs(deneme: number): number {
  const dakika = Math.min(deneme * deneme, 30);
  return dakika * 60 * 1000;
}

async function isAl(): Promise<Job | null> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [satir] = await tx
      .select()
      .from(contactDiscoveryJobs)
      .where(
        and(
          // 'running' da alinir: sunucu yeniden baslarsa o an islenen isler
          // 'running' kalir; kirasi dolunca yeniden alinabilmeli, yoksa o
          // butikler sonsuza kadar asili kalirdi.
          inArray(contactDiscoveryJobs.status, ['pending', 'running']),
          lte(contactDiscoveryJobs.nextAttemptAt, now),
          or(isNull(contactDiscoveryJobs.lockedUntil), lte(contactDiscoveryJobs.lockedUntil, now)),
        ),
      )
      .orderBy(asc(contactDiscoveryJobs.nextAttemptAt))
      .limit(1)
      .for('update', { skipLocked: true });
    if (!satir) return null;

    const [is] = await tx
      .update(contactDiscoveryJobs)
      .set({
        status: 'running',
        leaseToken: crypto.randomUUID(),
        lockedUntil: new Date(now.getTime() + KIRA_MS),
        attempts: satir.attempts + 1,
        updatedAt: now,
      })
      .where(eq(contactDiscoveryJobs.id, satir.id))
      .returning();
    return is ?? null;
  });
}

// Guncelleme daima kira jetonuyla: bu arada baska bir kopya isi devraldiysa
// bizim yazmamiz gecmez.
const sahibiyiz = (is: Job) =>
  and(eq(contactDiscoveryJobs.id, is.id), eq(contactDiscoveryJobs.leaseToken, is.leaseToken ?? ''));

async function isiBitir(is: Job, degerler: Partial<typeof contactDiscoveryJobs.$inferInsert>) {
  await db
    .update(contactDiscoveryJobs)
    .set({ ...degerler, leaseToken: null, lockedUntil: null, updatedAt: new Date() })
    .where(sahibiyiz(is));
}

async function isiIsle(is: Job): Promise<void> {
  try {
    const sonuc = await iletisimBilgisiAra(is.url);
    await taramaSonucunuKaydet(sonuc);

    // "E-posta bulunamadi" bir HATA DEGIL, gecerli bir sonuctur: is tamamdir.
    // Yalniz siteye hic ulasilamadiysa tekrar deneriz.
    const ulasilamadi = sonuc.hata === 'site_acilmadi';
    if (ulasilamadi && is.attempts < MAKS_DENEME) {
      await isiBitir(is, {
        status: 'pending',
        lastError: 'site_acilmadi',
        nextAttemptAt: new Date(Date.now() + beklemeSuresiMs(is.attempts)),
      });
      return;
    }

    await isiBitir(is, {
      status: ulasilamadi ? 'failed' : 'done',
      lastError: sonuc.hata,
      foundCount: sonuc.adaylar.length,
      finishedAt: new Date(),
    });
  } catch (err) {
    const mesaj = err instanceof Error ? err.message.slice(0, 300) : 'bilinmeyen hata';
    if (is.attempts < MAKS_DENEME) {
      await isiBitir(is, {
        status: 'pending',
        lastError: mesaj,
        nextAttemptAt: new Date(Date.now() + beklemeSuresiMs(is.attempts)),
      });
      return;
    }
    await isiBitir(is, { status: 'failed', lastError: mesaj, finishedAt: new Date() });
  }
}

/** Bir tur: en fazla TUR_BASINA is, ESZAMANLI hatta bolunerek. */
export async function taramaTuru(): Promise<number> {
  let islenen = 0;
  const hatlar = Array.from({ length: ESZAMANLI }, async () => {
    while (islenen < TUR_BASINA) {
      const is = await isAl();
      if (!is) return;
      islenen += 1;
      await isiIsle(is);
    }
  });
  await Promise.all(hatlar);
  return islenen;
}

let baslatildi = false;
let calisiyor = false;

/**
 * Isciyi baslatir. Kuyrukta is yoksa hicbir sey yapmaz; yani sahip panelden
 * baslatana kadar sisteme ek yuk binmez.
 */
export function startContactDiscoveryJob(): void {
  if (baslatildi) return;
  baslatildi = true;
  const tik = async () => {
    if (calisiyor) return;
    calisiyor = true;
    try {
      await taramaTuru();
    } catch (err) {
      logger.error({ err }, 'iletisim tarama turu basarisiz');
    } finally {
      calisiyor = false;
    }
  };
  void tik();
  setInterval(() => {
    void tik();
  }, TUR_ARALIGI_MS).unref();
}
