import { savedProducts } from '@butika/db';
import { and,asc,eq,gt,isNull } from 'drizzle-orm';
import { db } from '../db';
import { ensureTrackedProduct } from './tracked-product';

/** Existing pre-notification saves must join tracking without remove/re-save. */
export async function backfillSavedTrackingBatch(afterId?:string|null) {
  const rows=await db.select().from(savedProducts).where(and(isNull(savedProducts.trackedProductId),afterId?gt(savedProducts.id,afterId):undefined)).orderBy(asc(savedProducts.id)).limit(100);
  let linked=0;
  for(const row of rows){
    const trackedProductId=await ensureTrackedProduct({boutiqueId:row.boutiqueId,url:row.url,title:row.title});
    if(!trackedProductId)continue;
    const updated=await db.update(savedProducts).set({trackedProductId,trackingStartedAt:new Date()}).where(and(eq(savedProducts.id,row.id),isNull(savedProducts.trackedProductId))).returning({id:savedProducts.id});
    linked+=updated.length;
  }
  // The cursor advances past malformed legacy URLs too, so they cannot starve valid saves.
  return {scanned:rows.length,linked,afterId:rows.at(-1)?.id ?? null};
}
