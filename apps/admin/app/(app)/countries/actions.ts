'use server';

import { ApiClientError, api } from '@/lib/api';
import { revalidatePath } from 'next/cache';

export type CountryActionResult = { error?: string };

export async function createCountryAction(input: {
  code: string;
  name: string;
  defaultLanguage: string;
}): Promise<CountryActionResult> {
  try {
    await api.post('/admin/countries', input);
  } catch (err) {
    if (err instanceof ApiClientError) return { error: err.message };
    return { error: 'sunucu hatası' };
  }
  revalidatePath('/countries');
  return {};
}

export async function toggleCountryAction(
  code: string,
  isActive: boolean,
): Promise<CountryActionResult> {
  try {
    await api.patch(`/admin/countries/${code}`, { isActive });
  } catch (err) {
    if (err instanceof ApiClientError) return { error: err.message };
    return { error: 'güncellenemedi' };
  }
  revalidatePath('/countries');
  return {};
}

export async function deleteCountryAction(code: string): Promise<CountryActionResult> {
  try {
    await api.delete(`/admin/countries/${code}`);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 409) {
      return { error: 'Bu pazarda butik/kategori var. Önce onları sil.' };
    }
    if (err instanceof ApiClientError) return { error: err.message };
    return { error: 'silinemedi' };
  }
  revalidatePath('/countries');
  return {};
}
