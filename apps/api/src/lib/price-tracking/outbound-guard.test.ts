import { expect, test } from 'bun:test';
import {
  OutboundRequestBlockedError,
  assertOutboundUrl,
  assertPublicDestination,
  createGuardedFetch,
  isPublicIp,
} from './outbound-guard';

const PUBLIC = '93.184.216.34';
const resolver = (table: Record<string, string[]>) => async (host: string) => {
  const addresses = table[host];
  if (!addresses) throw new Error(`ENOTFOUND ${host}`);
  return addresses;
};
const blockedReason = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof OutboundRequestBlockedError ? error.reason : `other:${String(error)}`;
  }
  return 'not blocked';
};

test('private, loopback, link-local, metadata and mapped addresses are not public', () => {
  for (const address of [
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1',
    '::', '::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1',
    '::ffff:7f00:1', '::ffff:169.254.169.254', '64:ff9b::a9fe:a9fe', '2002:7f00:1::1', '2001:db8::1', '[::1]',
  ]) expect([address, isPublicIp(address)]).toEqual([address, false]);
  for (const address of [PUBLIC, '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])
    expect([address, isPublicIp(address)]).toEqual([address, true]);
});

test('URL shape rejects schemes, credentials, ports and internal host names without DNS', () => {
  const reason = (value: string) => {
    try {
      assertOutboundUrl(new URL(value));
      return 'allowed';
    } catch (error) {
      return (error as OutboundRequestBlockedError).reason;
    }
  };
  expect(reason('https://shop.example.com/p/1')).toBe('allowed');
  expect(reason('http://shop.example.com:80/p')).toBe('allowed');
  expect(reason('ftp://shop.example.com/p')).toBe('protocol');
  expect(reason('https://user:pass@shop.example.com/p')).toBe('credentials');
  expect(reason('https://shop.example.com:8443/p')).toBe('port');
  expect(reason('http://169.254.169.254/latest/meta-data')).toBe('private_address');
  expect(reason('http://2130706433/')).toBe('private_address'); // 127.0.0.1 in decimal
  expect(reason('http://0x7f.1/')).toBe('private_address');
  expect(reason('http://[::ffff:127.0.0.1]/')).toBe('private_address');
  expect(reason('http://minio:9000/')).toBe('port');
  expect(reason('http://minio/')).toBe('single_label_host');
  expect(reason('http://host.docker.internal/')).toBe('internal_host');
  expect(reason('http://printer.local/')).toBe('internal_host');
});

test('a public-looking host that resolves to a private address is blocked', async () => {
  const resolve = resolver({ 'shop.example.com': [PUBLIC], 'evil.example.com': [PUBLIC, '10.0.0.5'] });
  await assertPublicDestination(new URL('https://shop.example.com/p'), resolve);
  expect(await blockedReason(assertPublicDestination(new URL('https://evil.example.com/'), resolve))).toBe('private_address');
  expect(await blockedReason(assertPublicDestination(new URL('https://missing.example.com/'), resolve))).toBe('dns_lookup_failed');
});

test('every redirect hop is validated and private targets are never requested', async () => {
  const requested: string[] = [];
  const guarded = createGuardedFetch({
    resolve: resolver({ 'shop.example.com': [PUBLIC], 'cdn.example.net': [PUBLIC] }),
    fetch: async (input) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith('/to-metadata')) return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } });
      if (url.endsWith('/to-cdn')) return new Response(null, { status: 301, headers: { location: 'https://cdn.example.net/product' } });
      return new Response('<html>ok</html>', { status: 200 });
    },
  });
  expect(await blockedReason(guarded('https://shop.example.com/to-metadata'))).toBe('private_address');
  expect(requested).toEqual(['https://shop.example.com/to-metadata']);
  const followed = await guarded('https://shop.example.com/to-cdn');
  expect(await followed.text()).toBe('<html>ok</html>');
  expect(requested.at(-1)).toBe('https://cdn.example.net/product');
});

test('redirect modes and limits keep fetch semantics', async () => {
  let hops = 0;
  const loop = createGuardedFetch({
    resolve: resolver({ 'shop.example.com': [PUBLIC] }),
    fetch: async () => new Response(null, { status: 302, headers: { location: `/loop-${++hops}` } }),
  });
  expect(await blockedReason(loop('https://shop.example.com/start'))).toBe('too_many_redirects');
  expect(hops).toBe(6); // the first request plus MAX_REDIRECTS followed hops
  await expect(loop('https://shop.example.com/start', { redirect: 'error' })).rejects.toThrow(TypeError);
  expect((await loop('https://shop.example.com/start', { redirect: 'manual' })).status).toBe(302);

  const methods: string[] = [];
  const seeOther = createGuardedFetch({
    resolve: resolver({ 'shop.example.com': [PUBLIC] }),
    fetch: async (input, init) => {
      methods.push(`${init?.method} ${init?.body ?? ''}`.trim());
      return String(input).endsWith('/form')
        ? new Response(null, { status: 303, headers: { location: '/done' } })
        : new Response('done');
    },
  });
  await seeOther('https://shop.example.com/form', { method: 'POST', body: 'size=M' });
  expect(methods).toEqual(['POST size=M', 'GET']);
});

test('response bodies are capped by declared and streamed size', async () => {
  const resolve = resolver({ 'shop.example.com': [PUBLIC] });
  const declared = createGuardedFetch({ resolve, maxBodyBytes: 10,
    fetch: async () => new Response('x'.repeat(11), { headers: { 'content-length': '11' } }) });
  expect(await blockedReason(declared('https://shop.example.com/'))).toBe('response_too_large');
  const streamed = createGuardedFetch({ resolve, maxBodyBytes: 10,
    fetch: async () => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('x'.repeat(6)));
      controller.enqueue(new TextEncoder().encode('x'.repeat(6)));
      controller.close();
    } })) });
  expect(await blockedReason((await streamed('https://shop.example.com/')).text())).toBe('response_too_large');
  const small = createGuardedFetch({ resolve, maxBodyBytes: 10, fetch: async () => Response.json({ ok: 1 }) });
  expect(await (await small('https://shop.example.com/')).json()).toEqual({ ok: 1 });
});

test('Bun returns the raw 3xx response for redirect: manual (runtime contract)', async () => {
  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: (request) =>
    new URL(request.url).pathname === '/go' ? Response.redirect('http://127.0.0.1/elsewhere', 302) : new Response('landed') });
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/go`, { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://127.0.0.1/elsewhere');
  } finally {
    server.stop(true);
  }
});
