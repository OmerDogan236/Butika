import { env } from '../env';
import { sonTarzTesti } from '../routes/me-tarz';
// Butikcan sohbeti ile vitrin aramasının paylaştığı parçalar: kullanıcı başına hız sınırı,
// tarz/profil bilgisi (yalnız yapay zekâ aktarım onayı varsa) ve sıra birleştirme.
import { findActiveUserById } from './auth';
import type { TarzProfili } from './butikcan-catalog';
import { hasGrantedConsent } from './consent';
import type { UserProfile } from './gemini';
import { logger } from './logger';
import { butikcanProfili, profiliOku } from './profil/profil-kullan';

const RATE_LIMIT = 20; // mesaj / dakika / kullanıcı (sohbet + vitrin Butikcan araması birlikte)
const RATE_WINDOW_MS = 60 * 1000;

const rateMap = new Map<string, number[]>();
export function checkRate(userId: string): boolean {
  const now = Date.now();
  const recent = (rateMap.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    rateMap.set(userId, recent);
    return false;
  }
  recent.push(now);
  rateMap.set(userId, recent);
  return true;
}

export interface ButikcanKullaniciBilgisi {
  aiConsent: boolean;
  tarzProfili: TarzProfili | undefined;
  /**
   * tarzProfili kullanıcı profili tablosundan geldiyse: profil öncesi (bugünkü) seçim için
   * tarz testi bilgisi. getCatalog bununla profilin öneri sayısını azaltmamasını sağlar.
   */
  kullaniciProfili: { taban: TarzProfili | undefined } | undefined;
  userProfile: UserProfile | undefined;
}

/**
 * Rıza yoksa hiçbir şey; varsa önce kullanıcı profili (PROFIL_VITRIN_ENABLED), yoksa tarz testi.
 * Mesajdaki açık tarz/bütçenin profilin önünde olması profiliUygula'nın işi.
 */
export function tarzProfiliniSec(
  aiConsent: boolean,
  test: TarzProfili | null,
  profil: TarzProfili | null,
): TarzProfili | undefined {
  if (!aiConsent) return undefined;
  return profil ?? test ?? undefined;
}

/** Profil okunamazsa null: Butikcan bugünkü gibi tarz testiyle sürer. */
async function profilTarzi(userId: string, aiConsent: boolean): Promise<TarzProfili | null> {
  if (!aiConsent || !env.PROFIL_VITRIN_ENABLED) return null;
  try {
    return butikcanProfili(await profiliOku(userId));
  } catch (err) {
    logger.warn({ err, userId }, 'butikcan: profil okunamadı; tarz testi kullanılıyor');
    return null;
  }
}

/** Beden ve tarz bilgisi yalnız 'yapay_zeka_aktarim' onayı verilmişse döner (Apple 5.1.2(i)). */
export async function butikcanTarzProfili(userId: string): Promise<ButikcanKullaniciBilgisi> {
  const [me, aiConsent, tarzTesti] = await Promise.all([
    findActiveUserById(userId),
    hasGrantedConsent(userId, 'yapay_zeka_aktarim'),
    sonTarzTesti(userId),
  ]);
  const testten: TarzProfili | null = tarzTesti
    ? {
        tarz1: tarzTesti.tarz1,
        tarz2: tarzTesti.tarz2,
        fiyatSegmentleri: (tarzTesti.fiyatSegmentleri ?? []) as string[],
      }
    : null;
  const profilden = await profilTarzi(userId, aiConsent);
  const tarzProfili = tarzProfiliniSec(aiConsent, testten, profilden);
  const kullaniciProfili =
    profilden && tarzProfili === profilden
      ? { taban: tarzProfiliniSec(aiConsent, testten, null) }
      : undefined;
  const userProfile =
    me && aiConsent
      ? {
          gender: me.gender,
          heightCm: me.heightCm,
          weightKg: me.weightKg,
          tarzlar: [tarzProfili?.tarz1, tarzProfili?.tarz2].filter((t): t is string => Boolean(t)),
        }
      : undefined;
  return { aiConsent, tarzProfili, kullaniciProfili, userProfile };
}

export const ARAMA_AZAMI = 30;

/** Yapay zekâ seçimleri önce (yalnız aday listesinde olanlar), ardından ön elemenin sırası; tekrarsız. */
export function siraBirlestir(
  secimIdleri: string[],
  adayIdler: Set<string>,
  siraliIdler: string[],
  azami = ARAMA_AZAMI,
): string[] {
  const out: string[] = [];
  const goruldu = new Set<string>();
  for (const id of [...secimIdleri.filter((i) => adayIdler.has(i)), ...siraliIdler]) {
    if (goruldu.has(id)) continue;
    goruldu.add(id);
    out.push(id);
    if (out.length >= azami) break;
  }
  return out;
}
