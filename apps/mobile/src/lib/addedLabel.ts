import { differenceInCalendarDays, differenceInCalendarMonths } from 'date-fns';

// Butiğin ne zaman eklendiğini editöryel, kısa Türkçe kovalarla gösterir.
// formatDistanceToNow yerine kova kullanıyoruz ("Dün", "Geçen hafta" istendi).
export function addedLabel(createdAt: string, now: Date = new Date()): string {
  const d = new Date(createdAt);
  const days = differenceInCalendarDays(now, d);
  if (days <= 0) return 'Bugün'; // saat kaymasına/gelecek tarihe karşı
  if (days === 1) return 'Dün';
  if (days <= 6) return 'Bu hafta';
  if (days <= 13) return 'Geçen hafta';
  const months = differenceInCalendarMonths(now, d);
  if (months <= 0) return 'Bu ay';
  if (months === 1) return 'Geçen ay';
  return `${months} ay önce`;
}
