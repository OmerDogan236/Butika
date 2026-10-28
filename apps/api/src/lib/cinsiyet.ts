import { boutiques } from '@butika/db';
import { type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';

// Vitrin tarafı (1.2.4): kategoriler admin'de Kadın / Erkek diye işaretlenir; uygulama Keşfet'in
// üstündeki KADIN | ERKEK geçişiyle birini seçer. Parametresiz istek (1.2.3 ve öncesi) kadındır,
// yani bugünkü vitrin hiç değişmez.
export const CINSIYETLER = ['kadin', 'erkek'] as const;
export type Cinsiyet = (typeof CINSIYETLER)[number];

export const cinsiyetSorgusu = z.enum(CINSIYETLER).default('kadin');

export function cinsiyetMi(x: unknown): x is Cinsiyet {
  return typeof x === 'string' && (CINSIYETLER as readonly string[]).includes(x);
}

/**
 * Butik bu tarafın vitrininde görünür mü (SQL koşulu, `boutiques` tablosu sorguda olmalı).
 * Erkek: en az bir etkin erkek kategorisinde. Kadın: yalnız erkek kategorilerinde OLMAYAN her
 * butik — kategorisi olmayan ya da kadın kategorisi olan butikler bugünkü gibi görünür.
 */
export function butikCinsiyetKosulu(cinsiyet: Cinsiyet): SQL {
  const erkekKategorisiVar = sql`exists (
    select 1 from boutique_categories bc join categories c on c.id = bc.category_id
    where bc.boutique_id = ${boutiques.id} and c.is_active and c.cinsiyet = 'erkek')`;
  if (cinsiyet === 'erkek') return erkekKategorisiVar;
  const kadinKategorisiVar = sql`exists (
    select 1 from boutique_categories bc join categories c on c.id = bc.category_id
    where bc.boutique_id = ${boutiques.id} and c.is_active and c.cinsiyet = 'kadin')`;
  return sql`(not ${erkekKategorisiVar} or ${kadinKategorisiVar})`;
}
