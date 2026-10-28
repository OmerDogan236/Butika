'use server';

import { ApiClientError, api } from '@/lib/api';
import { vitrinAyarlariGuncelleSchema } from '@butika/types';
import { revalidatePath } from 'next/cache';

export type VitrinAyarlariSonuc = { error?: string; ok?: boolean };

export async function vitrinAyarlariniKaydet(
  countryCode: string,
  _prev: VitrinAyarlariSonuc | undefined,
  formData: FormData,
): Promise<VitrinAyarlariSonuc> {
  // Boş alan → null ("kaldır"): başlık boşsa uygulama kendi varsayılanını gösterir.
  const parsed = vitrinAyarlariGuncelleSchema.safeParse({
    seckiBasligi: formData.get('seckiBasligi')?.toString() ?? null,
    guncelSurumIos: formData.get('guncelSurumIos')?.toString() ?? null,
    guncelSurumAndroid: formData.get('guncelSurumAndroid')?.toString() ?? null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Geçersiz form' };
  try {
    await api.patch(`/admin/vitrin-ayarlari/${countryCode}`, parsed.data);
  } catch (err) {
    if (err instanceof ApiClientError) return { error: err.message };
    return { error: 'sunucu hatası' };
  }
  revalidatePath('/vitrin-ayarlari');
  return { ok: true };
}
