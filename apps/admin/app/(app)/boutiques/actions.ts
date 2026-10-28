'use server';

import { ApiClientError, api } from '@/lib/api';
import {
  BUTIK_ETIKETLERI,
  EDITOR_NOTU_MAKS,
  FIRSAT_NOTU_MAKS,
  TARZLAR,
  YAS_ARALIKLARI,
} from '@butika/types';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const upsertSchema = z.object({
  countryCode: z.string().length(2),
  categoryIds: z.array(z.string().uuid()).min(1, 'En az bir kategori seç'),
  name: z.string().min(1).max(120),
  description: z.string().max(400).optional().default(''),
  url: z.string().url(),
  coverImageUrl: z.string().url(),
  logoUrl: z.string().url().nullable().optional(),
  isActive: z.coerce.boolean().default(true),
  suggestionId: z.string().uuid().optional(),
  fiyatSegmenti: z.enum(['uygun', 'orta', 'yuksek', 'luks']).nullable().optional(),
  tarz1: z.enum(TARZLAR).nullable().optional(),
  tarz2: z.enum(TARZLAR).nullable().optional(),
  // Grup etiketleri (güzellik/parfüm) — tarzdan ayrı alan.
  etiketler: z.array(z.enum(BUTIK_ETIKETLERI)).max(3).optional(),
  hedefYaslar: z.array(z.enum(YAS_ARALIKLARI)).max(5).nullable().optional(),
  // Editörün Seçimi
  editorSecimi: z.boolean().optional(),
  editorSirasi: z.coerce
    .number({ invalid_type_error: 'Sıra bir sayı olmalı' })
    .int('Sıra tam sayı olmalı')
    .min(0, 'Sıra 0 ya da büyük olmalı')
    .max(9999)
    .nullable()
    .optional(),
  editorNotu: z
    .string()
    .max(EDITOR_NOTU_MAKS, `Editör notu en çok ${EDITOR_NOTU_MAKS} karakter`)
    .nullable()
    .optional(),
  // Fırsat sekmesi
  firsat: z.boolean().optional(),
  firsatSirasi: z.coerce
    .number({ invalid_type_error: 'Fırsat sırası bir sayı olmalı' })
    .int('Fırsat sırası tam sayı olmalı')
    .min(0, 'Fırsat sırası 0 ya da büyük olmalı')
    .max(9999)
    .nullable()
    .optional(),
  firsatNotu: z
    .string()
    .max(FIRSAT_NOTU_MAKS, `İndirim notu en çok ${FIRSAT_NOTU_MAKS} karakter`)
    .nullable()
    .optional(),
});

export type ActionResult = { error?: string };

function parse(formData: FormData) {
  const logoRaw = formData.get('logoUrl')?.toString().trim();
  const suggestionIdRaw = formData.get('suggestionId')?.toString().trim();
  const segmentRaw = formData.get('fiyatSegmenti')?.toString().trim();
  const tarz1Raw = formData.get('tarz1')?.toString().trim();
  const tarz2Raw = formData.get('tarz2')?.toString().trim();
  const etiketRaw = formData.get('etiketler')?.toString();
  // Alan formda yoksa (yeni butik) undefined; varsa seçili değerler, boşsa null.
  const yasVar = formData.get('hedefYasVar') !== null;
  const yaslar = formData.getAll('hedefYas').map(String);
  // Editör alanları iki ekranda da var; işaret yoksa (eski form) hiç gönderilmez.
  const editorVar = formData.get('editorAlanVar') !== null;
  const editorSirasiRaw = formData.get('editorSirasi')?.toString().trim();
  const editorNotuRaw = formData.get('editorNotu')?.toString().trim();
  // Fırsat alanları da aynı kurgu.
  const firsatVar = formData.get('firsatAlanVar') !== null;
  const firsatSirasiRaw = formData.get('firsatSirasi')?.toString().trim();
  const firsatNotuRaw = formData.get('firsatNotu')?.toString().trim();
  return upsertSchema.safeParse({
    countryCode: formData.get('countryCode'),
    categoryIds: formData.getAll('categoryId'),
    name: formData.get('name'),
    description: formData.get('description')?.toString() ?? '',
    url: formData.get('url'),
    coverImageUrl: formData.get('coverImageUrl'),
    logoUrl: logoRaw || undefined,
    isActive: formData.get('isActive') === 'on' || formData.get('isActive') === 'true',
    suggestionId: suggestionIdRaw || undefined,
    // Alan yoksa (yeni butik ekranı) undefined → API'ye hiç gönderilmez.
    // Boş dize varsa null → "belirsiz bırak".
    fiyatSegmenti: segmentRaw === undefined ? undefined : segmentRaw === '' ? null : segmentRaw,
    tarz1: tarz1Raw === undefined ? undefined : tarz1Raw === '' ? null : tarz1Raw,
    tarz2: tarz2Raw === undefined ? undefined : tarz2Raw === '' ? null : tarz2Raw,
    // Alan yoksa undefined (hiç gönderme); boş dize ise [] → "etiketleri kaldır".
    hedefYaslar: yasVar ? (yaslar.length > 0 ? yaslar : null) : undefined,
    etiketler:
      etiketRaw === undefined
        ? undefined
        : etiketRaw
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean),
    editorSecimi: editorVar ? formData.get('editorSecimi') === 'on' : undefined,
    // Boş sıra/not → null ("kaldır").
    editorSirasi: editorVar ? editorSirasiRaw || null : undefined,
    editorNotu: editorVar ? editorNotuRaw || null : undefined,
    firsat: firsatVar ? formData.get('firsat') === 'on' : undefined,
    firsatSirasi: firsatVar ? firsatSirasiRaw || null : undefined,
    firsatNotu: firsatVar ? firsatNotuRaw || null : undefined,
  });
}

export async function createBoutiqueAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Geçersiz form' };
  try {
    await api.post('/admin/boutiques', parsed.data);
  } catch (err) {
    if (err instanceof ApiClientError) return { error: err.message };
    return { error: 'sunucu hatası' };
  }
  revalidatePath('/boutiques');
  if (parsed.data.suggestionId) revalidatePath('/suggestions');
  redirect('/boutiques');
}

export async function updateBoutiqueAction(
  id: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Geçersiz form' };
  try {
    await api.patch(`/admin/boutiques/${id}`, parsed.data);
  } catch (err) {
    if (err instanceof ApiClientError) return { error: err.message };
    return { error: 'sunucu hatası' };
  }
  revalidatePath('/boutiques');
  revalidatePath('/todos');
  redirect('/boutiques');
}

export async function deleteBoutiqueAction(id: string): Promise<void> {
  await api.delete(`/admin/boutiques/${id}`);
  revalidatePath('/boutiques');
}

export async function moveBoutiqueAction(input: {
  boutiqueId: string;
  fromCategoryId: string;
  toCategoryId: string;
  mode: 'tasi' | 'ekle';
}): Promise<ActionResult> {
  try {
    await api.post(`/admin/boutiques/${input.boutiqueId}/move`, {
      fromCategoryId: input.fromCategoryId,
      toCategoryId: input.toCategoryId,
      mode: input.mode,
    });
  } catch (err) {
    if (err instanceof ApiClientError) return { error: err.message };
    return { error: 'sunucu hatası' };
  }
  revalidatePath('/boutiques');
  return {};
}
