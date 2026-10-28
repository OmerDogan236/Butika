import type { AdminCountry } from '@butika/types';
import { cookies } from 'next/headers';
import { ApiClientError, api } from './api';

// Admin'in seçili pazarı bu cookie'de tutulur; server component'ler okuyup
// kategori/butik sorgularını `?country=` ile kısıtlar.
export const COUNTRY_COOKIE = 'butika_admin_country';

export async function getMarkets(): Promise<AdminCountry[]> {
  try {
    return await api.get<AdminCountry[]>('/admin/countries');
  } catch (err) {
    // Session geçersizse (401) boş dön — layout switcher'ı gizler.
    if (err instanceof ApiClientError) return [];
    throw err;
  }
}

// Cookie geçerli + aktif pazarsa onu, değilse ilk aktif pazarı döndür.
// Hiç aktif pazar yoksa null (UI "önce ülke ekle" der).
export async function getSelectedCountry(markets?: AdminCountry[]): Promise<string | null> {
  const all = markets ?? (await getMarkets());
  const active = all.filter((m) => m.isActive);
  if (active.length === 0) return null;
  const cookie = (await cookies()).get(COUNTRY_COOKIE)?.value;
  if (cookie && active.some((m) => m.code === cookie)) return cookie;
  return active[0]?.code ?? null;
}
