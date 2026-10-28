import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Retailer fetches run from the API's network position (Docker bridge, host
// PostgreSQL, MinIO, cloud metadata). A user-supplied product URL and every
// redirect hop must therefore reach public addresses only. Bun's fetch resolves
// the host again after this check, so a DNS-rebinding attacker can still race
// it; egress firewall rules on the host remain the stronger control.

export class OutboundRequestBlockedError extends Error {
  constructor(readonly reason: string) {
    super(`Outbound request blocked: ${reason}`);
    this.name = 'OutboundRequestBlockedError';
  }
}

export type HostResolver = (hostname: string) => Promise<string[]>;
type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export const MAX_REDIRECTS = 5;
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const INTERNAL_SUFFIXES = ['localhost', 'local', 'localdomain', 'internal', 'intranet', 'lan', 'home', 'corp', 'home.arpa'];
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

const bareHost = (hostname: string) => hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();

function isPublicIpv4(parts: number[]): boolean {
  const [a = 0, b = 0, c = 0] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this network, private, loopback, multicast/reserved
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local, including cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF assignments, TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return false; // 6to4 relay anycast
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  return true;
}

function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase().split('%')[0] ?? '';
  const v4 = text.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [p0 = 0, p1 = 0, p2 = 0, p3 = 0] = v4.slice(1).map(Number);
    text = `${text.slice(0, text.length - v4[0].length)}${((p0 << 8) | p1).toString(16)}:${((p2 << 8) | p3).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail]
    .map((group) => Number.parseInt(group, 16));
  return groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? groups : null;
}

function isPublicIpv6(address: string): boolean {
  const groups = ipv6Groups(address);
  if (!groups) return false;
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups;
  const embedded = (high: number, low: number) => isPublicIpv4([high >> 8, high & 0xff, low >> 8, low & 0xff]);
  // ::, ::1, IPv4-compatible and IPv4-mapped addresses follow the IPv4 rules.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && (g5 === 0 || g5 === 0xffff)) return embedded(g6, g7);
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return embedded(g6, g7); // NAT64
  if (g0 === 0x2002) return embedded(g1, g2); // 6to4
  if (g0 === 0x2001 && (g1 === 0 || g1 === 0x0db8)) return false; // Teredo, documentation
  return (g0 & 0xe000) === 0x2000; // global unicast 2000::/3 only
}

export function isPublicIp(address: string): boolean {
  const host = bareHost(address);
  const version = isIP(host);
  if (version === 4) return isPublicIpv4(host.split('.').map(Number));
  if (version === 6) return isPublicIpv6(host);
  return false;
}

/** Checks that need no network: scheme, embedded credentials, port and host shape. */
export function assertOutboundUrl(url: URL): void {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new OutboundRequestBlockedError('protocol');
  if (url.username || url.password) throw new OutboundRequestBlockedError('credentials');
  if (url.port !== '' && url.port !== '80' && url.port !== '443') throw new OutboundRequestBlockedError('port');
  const host = bareHost(url.hostname);
  if (isIP(host)) {
    if (!isPublicIp(host)) throw new OutboundRequestBlockedError('private_address');
    return;
  }
  if (!host.includes('.')) throw new OutboundRequestBlockedError('single_label_host');
  if (INTERNAL_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    throw new OutboundRequestBlockedError('internal_host');
  }
}

const systemResolver: HostResolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

/** Static checks plus DNS: every address the host resolves to must be public. */
export async function assertPublicDestination(url: URL, resolve: HostResolver = systemResolver): Promise<void> {
  assertOutboundUrl(url);
  const host = bareHost(url.hostname);
  if (isIP(host)) return;
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new OutboundRequestBlockedError('dns_lookup_failed');
  }
  if (!addresses.length || !addresses.every((address) => isPublicIp(address))) {
    throw new OutboundRequestBlockedError('private_address');
  }
}

function limitBody(response: Response, maxBytes: number): Response {
  const declared = Number(response.headers.get('content-length') ?? Number.NaN);
  if (declared > maxBytes) {
    response.body?.cancel().catch(() => {});
    throw new OutboundRequestBlockedError('response_too_large');
  }
  if (!response.body || NULL_BODY_STATUSES.has(response.status)) return response;
  let received = 0;
  const limited = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > maxBytes) controller.error(new OutboundRequestBlockedError('response_too_large'));
        else controller.enqueue(chunk);
      },
    }),
  );
  return new Response(limited, { status: response.status, statusText: response.statusText, headers: response.headers });
}

/**
 * fetch with the destination checked before every hop. Redirects are followed
 * manually (at most MAX_REDIRECTS) so each Location is validated; `redirect:
 * 'error' | 'manual'` keep their fetch meaning. Bodies are capped at
 * MAX_RESPONSE_BYTES.
 */
export function createGuardedFetch(options: {
  fetch?: Fetch; resolve?: HostResolver; maxRedirects?: number; maxBodyBytes?: number;
} = {}): Fetch {
  const send: Fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const maxBodyBytes = options.maxBodyBytes ?? MAX_RESPONSE_BYTES;
  return async (input, init = {}) => {
    const mode = init.redirect ?? 'follow';
    let url = new URL(String(input));
    let method = (init.method ?? 'GET').toUpperCase();
    let body = init.body;
    for (let hops = 0; ; hops++) {
      await assertPublicDestination(url, options.resolve);
      const response = await send(url, { ...init, method, body, redirect: 'manual' });
      const location = response.headers.get('location');
      if (mode === 'manual' || !location || response.status < 300 || response.status > 399) {
        return limitBody(response, maxBodyBytes);
      }
      await response.body?.cancel().catch(() => {});
      if (mode === 'error') throw new TypeError('Redirect was not allowed');
      if (hops >= maxRedirects) throw new OutboundRequestBlockedError('too_many_redirects');
      url = new URL(location, url);
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
        method = 'GET';
        body = undefined;
      }
    }
  };
}
