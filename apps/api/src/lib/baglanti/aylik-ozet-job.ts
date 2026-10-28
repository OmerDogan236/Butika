import { logger } from '../logger';
import { aylikOzetleriGonder } from './aylik-ozet';

// Saatte bir bakar; ayın 1'i 10:00 (İstanbul) sonrası önceki ayın özetini gönderir.
const ARALIK_MS = 60 * 60 * 1000;
let calisiyor = false;

async function adim(): Promise<void> {
  if (calisiyor) return;
  calisiyor = true;
  try {
    const n = await aylikOzetleriGonder(new Date());
    if (n > 0) logger.info({ gonderilen: n }, 'baglanti-ozet: aylık özetler gönderildi');
  } catch (error) {
    logger.error({ error: String(error).slice(0, 300) }, 'baglanti-ozet: adım başarısız');
  } finally {
    calisiyor = false;
  }
}

export function startAylikOzetJob(): void {
  void adim();
  setInterval(() => {
    void adim();
  }, ARALIK_MS);
}
