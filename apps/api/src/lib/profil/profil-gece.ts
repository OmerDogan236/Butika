import { users } from '@butika/db';
import { asc, isNull } from 'drizzle-orm';
import { db } from '../db';
import { logger } from '../logger';
import { profiliYenidenHesapla } from './profil-kaydet';

// Gece toplu profil hesabı: tüm (silinmemiş) kullanıcılar. Butik açma olayları ve zamanla
// azalma yalnız burada güncel tutulur; anlık tetik yalnız kayıt/test anında çalışır.
// Tasarım: docs/superpowers/specs/2026-10-05-kullanici-profili-tasarim.md (§2.5)

/** İstanbul saatiyle bu saatten sonra, günde bir kez. */
const GECE_SAATI = 3;
const KONTROL_ARALIGI_MS = 60 * 60 * 1000;

function istanbulParcalari(simdi: Date): { gun: string; saat: number } {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(simdi);
  const al = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { gun: `${al('year')}-${al('month')}-${al('day')}`, saat: Number(al('hour')) };
}

/** İstanbul takvim günü, "YYYY-AA-GG". */
export function istanbulGunu(simdi: Date): string {
  return istanbulParcalari(simdi).gun;
}

/** İstanbul'da 03:00 geçtiyse ve bugün henüz çalışmadıysa true. */
export function geceZamaniMi(simdi: Date, sonCalisilanGun: string | null): boolean {
  const { gun, saat } = istanbulParcalari(simdi);
  return saat >= GECE_SAATI && sonCalisilanGun !== gun;
}

/** Tüm silinmemiş kullanıcıların profilini sırayla yeniden hesaplar. Bir hata diğerlerini durdurmaz. */
export async function tumProfilleriHesapla(
  simdi: Date = new Date(),
): Promise<{ toplam: number; basarili: number; hatali: number }> {
  const kullanicilar = await db
    .select({ id: users.id })
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(asc(users.createdAt));
  const sonuc = { toplam: kullanicilar.length, basarili: 0, hatali: 0 };
  for (const { id } of kullanicilar) {
    try {
      await profiliYenidenHesapla(id, simdi);
      sonuc.basarili++;
    } catch (err) {
      sonuc.hatali++;
      logger.warn({ err, userId: id }, 'profil: gece hesabı bir kullanıcıda başarısız');
    }
  }
  return sonuc;
}

let sonCalisilanGun: string | null = null;
let calisiyor = false;

async function kontrol(): Promise<void> {
  const simdi = new Date();
  if (calisiyor || !geceZamaniMi(simdi, sonCalisilanGun)) return;
  calisiyor = true;
  try {
    const sonuc = await tumProfilleriHesapla(simdi);
    sonCalisilanGun = istanbulGunu(simdi);
    logger.info(sonuc, 'profil: gece hesabı bitti');
  } catch (err) {
    logger.error({ err }, 'profil: gece hesabı başarısız');
  } finally {
    calisiyor = false;
  }
}

/**
 * Saatte bir bakar; İstanbul 03:00'ten sonra günde bir kez herkesi hesaplar. Son çalışma
 * bellekte tutulur: 03:00 sonrası yeniden başlatmada o gün bir kez daha çalışır (zararsız).
 */
export function startProfilGeceJob(): void {
  void kontrol();
  setInterval(() => {
    void kontrol();
  }, KONTROL_ARALIGI_MS);
}
