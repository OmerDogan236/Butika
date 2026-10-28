import { haftaAnahtari } from './rapor';

const GUNLER: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** İstanbul saatine göre haftanın günü (1 = pazartesi … 7 = pazar) ve saat. */
function istanbul(simdi: Date): { gun: number; saat: number } {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(simdi);
  const gun = GUNLER[p.find((x) => x.type === 'weekday')?.value ?? ''] ?? 0;
  const saat = Number(p.find((x) => x.type === 'hour')?.value);
  return { gun, saat };
}

/** Haftalık tur penceresi: İstanbul'da pazar 23:00 – pazartesi 23:59, o hafta tur yoksa. */
export function haftalikTurZamaniMi(simdi: Date, buHaftaTamamlandi: boolean): boolean {
  if (buHaftaTamamlandi) return false;
  const { gun, saat } = istanbul(simdi);
  return (gun === 7 && saat >= 23) || gun === 1;
}

/**
 * Haftalık e-posta: İstanbul'da pazartesi 09:00 sonrası (kaçırılırsa hafta içi).
 * Pazar ve pazartesi 09:00 öncesi hayır: tur pazar gecesi biter, e-posta sabah gider.
 */
export function epostaZamaniMi(simdi: Date): boolean {
  const { gun, saat } = istanbul(simdi);
  if (gun === 7) return false;
  if (gun === 1) return saat >= 9;
  return true;
}

/**
 * Turun ait olduğu hafta. Pazar 23:00'te başlayan tur ertesi pazartesinin
 * haftasına yazılır; böylece pazar gecesi ile pazartesi aynı anahtarı paylaşır.
 */
export function turHaftasi(simdi: Date): string {
  return haftaAnahtari(new Date(simdi.getTime() + 60 * 60 * 1000));
}
