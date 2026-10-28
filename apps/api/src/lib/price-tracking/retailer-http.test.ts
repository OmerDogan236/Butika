import { expect, test } from 'bun:test';
import { createPinnedCurlFetch, createRetailerFetch, retryAfterMs } from './retailer-http';

test('Retry-After supports seconds, HTTP dates and malformed values', () => {
  expect(retryAfterMs('120', 0)).toBe(120000);
  expect(retryAfterMs('Thu, 01 Jan 1970 00:02:00 GMT', 0)).toBe(120000);
  expect(retryAfterMs('invalid', 0)).toBe(60000);
});

test('429 suppresses fallback traffic until the retailer retry time', async () => {
  let time = 0;
  let calls = 0;
  const request = createRetailerFetch({ now: () => time, spacingMs: 0, globalSpacingMs: 0,
    fetch: async () => { calls++; return new Response('', { status: 429, headers: { 'retry-after': '120' } }); } });
  await request('https://store.test/product-data');
  const response = await request('https://store.test/price-data');
  expect(calls).toBe(1);
  expect(response.headers.get('x-butika-cooldown')).toBe('1');
  time = 120000;
  await request('https://store.test/price-data');
  expect(calls).toBe(2);
});

test('same-origin requests are spaced and other origins share a global pace', async () => {
  let time = 0;
  const starts: number[] = [];
  const request = createRetailerFetch({ now: () => time, sleep: async ms => { time += ms; },
    fetch: async () => { starts.push(time); return new Response('{}'); } });
  await request('https://a.test/one');
  await request('https://a.test/two');
  await request('https://b.test/one');
  expect(starts).toEqual([0, 1000, 1300]);
});

test('an aborted queued request is never sent', async () => {
  let calls = 0;
  const request = createRetailerFetch({ fetch: async () => { calls++; return new Response('{}'); } });
  await expect(request('https://store.test/', { signal: AbortSignal.abort(new Error('cancelled')) })).rejects.toThrow('cancelled');
  expect(calls).toBe(0);
});

test('a fresh worker respects a cooldown persisted by another worker',async()=>{
  let blockedUntil=0,calls=0;
  const coordinator={reserve:async()=>({startAt:0,blockedUntil}),block:async(_origin:string,until:number)=>{blockedUntil=until;}};
  const options={now:()=>0,coordinator,fetch:async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'120'}});}};
  await createRetailerFetch(options)('https://www.store.test/a');
  const result=await createRetailerFetch(options)('https://store.test/b');
  expect(calls).toBe(1);
  expect(result.headers.get('retry-after')).toBe('120');
});


test('Shopify API pacing and 429 cooldown apply across storefront domains',async()=>{
  let time=0,status=200;const starts:number[]=[];
  const request=createRetailerFetch({now:()=>time,sleep:async ms=>{time+=ms;},fetch:async()=>{starts.push(time);return new Response('{}',{status,headers:{'retry-after':'600'}});}});
  await request('https://one.test/products/a.js');
  await request('https://two.test/cart.js');
  expect(starts).toEqual([0,3000]);
  status=429;await request('https://two.test/products.json');
  const blocked=await request('https://three.test/products/b.js');
  expect(blocked.headers.get('x-butika-cooldown')).toBe('1');
  expect(starts).toHaveLength(3);
  expect(request.blockedUntil('https://one.test/products/a')).toBe(time+600000);
  await request('https://unrelated.test/product');
  expect(starts).toHaveLength(4);
});

test('pinned curl: connects to the checked public address, prefers IPv4', async () => {
  const calls: { url: string; pin?: string }[] = [];
  const f = createPinnedCurlFetch({
    resolve: async () => ['2606:4700::1', '23.227.38.74'],
    request: async (u, _i, o) => { calls.push({ url: String(u), pin: o?.baglanAdresi }); return new Response('{}'); },
  });
  await f('https://shop.example/products/x.js');
  expect(calls).toEqual([{ url: 'https://shop.example/products/x.js', pin: '23.227.38.74' }]);
});

test('pinned curl: any private answer blocks the request before curl runs', async () => {
  let ran = false;
  const request = async () => { ran = true; return new Response(''); };
  await expect(createPinnedCurlFetch({ resolve: async () => ['23.227.38.74', '10.0.0.5'], request })('https://shop.example/products/x.js')).rejects.toThrow('private_address');
  await expect(createPinnedCurlFetch({ request })('http://127.0.0.1/products/x.js')).rejects.toThrow('private_address');
  expect(ran).toBe(false);
});
