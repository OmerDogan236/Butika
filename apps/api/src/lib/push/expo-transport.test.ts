import { afterEach, expect, test } from 'bun:test';
import { readExpoReceipt, sendExpoMessage } from './expo-transport';
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const respond = (response: () => Response) => { globalThis.fetch = (async () => response()) as unknown as typeof fetch; };
test.each([429, 500, 503])('HTTP %d can retry', async status => {
  respond(() => new Response('', { status }));
  expect(await sendExpoMessage('test', {})).toMatchObject({ status: 'error', retryable: true });
});
test.each([400, 401, 403])('HTTP %d is not retried indefinitely', async status => {
  respond(() => new Response('', { status }));
  expect(await sendExpoMessage('test', {})).toMatchObject({ status: 'error', retryable: false });
});
test('malformed/partial tickets are never marked accepted', async () => {
  for (const data of [[], [{ status: 'ok' }], [{ status: 'ok', id: 'one' }, { status: 'ok', id: 'two' }]]) {
    respond(() => Response.json({ data }));
    expect((await sendExpoMessage('test', {})).status).toBe('error');
  }
});
test('tickets, delayed receipts and invalid devices remain distinct', async () => {
  respond(() => Response.json({ data: [{ status: 'ok', id: 'ticket' }] }));
  expect(await sendExpoMessage('test', {})).toEqual({ status: 'ok', id: 'ticket' });
  respond(() => Response.json({ data: {} }));
  expect(await readExpoReceipt('ticket')).toEqual({ status: 'missing' });
  respond(() => Response.json({ data: { ticket: { status: 'error', details: { error: 'DeviceNotRegistered' } } } }));
  expect(await readExpoReceipt('ticket')).toEqual({ status: 'error', code: 'DeviceNotRegistered', retryable: false });
});
