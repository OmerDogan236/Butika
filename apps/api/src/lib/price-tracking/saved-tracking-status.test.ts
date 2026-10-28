import {test,expect} from 'bun:test';
import type {trackedProducts} from '@butika/db';
import {savedTrackingStatus} from './saved-tracking-status';
const now=Date.now(),started=new Date(now-60000);
const product={trackingStatus:'active',currentPriceMinor:10000,currency:'TRY',availability:'in_stock',consecutiveFailures:0,lastSuccessAt:new Date(now),notificationBaselineAt:new Date(now)} as typeof trackedProducts.$inferSelect;
test('saved tracking status requires fresh stock and a baseline after this watcher joined',()=>{
 expect(savedTrackingStatus(null,started,now).status).toBe('pending');
 expect(savedTrackingStatus(product,started,now).status).toBe('active');
 expect(savedTrackingStatus({...product,notificationBaselineAt:new Date(now-120000)},started,now).status).toBe('pending');
 expect(savedTrackingStatus({...product,availability:'out_of_stock'},started,now).status).toBe('out_of_stock');
 expect(savedTrackingStatus({...product,availability:'unknown'},started,now).status).toBe('unverified');
 expect(savedTrackingStatus({...product,consecutiveFailures:1},started,now).status).toBe('retrying');
 expect(savedTrackingStatus({...product,lastSuccessAt:new Date(now-86400001)},started,now).status).toBe('retrying');
 expect(savedTrackingStatus({...product,trackingStatus:'paused'},started,now).status).toBe('paused');
});
