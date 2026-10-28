'use server';

import { api } from '@/lib/api';
import { revalidatePath } from 'next/cache';

export async function deleteApplicationAction(id: string): Promise<void> {
  await api.delete(`/admin/boutique-applications/${id}`);
  revalidatePath('/boutique-applications');
}
