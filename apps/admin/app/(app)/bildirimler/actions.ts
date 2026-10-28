'use server';

import { ApiClientError, api } from '@/lib/api';
import { bildirimOlusturSchema } from '@butika/types';
import { revalidatePath } from 'next/cache';

export type BildirimSonuc = { error?: string; ok?: boolean };

// "Dokununca ne açılsın": butik/kategori seçilince id ile birleşir (butik:<id>).
function hedef(formData: FormData): string | null {
  const tur = formData.get('hedefTuru')?.toString() ?? '';
  if (!tur) return null;
  if (tur === 'butik' || tur === 'kategori') {
    const id = formData.get('hedefId')?.toString() ?? '';
    return id ? `${tur}:${id}` : tur;
  }
  return tur;
}

// Form Türkiye saatini gönderir (tarih + saat); Türkiye yıl boyu UTC+3.
function trZamani(tarih: string, saat: string): string {
  return `${tarih}T${saat}:00+03:00`;
}

export async function bildirimOlustur(
  _prev: BildirimSonuc | undefined,
  formData: FormData,
): Promise<BildirimSonuc> {
  const tarih = formData.get('tarih')?.toString() ?? '';
  const saat = formData.get('saat')?.toString() ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih) || !/^\d{2}:\d{2}$/.test(saat)) {
    return { error: 'Tarih ve saat seçin' };
  }
  const parsed = bildirimOlusturSchema.safeParse({
    baslik: formData.get('baslik')?.toString() ?? '',
    metin: formData.get('metin')?.toString() ?? '',
    kitle: formData.get('kitle')?.toString() ?? 'all',
    gonderimZamani: trZamani(tarih, saat),
    durum: formData.get('durum')?.toString() === 'planlandi' ? 'planlandi' : 'taslak',
    hedef: hedef(formData),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Geçersiz form' };
  try {
    await api.post('/admin/bildirimler', parsed.data);
  } catch (err) {
    if (err instanceof ApiClientError) return { error: err.message };
    return { error: 'sunucu hatası' };
  }
  revalidatePath('/bildirimler');
  return { ok: true };
}

export async function bildirimDurumu(
  id: string,
  durum: 'planlandi' | 'iptal' | 'taslak',
): Promise<BildirimSonuc> {
  try {
    await api.patch(`/admin/bildirimler/${id}`, { durum });
  } catch (err) {
    if (err instanceof ApiClientError) return { error: err.message };
    return { error: 'sunucu hatası' };
  }
  revalidatePath('/bildirimler');
  return { ok: true };
}
