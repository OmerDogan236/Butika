'use server';

import { api } from '@/lib/api';
import { revalidatePath } from 'next/cache';

export type DavetGirdisi =
  | { platform: 'ikas'; boutiqueId: string; magazaAdi?: string }
  | {
      platform: 'shopify';
      boutiqueId: string;
      magazaAdi: string;
      clientId: string;
      clientSecret: string;
    };

/** Shopify'da client secret yalnız API'ye gider; yanıtta ve sayfada geri gösterilmez. */
export async function davetOlusturAction(girdi: DavetGirdisi): Promise<{ link: string }> {
  const govde =
    girdi.platform === 'shopify'
      ? girdi
      : {
          platform: 'ikas' as const,
          boutiqueId: girdi.boutiqueId,
          ...(girdi.magazaAdi ? { magazaAdi: girdi.magazaAdi } : {}),
        };
  const res = await api.post<{ token: string; link: string }>('/admin/baglantilar/davet', govde);
  return { link: res.link };
}

export async function baglantiKapatAction(id: string): Promise<void> {
  await api.post(`/admin/baglantilar/${id}/kapat`);
  revalidatePath('/baglantilar');
}

export async function iadePolitikasiKaydetAction(
  id: string,
  iadePolitikasi: string | null,
): Promise<void> {
  await api.patch(`/admin/baglantilar/${id}`, { iadePolitikasi });
  revalidatePath('/baglantilar');
}
