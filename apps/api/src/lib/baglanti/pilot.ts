import { env } from '../../env';

/** Deneme görünürlüğü: yalnız BAGLANTI_PILOT_KULLANICILARI listesindeki hesaplar. */
export function pilotKullanicisiMi(userId: string): boolean {
  return env.BAGLANTI_PILOT_KULLANICILARI.includes(userId);
}
