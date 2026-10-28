import type { trackedProducts } from '@butika/db';
import type { RestockAlert, SavedTracking } from '@butika/types';

export function savedTrackingStatus(product: typeof trackedProducts.$inferSelect | null, startedAt: Date, now=Date.now()): SavedTracking {
  let status:SavedTracking['status']='pending';
  if(product){
    if(product.trackingStatus!=='active')status='paused';
    else if(product.consecutiveFailures>0 || (product.lastSuccessAt && now-product.lastSuccessAt.getTime()>86400000))status='retrying';
    else if(!product.lastSuccessAt)status='pending';
    else if(product.availability==='out_of_stock')status='out_of_stock';
    else if(product.availability!=='in_stock')status='unverified';
    else if(product.notificationBaselineAt && product.notificationBaselineAt>=startedAt)status='active';
  }
  return {status,priceMinor:product?.currentPriceMinor??null,currency:product?.currency??null,checkedAt:product?.lastSuccessAt?.toISOString()??null};
}

/** A link outside the boutique's own site: kept as a save, never fetched by the server. */
export const unsupportedTracking=():SavedTracking=>({status:'unsupported',priceMinor:null,currency:null,checkedAt:null});

/** "Stok gelince haber ver": pending until the server itself has seen the size sold out. */
export const restockAlertState=(armedAt:Date|null,confirmedAt:Date|null):RestockAlert=>
  !armedAt?'off':confirmedAt?'armed':'pending';
