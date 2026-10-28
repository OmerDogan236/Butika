'use server';

import { api } from '@/lib/api';
import { revalidatePath } from 'next/cache';

export async function deleteSuggestionAction(id: string): Promise<void> {
  await api.delete(`/admin/suggestions/${id}`);
  revalidatePath('/suggestions');
}

// Kullanıcının "Paylaş… → Butika" ile eklediği butik: onayla (vitrine çıkar) ya da reddet.
export async function kullaniciButiginiOnaylaAction(id: string): Promise<void> {
  await api.post(`/admin/kullanici-butikleri/${id}/onayla`);
  revalidatePath('/suggestions');
}

export async function kullaniciButiginiReddetAction(id: string): Promise<void> {
  await api.post(`/admin/kullanici-butikleri/${id}/reddet`);
  revalidatePath('/suggestions');
}
