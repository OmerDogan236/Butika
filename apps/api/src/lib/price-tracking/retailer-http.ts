import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { curlIstek } from '../curl-fetch';
import { createGuardedFetch, type HostResolver, isPublicIp, OutboundRequestBlockedError } from './outbound-guard';
import { pazarBaglami, pazarCerezi } from './pazar';

export const SHOPIFY_GATE = 'platform:shopify-public';
export const SHOPIFY_SPACING_MS = 3000;
// Default transport: public destinations only, redirects re-validated, bodies capped.

/**
 * Retailer requests go through curl: Shopify answers Bun's fetch with 429
 * ("local_rate_limited") even on a single request (product pages and .js endpoints),
 * while curl from the same host gets 200.
 * Same User-Agent, pacing and cooldowns. curl is pinned to an address resolved and
 * checked here, so a second DNS answer cannot steer it to a private address.
 */
export function createPinnedCurlFetch(deps: { resolve?: HostResolver; request?: typeof curlIstek } = {}) {
  const resolve = deps.resolve ?? (async (host: string) => (await lookup(host, { all: true, verbatim: true })).map((e) => e.address));
  const request = deps.request ?? curlIstek;
  return async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host)) {
      if (!isPublicIp(host)) throw new OutboundRequestBlockedError('private_address');
      return request(url, init, { baglanAdresi: host });
    }
    let addresses: string[];
    try { addresses = await resolve(host); } catch { throw new OutboundRequestBlockedError('dns_lookup_failed'); }
    if (!addresses.length || !addresses.every((a) => isPublicIp(a))) throw new OutboundRequestBlockedError('private_address');
    return request(url, init, { baglanAdresi: addresses.find((a) => isIP(a) === 4) ?? addresses[0] });
  };
}
const guardedFetch = createGuardedFetch({ fetch: createPinnedCurlFetch() });
function platformKey(input:string|URL) { return /\/(?:products\.json|products\/[^/]+\.js|cart\.js)$/.test(new URL(input).pathname) ? SHOPIFY_GATE : null; }

type Gate = { nextStart: number; blockedUntil: number };
export type RetailerRequestCoordinator = {
  reserve(origin:string):Promise<{startAt:number;blockedUntil:number}>;
  block(origin:string,until:number):Promise<void>;
  blockedUntil?(origin:string):Promise<number>;
};
let sharedCoordinator:RetailerRequestCoordinator | undefined;
export function configureRetailerRequestCoordinator(coordinator:RetailerRequestCoordinator) { sharedCoordinator=coordinator; }
function originKey(input:string|URL) { const url=new URL(input);url.hostname=url.hostname.replace(/^www\./,'');return url.origin; }

export function retryAfterMs(value: string | null, now: number): number {
  if (!value) return 60_000;
  if (/^\d+$/.test(value.trim())) { const delay=Number(value)*1000;return Number.isSafeInteger(delay) && delay < 8.64e15-now ? Math.max(1000,delay) : 60000; }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1000, date - now) : 60_000;
}

/** Process-local pacing; never retries or changes identity to bypass a retailer limit. */
export function createRetailerFetch(options: {
  spacingMs?: number; globalSpacingMs?: number;
  now?: () => number; sleep?: (ms: number, signal?: AbortSignal | null) => Promise<void>;
  fetch?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  coordinator?: RetailerRequestCoordinator;
} = {}) {
  const origins = new Map<string, Gate>();
  const platformOrigins=new Set<string>();
  let globalNext = 0;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms, signal) => new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => { clearTimeout(timer); reject(signal?.reason); };
    signal?.addEventListener('abort', abort, { once: true });
  }));
  const request = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const origin = originKey(input), platform=platformKey(input);
    if(platform) platformOrigins.add(origin);
    const keys=platform?[origin,platform]:[origin];
    const coordinator=options.coordinator ?? sharedCoordinator;
    const gates=keys.map(key=>{let gate=origins.get(key);if(!gate){gate={nextStart:0,blockedUntil:0};origins.set(key,gate);}return gate;});
    const deadline=()=>Math.max(...gates.map(g=>g.blockedUntil));
    const blocked = () => new Response('Retailer cooldown; request was not sent', {
      status:429,headers:{'retry-after':String(Math.max(1,Math.ceil((deadline()-now())/1000))),'x-butika-cooldown':'1'},
    });
    if(deadline()>now())return blocked();
    let sharedStart=0;
    for(let i=0;i<keys.length;i++){
      const reservation=await coordinator?.reserve(keys[i]!);
      if(reservation){sharedStart=Math.max(sharedStart,reservation.startAt);gates[i]!.blockedUntil=Math.max(gates[i]!.blockedUntil,reservation.blockedUntil);}
    }
    if(deadline()>now())return blocked();
    const start=Math.max(now(),globalNext,sharedStart,...gates.map(g=>g.nextStart));
    gates.forEach((gate,i)=>{gate.nextStart=start+(keys[i]===SHOPIFY_GATE?SHOPIFY_SPACING_MS:(options.spacingMs??1000));});
    globalNext=start+(options.globalSpacingMs??300);
    if(start>now())await sleep(start-now(),init?.signal);
    for(let i=0;i<keys.length;i++){
      const latest=await coordinator?.blockedUntil?.(keys[i]!);
      if(latest)gates[i]!.blockedUntil=Math.max(gates[i]!.blockedUntil,latest);
    }
    if(deadline()>now())return blocked();
    if(init?.signal?.aborted)throw init.signal.reason;
    // Mağaza fiyatı pazara göre: Shopify pazarı bu çerezden okur (bkz. pazar.ts).
    const cerez=pazarCerezi(pazarBaglami.getStore()?.ulke);
    if(cerez&&!new Headers(init?.headers).has('cookie')){const headers=new Headers(init?.headers);headers.set('cookie',cerez);init={...init,headers};}
    const response=await (options.fetch??guardedFetch)(input,init);
    if([429,503,403].includes(response.status)){
      const delay=response.status===403?300000:retryAfterMs(response.headers.get('retry-after'),now());
      gates[0]!.blockedUntil=Math.max(gates[0]!.blockedUntil,now()+delay);
      await coordinator?.block(origin,gates[0]!.blockedUntil);
      // Shared platform throttling must also pause other storefront domains.
      if(platform&&response.status===429){gates[1]!.blockedUntil=Math.max(gates[1]!.blockedUntil,now()+Math.max(delay,300000));await coordinator?.block(platform,gates[1]!.blockedUntil);}
    }
    // Only remove idle origins; an active cooldown is never forgotten to retry sooner.
    if (origins.size > 5000) for (const [key, value] of origins) {
      if (value.nextStart < now() - 60_000 && value.blockedUntil < now()) origins.delete(key);
    }
    return response;
  };
  return Object.assign(request, { blockedUntil: (url: string) => Math.max(origins.get(originKey(url))?.blockedUntil??0,(platformKey(url)||platformOrigins.has(originKey(url)))?(origins.get(SHOPIFY_GATE)?.blockedUntil??0):0) });
}

// Tests exercising provider parsing use isolated fixtures; transport policy has its own tests.
export const retailerFetch = process.env.NODE_ENV === 'test'
  ? Object.assign((input: string | URL, init?: RequestInit) => globalThis.fetch(input, init), { blockedUntil: (_url: string) => 0 })
  : createRetailerFetch();
