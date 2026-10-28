import { expect, test } from 'bun:test';

const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;
test.skipIf(!testUrl)('newly saved product is scheduled, leased once, retried and notifies only with stock', async () => {
  const url = new URL(testUrl!);
  if (!['localhost','127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/butika_notification_test')) throw new Error('Dedicated local test database required');
  process.env.DATABASE_URL = testUrl;
  const { env } = await import('../../env');
  if (env.DATABASE_URL !== testUrl) throw new Error('Run this integration file separately');
  const { db } = await import('../db');
  const { users, countries, boutiques, savedProducts, trackedProducts, notifications, retailerRequestGates,collections,savedProductCollections } = await import('@butika/db');
  const { eq } = await import('drizzle-orm');
  const { Hono } = await import('hono');
  const { savedRoutes } = await import('../../routes/saved');
  const { signAccessToken } = await import('../jwt');
  const { errorResponse } = await import('../errors');
  const { claimPriceChecks, runPriceTrackingBatch } = await import('./price-tracking-job');
  const { recordPriceObservation } = await import('./record-price-observation');
  const { databaseRetailerCoordinator } = await import('./retailer-request-coordinator');
  const { SHOPIFY_GATE } = await import('./retailer-http');
  const { backfillSavedTrackingBatch } = await import('./backfill-saved-tracking');
  const app = new Hono().route('/saved', savedRoutes);
  app.onError((error,c) => errorResponse(c,error));
  const userId = crypto.randomUUID(), boutiqueId = crypto.randomUUID();
  const gateOrigin=`https://gate-${userId}.example`;
  let productId: string | null = null;
  let legacyProductId:string|null=null;
  try {
    const reservations=await Promise.all([databaseRetailerCoordinator.reserve(gateOrigin),databaseRetailerCoordinator.reserve(gateOrigin)]);
    expect(Math.abs(reservations[1]!.startAt-reservations[0]!.startAt)).toBeGreaterThanOrEqual(1000);
    const deadline=Date.now()+120000;
    await databaseRetailerCoordinator.block(gateOrigin,deadline);
    expect((await databaseRetailerCoordinator.reserve(gateOrigin)).blockedUntil).toBe(deadline);
    const platformReservations=await Promise.all([databaseRetailerCoordinator.reserve(SHOPIFY_GATE),databaseRetailerCoordinator.reserve(SHOPIFY_GATE)]);
    expect(Math.abs(platformReservations[1]!.startAt-platformReservations[0]!.startAt)).toBeGreaterThanOrEqual(3000);
    await db.insert(countries).values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' }).onConflictDoNothing();
    await db.insert(users).values({ id: userId, displayName: 'Scheduler test' });
    await db.insert(boutiques).values({ id: boutiqueId, countryCode: 'TR', name: 'New products test', url: 'https://new-store.example', coverImageUrl: '' });
    const token = await signAccessToken(userId);
    const body=JSON.stringify({ boutiqueId, url: `https://new-store.example/products/new-${crypto.randomUUID()}?variant=123`, title: 'Brand new dress · M', priceMinor: 999999, currency: 'TRY' });
    const responses=await Promise.all([1,2].map(()=>app.request('/saved', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },body })));
    expect(responses.map(r=>r.status).sort()).toEqual([200,201]);
    const [saved] = await db.select().from(savedProducts).where(eq(savedProducts.userId, userId));
    productId = saved!.trackedProductId;
    expect(productId).not.toBeNull();
    const read = async () => (await db.select().from(trackedProducts).where(eq(trackedProducts.id, productId!)))[0]!;
    expect((await read()).currentPriceMinor).toBeNull();
    const listed=await app.request('/saved',{headers:{authorization:`Bearer ${token}`}});
    expect(listed.status).toBe(200);
    expect((await listed.json() as {tracking:{status:string}}[])[0]!.tracking.status).toBe('pending');
    const claims = await Promise.all([claimPriceChecks(), claimPriceChecks()]);
    expect(claims.flat()).toHaveLength(1);
    const oldToken = claims.flat()[0]!.checkLeaseToken;
    await db.update(trackedProducts).set({ checkLeaseUntil: new Date(0) }).where(eq(trackedProducts.id, productId!));
    const reclaimed = await claimPriceChecks();
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]!.checkLeaseToken).not.toBe(oldToken);
    await expect(recordPriceObservation({ trackedProductId: productId!, checkLeaseToken: oldToken, priceMinor: 1000, currency: 'TRY', availability: 'in_stock' })).rejects.toThrow('lease expired');
    const due = async () => { await db.update(trackedProducts).set({ nextCheckAt: new Date(0), checkLeaseUntil: null, checkLeaseToken: null }).where(eq(trackedProducts.id, productId!)); };
    await due();
    const failed = await runPriceTrackingBatch({ resolve: async () => ({ status: 'failed', reason: 'blocked', error: 'HTTP 429', attempts: [] }) });
    expect(failed.blocked).toBe(1);
    expect((await read()).nextCheckAt.getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);
    expect(await claimPriceChecks()).toHaveLength(0);
    await due();
    const observe = (priceMinor: number, availability: 'in_stock' | 'unknown') => runPriceTrackingBatch({ resolve: async () => ({
      status: 'success', observation: { priceMinor, currency: 'TRY', availability, observedAt: new Date(), provider: 'shopify' }, attempts: [],
    }) });
    expect((await observe(1000, 'in_stock')).success).toBe(1);
    expect((await read()).notificationBaselinePriceMinor).toBe(1000);
    const verified=await app.request('/saved',{headers:{authorization:`Bearer ${token}`}});
    expect((await verified.json() as {tracking:unknown}[])[0]!.tracking).toMatchObject({status:'active',priceMinor:1000,currency:'TRY'});
    expect((await read()).consecutiveFailures).toBe(0);
    await due(); await observe(900, 'unknown');
    expect(await db.select().from(notifications).where(eq(notifications.userId,userId))).toHaveLength(0);
    await due(); await observe(800, 'in_stock');
    expect(await db.select().from(notifications).where(eq(notifications.userId,userId))).toHaveLength(1);
    // A newly joined watcher refreshes an already tracked product without
    // waiting a whole day, but cannot bypass a retailer failure cooldown.
    await db.update(trackedProducts).set({lastSuccessAt:new Date(Date.now()-120000),nextCheckAt:new Date(Date.now()+86400000),consecutiveFailures:1}).where(eq(trackedProducts.id,productId!));
    expect(await claimPriceChecks()).toHaveLength(0);
    await db.update(trackedProducts).set({consecutiveFailures:0}).where(eq(trackedProducts.id,productId!));
    expect((await claimPriceChecks()).map(r=>r.id)).toEqual([productId!]);
    await db.update(trackedProducts).set({lastSuccessAt:new Date(),checkLeaseToken:null,checkLeaseUntil:null}).where(eq(trackedProducts.id,productId!));
    expect(await claimPriceChecks()).toHaveLength(0);
    await db.delete(savedProducts).where(eq(savedProducts.userId,userId));
    await due(); expect(await claimPriceChecks()).toHaveLength(0);
    const [legacy]=await db.insert(savedProducts).values({userId,boutiqueId,url:`https://new-store.example/legacy-${crypto.randomUUID()}`,title:'Legacy saved item'}).returning();
    expect((await backfillSavedTrackingBatch()).linked).toBe(1);
    const [linkedLegacy]=await db.select().from(savedProducts).where(eq(savedProducts.id,legacy!.id));
    legacyProductId=linkedLegacy!.trackedProductId;
    expect(legacyProductId).not.toBeNull();
    expect(linkedLegacy!.id).toBe(legacy!.id);
    expect((await claimPriceChecks()).map(r=>r.id)).toEqual([legacyProductId!]);
    const [collection]=await db.insert(collections).values({userId,name:'Preserved collection'}).returning();
    await db.insert(savedProductCollections).values({savedProductId:legacy!.id,collectionId:collection!.id});
    await db.update(savedProducts).set({orderNumber:'TEST-ORDER'}).where(eq(savedProducts.id,legacy!.id));
    const patch=(target:string,access=token)=>app.request(`/saved/${legacy!.id}/variant`,{method:'PATCH',headers:{authorization:`Bearer ${access}`,'content-type':'application/json'},body:JSON.stringify({url:target,title:'Chosen size'})});
    const selectedUrl=`${legacy!.url}?variant=123`;
    const otherUserId=crypto.randomUUID();
    await db.insert(users).values({id:otherUserId,displayName:'Other scheduler user'});
    try{expect((await patch(selectedUrl,await signAccessToken(otherUserId))).status).toBe(404);}
    finally{await db.delete(users).where(eq(users.id,otherUserId));}
    // A token whose account no longer exists is refused before any route logic.
    expect((await patch(selectedUrl,await signAccessToken(crypto.randomUUID()))).status).toBe(401);
    expect((await patch('https://other-store.example/products/other?variant=123')).status).toBe(400);
    expect((await patch(selectedUrl)).status).toBe(200);
    const [changed]=await db.select().from(savedProducts).where(eq(savedProducts.id,legacy!.id));
    expect(changed!.createdAt).toEqual(legacy!.createdAt);
    expect(changed!.orderNumber).toBe('TEST-ORDER');
    expect(changed!.trackedProductId).not.toBe(legacyProductId);
    expect(await db.select().from(savedProductCollections).where(eq(savedProductCollections.savedProductId,legacy!.id))).toHaveLength(1);
    expect((await patch(selectedUrl)).status).toBe(200);
    const [repeated]=await db.select().from(savedProducts).where(eq(savedProducts.id,legacy!.id));
    expect(repeated!.trackingStartedAt).toEqual(changed!.trackingStartedAt);
    const duplicateUrl=`${legacy!.url}?variant=456`;
    await db.insert(savedProducts).values({userId,boutiqueId,url:duplicateUrl,title:'Existing separate variant'});
    expect((await patch(duplicateUrl)).status).toBe(409);
    // Exercise the new SKU path from the save API through parsing, scheduling
    // and notification creation in the isolated database.
    const {extractProductHtml}=await import('./extract-product-price');
    const offerUrl=`${legacy!.url}?Beden=36&_butika_variant=offer:BLUE_36`;
    expect((await patch(offerUrl)).status).toBe(200);
    const [offerSaved]=await db.select().from(savedProducts).where(eq(savedProducts.id,legacy!.id));
    expect(offerSaved!.url).toContain('offer');
    const offerTrack=offerSaved!.trackedProductId!;
    const notifyCount=async()=>(await db.select().from(notifications).where(eq(notifications.userId,userId))).length;
    const initialCount=await notifyCount();
    const checkOffer=async(price:number,availability:string)=>{
      await db.update(trackedProducts).set({nextCheckAt:new Date(0),checkLeaseUntil:null,checkLeaseToken:null}).where(eq(trackedProducts.id,offerTrack));
      const html=`<link rel="canonical" href="${legacy!.url}"><script type="application/ld+json">${JSON.stringify({'@type':'Product',offers:[{'@type':'Offer',sku:'BLUE_36',url:`${legacy!.url}?Beden=36`,price,priceCurrency:'TRY',availability},{'@type':'Offer',sku:'BLUE_38',url:`${legacy!.url}?Beden=38`,price:1,priceCurrency:'TRY',availability:'https://schema.org/InStock'}]})}</script>`;
      return runPriceTrackingBatch({resolve:async(context)=>{
        const extracted=extractProductHtml(html,context.url);
        if(extracted.status!=='success')return {status:'failed',reason:'not_found',error:extracted.error,attempts:[]};
        return {status:'success',observation:{priceMinor:extracted.priceMinor,currency:extracted.currency,availability:extracted.availability??'unknown',observedAt:new Date(),provider:'structured_html'},attempts:[]};
      }});
    };
    expect((await checkOffer(100,'https://schema.org/InStock')).success).toBe(1);
    expect(await notifyCount()).toBe(initialCount);
    expect((await checkOffer(90,'https://schema.org/OutOfStock')).success).toBe(1);
    expect(await notifyCount()).toBe(initialCount);
    expect((await checkOffer(80,'https://schema.org/InStock')).success).toBe(1);
    expect(await notifyCount()).toBe(initialCount+1);
    expect((await db.select().from(trackedProducts).where(eq(trackedProducts.id,offerTrack)))[0]!.currentPriceMinor).toBe(8000);
    // Aymarka: real save route + scheduled HTTP parser, with controlled public
    // responses so a test never waits for or changes a merchant's actual price.
    const barcodeUrl='https://www.machka.com.tr/urun/dress?_butika_variant=aymarka:10:20';
    // Tracking follows only the saved boutique's own site: point the fixture
    // boutique at each store before saving that store's product.
    await db.update(boutiques).set({url:new URL(barcodeUrl).origin}).where(eq(boutiques.id,boutiqueId));
    const barcodeResponse=await app.request('/saved',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({boutiqueId,url:barcodeUrl,title:'Barcode 36'})});
    expect(barcodeResponse.status).toBe(201);
    const barcodeSaved=(await db.select().from(savedProducts).where(eq(savedProducts.userId,userId))).find(s=>s.url.includes('aymarka'))!;
    expect(barcodeSaved.trackedProductId).not.toBeNull();
    const beforeBarcode=await notifyCount(), originalFetch=globalThis.fetch;
    let barcodePrice=100, barcodeAvailable=true, stockOutage=false;
    globalThis.fetch=(async(input:any)=>{
      if(String(input).includes('/api/stocks-by-product'))return new Response(JSON.stringify({isSuccess:!stockOutage,data:{productId:10,stockAvailabilities:[{stockBarcodeId:20,isAvailable:barcodeAvailable,stockTypeValueIds:[1]},{stockBarcodeId:21,isAvailable:true,stockTypeValueIds:[2]}]}}));
      const product={id:10,isApproved:true,isCompleted:true,routePath:'dress',salesPrice:barcodePrice,barcodes:[{id:20,stockTypeValues:[{id:1,name:'36'}]},{id:21,stockTypeValues:[{id:2,name:'38'}]}]};
      return new Response(`<script id="__NEXT_DATA__">${JSON.stringify({props:{pageProps:{data:{response:{isSuccess:true,product},route:{routeParts:{product:[{id:10,path:'dress'}]}}}}}})}</script><div data-test-id="product_price">${barcodePrice},00 TL</div>`);
    }) as typeof fetch;
    try {
      const {resolveProductPrice}=await import('./price-source-router');
      const checkBarcode=async()=>{await db.update(trackedProducts).set({nextCheckAt:new Date(0),checkLeaseUntil:null,checkLeaseToken:null}).where(eq(trackedProducts.id,barcodeSaved.trackedProductId!));return runPriceTrackingBatch({resolve:resolveProductPrice});};
      expect((await checkBarcode()).success).toBe(1);
      expect(await notifyCount()).toBe(beforeBarcode);
      barcodePrice=90;barcodeAvailable=false;
      expect((await checkBarcode()).success).toBe(1);
      expect(await notifyCount()).toBe(beforeBarcode);
      barcodePrice=85;stockOutage=true;
      expect((await checkBarcode()).success).toBe(1);
      expect(await notifyCount()).toBe(beforeBarcode);
      barcodePrice=80;stockOutage=false;barcodeAvailable=true;
      expect((await checkBarcode()).success).toBe(1);
      expect(await notifyCount()).toBe(beforeBarcode+1);
      expect((await checkBarcode()).success).toBe(1);
      expect(await notifyCount()).toBe(beforeBarcode+1);
      const changedBarcode=await app.request(`/saved/${barcodeSaved.id}/variant`,{method:'PATCH',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({url:barcodeUrl.replace(':20',':21'),title:'Barcode 38'})});
      expect(changedBarcode.status).toBe(200);
    } finally {globalThis.fetch=originalFetch;}
    const {brandroomFixture}=await import('./brandroom.fixture');
    let br=brandroomFixture();
    await db.update(boutiques).set({url:new URL(br.selectedUrl).origin}).where(eq(boutiques.id,boutiqueId));
    expect((await app.request('/saved',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({boutiqueId,url:br.selectedUrl,title:'Brandroom 36'})})).status).toBe(201);
    const brSaved=(await db.select().from(savedProducts).where(eq(savedProducts.userId,userId))).find(s=>s.url.includes('brandroom'))!;
    const brCount=await notifyCount(),brFetch=globalThis.fetch;
    globalThis.fetch=(async(input:any)=>new Response(String(input).includes('attributechange')?JSON.stringify(br.response):br.html)) as typeof fetch;
    try {
      const {resolveProductPrice}=await import('./price-source-router');
      const check=async()=>{await db.update(trackedProducts).set({nextCheckAt:new Date(0),checkLeaseUntil:null,checkLeaseToken:null}).where(eq(trackedProducts.id,brSaved.trackedProductId!));return runPriceTrackingBatch({resolve:resolveProductPrice});};
      // Finish the preceding size-change check without a fixture for that store.
      await db.update(trackedProducts).set({nextCheckAt:new Date(Date.now()+86400000)}).where(eq(trackedProducts.boutiqueId,boutiqueId));
      expect((await check()).success).toBe(1);expect(await notifyCount()).toBe(brCount);
      br=brandroomFixture(90,false);expect((await check()).success).toBe(1);expect(await notifyCount()).toBe(brCount);
      br=brandroomFixture(80,true);expect((await check()).success).toBe(1);expect(await notifyCount()).toBe(brCount+1);
      expect((await check()).success).toBe(1);expect(await notifyCount()).toBe(brCount+1);
      expect((await app.request(`/saved/${brSaved.id}/variant`,{method:'PATCH',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({url:br.selectedUrl.replace(br.valueId,br.otherId),title:'Brandroom 38'})})).status).toBe(200);
    } finally {globalThis.fetch=brFetch;}
    for(const kind of ['modanisa','woo'] as const){
      const base=kind==='modanisa'?'https://www.modanisa.com/test-skirt.html':'https://woo.example/test-dress';
      const chosen=base+'?_butika_variant='+kind+':10:20';
      await db.update(boutiques).set({url:new URL(base).origin}).where(eq(boutiques.id,boutiqueId));
      expect((await app.request('/saved',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({boutiqueId,url:chosen,title:kind+' 38'})})).status).toBe(201);
      const record=(await db.select().from(savedProducts).where(eq(savedProducts.userId,userId))).find(s=>s.url===chosen)!;
      const count=await notifyCount(),oldFetch=globalThis.fetch;let price=100,stock=true;
      globalThis.fetch=(async(input:any)=>{
        const endpoint=String(input);
        if(endpoint.includes('pd-bff'))return new Response(JSON.stringify({id:'10',price:{symbol:'TL',sellPrice:price+',00 TL'},colors:[{productId:'10',sef:base,sizes:[{sku:'20',name:'38',quantity:stock?2:0},{sku:'21',name:'40',quantity:3}]}]}));
        if(endpoint.endsWith('/products/10'))return new Response(JSON.stringify({id:10,type:'variable',permalink:base,variations:[{id:20},{id:21}]}));
        if(endpoint.endsWith('/products/20'))return new Response(JSON.stringify({id:20,parent:10,type:'variation',permalink:base+'?attribute_beden=38',prices:{price:String(price*100),currency_code:'TRY',currency_minor_unit:2,price_range:null},is_in_stock:stock,is_purchasable:true,is_on_backorder:false,stock_availability:{class:stock?'in-stock':'out-of-stock'}}));
        return new Response('<html></html>');
      }) as typeof fetch;
      try{
        const {resolveProductPrice}=await import('./price-source-router');
        await db.update(trackedProducts).set({nextCheckAt:new Date(Date.now()+86400000)}).where(eq(trackedProducts.boutiqueId,boutiqueId));
        const check=async()=>{await db.update(trackedProducts).set({nextCheckAt:new Date(0),checkLeaseUntil:null,checkLeaseToken:null}).where(eq(trackedProducts.id,record.trackedProductId!));return runPriceTrackingBatch({resolve:resolveProductPrice});};
        expect((await check()).success).toBe(1);expect(await notifyCount()).toBe(count);
        price=90;stock=false;expect((await check()).success).toBe(1);expect(await notifyCount()).toBe(count);
        price=80;stock=true;expect((await check()).success).toBe(1);expect(await notifyCount()).toBe(count+1);
        expect((await check()).success).toBe(1);expect(await notifyCount()).toBe(count+1);
        expect((await app.request(`/saved/${record.id}/variant`,{method:'PATCH',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({url:chosen.replace(':20',':21'),title:kind+' 40'})})).status).toBe(200);
      }finally{globalThis.fetch=oldFetch;}
    }
    // Big Lesson: its page stock has no independent evidence yet. The price is
    // tracked, but a restock alert is never confirmed or fired and no in-stock
    // baseline is set, whether the page claims "sold out" or "in stock".
    {
      const page='https://big-lesson.com/products/test-jean';
      const auth={authorization:`Bearer ${token}`};
      await db.update(boutiques).set({url:'https://big-lesson.com'}).where(eq(boutiques.id,boutiqueId));
      expect((await app.request('/saved',{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({boutiqueId,url:page,title:'Big Lesson jean'})})).status).toBe(201);
      const record=(await db.select().from(savedProducts).where(eq(savedProducts.userId,userId))).find(s=>s.url===page)!;
      // No alert is offered for this store, not even as pending before the first check.
      const early=await app.request(`/saved/${record.id}/restock-alert`,{method:'PUT',headers:auth});
      expect(early.status).toBe(409);
      expect(await early.text()).toContain('stock_unknown');
      // An alert left from before this rule must still never be confirmed or fired.
      await db.update(savedProducts).set({restockAlertAt:new Date()}).where(eq(savedProducts.id,record.id));
      const count=await notifyCount();
      const oldFetch=globalThis.fetch;
      let stock='OutOfStock';
      let price='1299.99';
      globalThis.fetch=(async(input:string|URL|Request)=>{
        if(new URL(String(input)).pathname.endsWith('.js'))return new Response('',{status:404});
        return new Response(`<link rel="canonical" href="${page}"><script type="application/ld+json">${JSON.stringify({'@type':'Product',name:'Jean',url:page,offers:{'@type':'Offer',url:page,price,priceCurrency:'TRY',availability:`https://schema.org/${stock}`}})}</script>`,{headers:{'content-type':'text/html; charset=utf-8'}});
      }) as typeof fetch;
      try{
        const {resolveProductPrice}=await import('./price-source-router');
        await db.update(trackedProducts).set({nextCheckAt:new Date(Date.now()+86400000)}).where(eq(trackedProducts.boutiqueId,boutiqueId));
        const check=async()=>{await db.update(trackedProducts).set({nextCheckAt:new Date(0),checkLeaseUntil:null,checkLeaseToken:null}).where(eq(trackedProducts.id,record.trackedProductId!));return runPriceTrackingBatch({resolve:resolveProductPrice});};
        const state=async()=>{
          const [s]=await db.select({alertAt:savedProducts.restockAlertAt,confirmedAt:savedProducts.restockConfirmedAt}).from(savedProducts).where(eq(savedProducts.id,record.id));
          const [t]=await db.select({availability:trackedProducts.availability,priceMinor:trackedProducts.currentPriceMinor,baselineAt:trackedProducts.notificationBaselineAt}).from(trackedProducts).where(eq(trackedProducts.id,record.trackedProductId!));
          return {...s!,...t!};
        };
        expect((await check()).success).toBe(1);
        expect(await state()).toMatchObject({availability:'unknown',priceMinor:129999,confirmedAt:null,baselineAt:null});
        expect((await state()).alertAt).not.toBeNull();
        stock='InStock';price='999.99';
        expect((await check()).success).toBe(1);
        expect(await state()).toMatchObject({availability:'unknown',priceMinor:99999,confirmedAt:null,baselineAt:null});
        expect(await notifyCount()).toBe(count);
        // Once checked, a new alert is refused because the stock cannot be verified.
        expect((await app.request(`/saved/${record.id}/restock-alert`,{method:'DELETE',headers:auth})).status).toBe(200);
        const refused=await app.request(`/saved/${record.id}/restock-alert`,{method:'PUT',headers:auth});
        expect(refused.status).toBe(409);
        expect(await refused.text()).toContain('stock_unknown');
        // State left from before this rule (an armed alert on a sold-out size) is kept in
        // the database but never presented as working, so the app offers no alert control.
        await db.update(savedProducts).set({restockAlertAt:new Date(),restockConfirmedAt:new Date()}).where(eq(savedProducts.id,record.id));
        const {restockControl}=await import(new URL('../../../../mobile/src/lib/restock.ts',import.meta.url).href);
        const listed=async()=>((await (await app.request('/saved',{headers:auth})).json()) as Array<{id:string;tracking:{status:string};restockAlert:string}>).find(s=>s.id===record.id)!;
        for(const availability of ['out_of_stock','in_stock'] as const){
          await db.update(trackedProducts).set({availability,lastSuccessAt:new Date(),consecutiveFailures:0,notificationBaselineAt:availability==='in_stock'?new Date():null}).where(eq(trackedProducts.id,record.trackedProductId!));
          const item=await listed();
          expect(item.restockAlert).toBe('off');
          expect(item.tracking.status).toBe('unverified');
          expect(restockControl(item.tracking,item.restockAlert)).toBeNull();
        }
        expect((await db.select({alertAt:savedProducts.restockAlertAt}).from(savedProducts).where(eq(savedProducts.id,record.id)))[0]!.alertAt).not.toBeNull();
      }finally{globalThis.fetch=oldFetch;}
    }
    // IKAS size without its own Offer: one default Offer proves only the shared
    // price. The size's own stock drives the alert; incomplete stock stays unknown.
    {
      const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
      const base='https://common-price.example/dress';
      const chosen=`${base}?_butika_variant=ikas:${uid(1)}:${uid(11)}&vid=${uid(11)}`;
      const auth={authorization:`Bearer ${token}`};
      let chosenStock=0;
      let locations=[uid(3)];
      const page=()=>{
        const value=(n:number)=>({id:uid(n),variantTypeId:uid(20)});
        const product={id:uid(1),deleted:false,metaData:{slug:'dress'},selectedVariantValues:[value(30)],salesChannels:[{id:uid(2),status:'VISIBLE'}],
          variants:[0,1].map(n=>({id:uid(10+n),productId:uid(1),deleted:false,isActive:true,sellIfOutOfStock:false,variantValues:[value(30+n)],
            stocks:[{stockLocationId:uid(3),stockCount:n===0?5:chosenStock}],prices:[{sellPrice:100,discountPrice:80,campaignPrice:null,priceListId:null,currencyCode:'TRY'}]}))};
        const data={props:{pageProps:{pageSpecificData:product,configJson:{salesChannelId:uid(2),stockLocationIds:locations}}}};
        const offer={url:`${base}?Size=S`,price:80,priceCurrency:'TRY',availability:'https://schema.org/InStock'};
        return `<script id="__NEXT_DATA__">${JSON.stringify(data)}</script><script type="application/ld+json">${JSON.stringify({'@type':'Product',offers:offer})}</script>`;
      };
      await db.update(boutiques).set({url:'https://common-price.example'}).where(eq(boutiques.id,boutiqueId));
      expect((await app.request('/saved',{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({boutiqueId,url:chosen,title:'Common price dress · M'})})).status).toBe(201);
      const record=(await db.select().from(savedProducts).where(eq(savedProducts.userId,userId))).find(s=>s.url===chosen)!;
      const count=await notifyCount();
      const oldFetch=globalThis.fetch;
      globalThis.fetch=(async(_input:string|URL|Request)=>new Response(page(),{headers:{'content-type':'text/html; charset=utf-8'}})) as typeof fetch;
      try{
        const {resolveProductPrice}=await import('./price-source-router');
        await db.update(trackedProducts).set({nextCheckAt:new Date(Date.now()+86400000)}).where(eq(trackedProducts.boutiqueId,boutiqueId));
        const check=async()=>{await db.update(trackedProducts).set({nextCheckAt:new Date(0),checkLeaseUntil:null,checkLeaseToken:null}).where(eq(trackedProducts.id,record.trackedProductId!));return runPriceTrackingBatch({resolve:resolveProductPrice});};
        const tracked=async()=>(await db.select({availability:trackedProducts.availability,priceMinor:trackedProducts.currentPriceMinor}).from(trackedProducts).where(eq(trackedProducts.id,record.trackedProductId!)))[0]!;
        // The default size's Offer says InStock; the chosen size is sold out by its own stock.
        expect((await check()).success).toBe(1);
        expect(await tracked()).toEqual({availability:'out_of_stock',priceMinor:8000});
        expect(await (await app.request(`/saved/${record.id}/restock-alert`,{method:'PUT',headers:auth})).json()).toEqual({restockAlert:'armed'});
        const listedArmed=((await (await app.request('/saved',{headers:auth})).json()) as Array<{id:string;tracking:{status:string};restockAlert:string}>).find(s=>s.id===record.id)!;
        expect(listedArmed).toMatchObject({restockAlert:'armed',tracking:{status:'out_of_stock'}});
        const {restockControl}=await import(new URL('../../../../mobile/src/lib/restock.ts',import.meta.url).href);
        expect(restockControl(listedArmed.tracking,listedArmed.restockAlert)).toBe('armed');
        chosenStock=3;
        expect((await check()).success).toBe(1);
        expect(await tracked()).toEqual({availability:'in_stock',priceMinor:8000});
        expect(await notifyCount()).toBe(count+1);
        // An online location without stock data for the chosen size proves nothing.
        chosenStock=0;locations=[uid(3),uid(4)];
        expect((await check()).success).toBe(1);
        expect((await tracked()).availability).toBe('unknown');
        const refused=await app.request(`/saved/${record.id}/restock-alert`,{method:'PUT',headers:auth});
        expect(refused.status).toBe(409);
        expect(await refused.text()).toContain('stock_unknown');
        expect(await notifyCount()).toBe(count+1);
      }finally{globalThis.fetch=oldFetch;}
    }
    // IKAS common price, price drop: the chosen size is in stock by its own stock
    // while the default Offer says sold out. A drop counts only when the model
    // prices and the single Offer drop together; it notifies once.
    {
      const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
      const base='https://common-price.example/dress-2';
      const chosen=`${base}?_butika_variant=ikas:${uid(101)}:${uid(111)}&vid=${uid(111)}`;
      let modelPrice=80;
      let offerPrice=80;
      const page=()=>{
        const value=(n:number)=>({id:uid(n),variantTypeId:uid(120)});
        const product={id:uid(101),deleted:false,metaData:{slug:'dress-2'},selectedVariantValues:[value(130)],salesChannels:[{id:uid(102),status:'VISIBLE'}],
          variants:[0,1].map(n=>({id:uid(110+n),productId:uid(101),deleted:false,isActive:true,sellIfOutOfStock:false,variantValues:[value(130+n)],
            stocks:[{stockLocationId:uid(103),stockCount:n===0?0:4}],prices:[{sellPrice:100,discountPrice:modelPrice,campaignPrice:null,priceListId:null,currencyCode:'TRY'}]}))};
        const data={props:{pageProps:{pageSpecificData:product,configJson:{salesChannelId:uid(102),stockLocationIds:[uid(103)]}}}};
        const offer={url:`${base}?Size=S`,price:offerPrice,priceCurrency:'TRY',availability:'https://schema.org/OutOfStock'};
        return `<script id="__NEXT_DATA__">${JSON.stringify(data)}</script><script type="application/ld+json">${JSON.stringify({'@type':'Product',offers:offer})}</script>`;
      };
      expect((await app.request('/saved',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({boutiqueId,url:chosen,title:'Common price dress 2 · M'})})).status).toBe(201);
      const record=(await db.select().from(savedProducts).where(eq(savedProducts.userId,userId))).find(s=>s.url===chosen)!;
      const drops=async()=>(await db.select().from(notifications).where(eq(notifications.userId,userId))).filter(n=>n.type==='price_drop').length;
      const before=await drops();
      const oldFetch=globalThis.fetch;
      globalThis.fetch=(async(_input:string|URL|Request)=>new Response(page(),{headers:{'content-type':'text/html; charset=utf-8'}})) as typeof fetch;
      try{
        const {resolveProductPrice}=await import('./price-source-router');
        await db.update(trackedProducts).set({nextCheckAt:new Date(Date.now()+86400000)}).where(eq(trackedProducts.boutiqueId,boutiqueId));
        const check=async()=>{await db.update(trackedProducts).set({nextCheckAt:new Date(0),checkLeaseUntil:null,checkLeaseToken:null}).where(eq(trackedProducts.id,record.trackedProductId!));return runPriceTrackingBatch({resolve:resolveProductPrice});};
        const tracked=async()=>(await db.select({availability:trackedProducts.availability,priceMinor:trackedProducts.currentPriceMinor,baseline:trackedProducts.notificationBaselinePriceMinor}).from(trackedProducts).where(eq(trackedProducts.id,record.trackedProductId!)))[0]!;
        // First verified in-stock price is the baseline, not a drop.
        expect((await check()).success).toBe(1);
        expect(await tracked()).toEqual({availability:'in_stock',priceMinor:8000,baseline:8000});
        expect(await drops()).toBe(before);
        // Model prices drop but the only Offer still shows the old price: no proof.
        modelPrice=64;
        expect((await check()).success).toBe(0);
        expect(await tracked()).toEqual({availability:'in_stock',priceMinor:8000,baseline:8000});
        expect(await drops()).toBe(before);
        // Model prices and the Offer drop together: exactly one notification.
        offerPrice=64;
        expect((await check()).success).toBe(1);
        expect(await tracked()).toEqual({availability:'in_stock',priceMinor:6400,baseline:6400});
        expect(await drops()).toBe(before+1);
        // The same price read again does not notify twice.
        expect((await check()).success).toBe(1);
        expect(await drops()).toBe(before+1);
      }finally{globalThis.fetch=oldFetch;}
    }
  } finally {
    await db.delete(retailerRequestGates).where(eq(retailerRequestGates.origin,gateOrigin));
    await db.delete(retailerRequestGates).where(eq(retailerRequestGates.origin,SHOPIFY_GATE));
    await db.delete(users).where(eq(users.id,userId));
    await db.delete(trackedProducts).where(eq(trackedProducts.boutiqueId,boutiqueId));
    await db.delete(boutiques).where(eq(boutiques.id,boutiqueId));
  }
}, 30000);
