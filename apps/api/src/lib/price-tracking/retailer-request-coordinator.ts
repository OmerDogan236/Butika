import { retailerRequestGates } from '@butika/db';
import { eq,sql } from 'drizzle-orm';
import { db } from '../db';
import { SHOPIFY_GATE, SHOPIFY_SPACING_MS, type RetailerRequestCoordinator } from './retailer-http';

/** Durable pacing across API replicas. Diagnostics never import this DB module. */
export const databaseRetailerCoordinator:RetailerRequestCoordinator={
  async blockedUntil(origin){
    const [row]=await db.select({until:retailerRequestGates.blockedUntil}).from(retailerRequestGates).where(eq(retailerRequestGates.origin,origin));
    return row?.until?.getTime()??0;
  },
  async reserve(origin){
    const now=new Date(),spacing=origin===SHOPIFY_GATE?SHOPIFY_SPACING_MS:1000;
    const [row]=await db.insert(retailerRequestGates).values({origin,nextRequestAt:new Date(now.getTime()+spacing),updatedAt:now})
      .onConflictDoUpdate({target:retailerRequestGates.origin,set:{nextRequestAt:sql`greatest(${retailerRequestGates.nextRequestAt}, ${now.toISOString()}::timestamptz) + ${spacing} * interval '1 millisecond'`,updatedAt:now}}).returning();
    if(!row)throw new Error('Retailer request reservation failed');
    return {startAt:row.nextRequestAt.getTime()-spacing,blockedUntil:row.blockedUntil?.getTime()??0};
  },
  async block(origin,until){
    await db.update(retailerRequestGates).set({blockedUntil:sql`greatest(${retailerRequestGates.blockedUntil}, ${new Date(until).toISOString()}::timestamptz)`,updatedAt:new Date()}).where(eq(retailerRequestGates.origin,origin));
  },
};
