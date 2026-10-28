import { boutiqueCategories } from '@butika/db';
import { asc, inArray } from 'drizzle-orm';
import { db } from './db';

// Verilen butik id'leri için kategori id listelerini toplar (junction sortOrder'a göre artan).
export async function categoryIdsByBoutique(ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({
      boutiqueId: boutiqueCategories.boutiqueId,
      categoryId: boutiqueCategories.categoryId,
    })
    .from(boutiqueCategories)
    .where(inArray(boutiqueCategories.boutiqueId, ids))
    .orderBy(asc(boutiqueCategories.boutiqueId), asc(boutiqueCategories.sortOrder));
  for (const r of rows) {
    const list = map.get(r.boutiqueId) ?? [];
    list.push(r.categoryId);
    map.set(r.boutiqueId, list);
  }
  return map;
}
