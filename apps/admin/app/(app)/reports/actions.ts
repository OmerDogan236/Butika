'use server';

import { ApiClientError, api } from '@/lib/api';
import { revalidatePath } from 'next/cache';

export async function deleteReportedCommentAction(commentId: string) {
  try {
    await api.delete(`/admin/comments/${commentId}`);
  } catch (err) {
    if (err instanceof ApiClientError) return;
    throw err;
  }
  revalidatePath('/reports');
}
