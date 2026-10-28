'use server';

import { ApiClientError, api } from '@/lib/api';
import { revalidatePath } from 'next/cache';

export async function deleteCommentAction(id: string) {
  try {
    await api.delete(`/admin/comments/${id}`);
  } catch (err) {
    if (err instanceof ApiClientError) {
      // Sessizce yut — UI tarafında zaten optimistic refetch yapacağız
      return;
    }
    throw err;
  }
  revalidatePath('/comments');
}
