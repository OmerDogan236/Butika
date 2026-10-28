'use server';

import { ApiClientError, api } from '@/lib/api';
import { revalidatePath } from 'next/cache';

// Tur zaten sürüyorsa (409) sessizce geçilir; sayfa sürüyor durumunu zaten gösterir.
export async function turuCalistirAction(): Promise<void> {
  try {
    await api.post('/admin/butik-kontrol/calistir');
  } catch (err) {
    if (!(err instanceof ApiClientError && err.status === 409)) throw err;
  }
  revalidatePath('/butik-kontrol', 'layout');
}

export async function bulguYoksayAction(id: string): Promise<void> {
  await api.post(`/admin/butik-kontrol/bulgular/${id}/yoksay`);
  revalidatePath('/butik-kontrol', 'layout');
}
