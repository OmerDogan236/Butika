'use server';

import { ApiClientError, api } from '@/lib/api';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const upsertSchema = z.object({
  countryCode: z.string().length(2),
  name: z.string().min(1).max(64),
  // Slug serbest; API slugify ediyor (Türkçe/boşluk otomatik temizlenir), reddetme.
  slug: z.string().max(64).optional().or(z.literal('')),
  isActive: z.coerce.boolean().default(true),
  cinsiyet: z.enum(['kadin', 'erkek']).default('kadin'),
});

export type ActionResult = { error?: string };

function parseUpsert(formData: FormData) {
  const slug = formData.get('slug')?.toString().trim() || undefined;
  return upsertSchema.safeParse({
    countryCode: formData.get('countryCode'),
    name: formData.get('name'),
    slug,
    isActive: formData.get('isActive') === 'on' || formData.get('isActive') === 'true',
    cinsiyet: formData.get('cinsiyet') ?? undefined,
  });
}

export async function createCategoryAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseUpsert(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Geçersiz form' };
  try {
    await api.post('/admin/categories', parsed.data);
  } catch (err) {
    if (err instanceof ApiClientError) return { error: err.message };
    return { error: 'sunucu hatası' };
  }
  revalidatePath('/categories');
  redirect('/categories');
}

export async function updateCategoryAction(
  id: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseUpsert(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Geçersiz form' };
  try {
    await api.patch(`/admin/categories/${id}`, parsed.data);
  } catch (err) {
    if (err instanceof ApiClientError) return { error: err.message };
    return { error: 'sunucu hatası' };
  }
  revalidatePath('/categories');
  redirect('/categories');
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  try {
    await api.delete(`/admin/categories/${id}`);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 409) {
      // Butik bağımlılığı: kategori silinmez, kullanıcıya nedenini söyle.
      return { error: 'Bu kategoride butik var. Önce butikleri başka kategoriye taşı ya da sil.' };
    }
    if (err instanceof ApiClientError) return { error: err.message };
    return { error: 'Kategori silinemedi.' };
  }
  revalidatePath('/categories');
  return {};
}
