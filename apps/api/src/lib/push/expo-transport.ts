export type ExpoResult = { status: 'ok'; id?: string } | { status: 'missing' } |
  { status: 'error'; code: string; retryable: boolean };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function parseResult(value: unknown, ticket: boolean): ExpoResult {
  if (!record(value)) return { status: 'error', code: 'MalformedResponse', retryable: true };
  if (value.status !== 'ok' && value.status !== 'error') return { status: 'error', code: 'MalformedResponse', retryable: true };
  if (value.status === 'ok' && ticket && (typeof value.id !== 'string' || !value.id)) return { status: 'error', code: 'MalformedResponse', retryable: true };
  if (value.status === 'ok' && (!ticket || (typeof value.id === 'string' && value.id.length > 0))) {
    return { status: 'ok', ...(ticket ? { id: value.id as string } : {}) };
  }
  const code = record(value.details) && typeof value.details.error === 'string' ? value.details.error : 'UnknownExpoError';
  return { status: 'error', code, retryable: !['DeviceNotRegistered', 'MessageTooBig', 'InvalidCredentials', 'MismatchSenderId'].includes(code) };
}

async function request(path: string, body: unknown): Promise<{ data?: unknown; error?: ExpoResult }> {
  try {
    const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json',
        ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
      }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { error: { status: 'error', code: `HTTP_${response.status}`,
      retryable: response.status === 429 || response.status >= 500 } };
    const payload: unknown = await response.json();
    return record(payload) && 'data' in payload ? { data: payload.data }
      : { error: { status: 'error', code: 'MalformedResponse', retryable: true } };
  } catch { return { error: { status: 'error', code: 'NetworkOrInvalidJSON', retryable: true } }; }
}

export async function sendExpoMessage(token: string, message: Record<string, unknown>): Promise<ExpoResult> {
  const result = await request('send', [{ ...message, to: token }]);
  if (result.error) return result.error;
  if (!Array.isArray(result.data) || result.data.length !== 1) return { status: 'error', code: 'TicketCountMismatch', retryable: true };
  return parseResult(result.data[0], true);
}

export async function readExpoReceipt(id: string): Promise<ExpoResult> {
  const result = await request('getReceipts', { ids: [id] });
  if (result.error) return result.error;
  if (!record(result.data)) return { status: 'error', code: 'MalformedReceiptResponse', retryable: true };
  return Object.hasOwn(result.data, id) ? parseResult(result.data[id], false) : { status: 'missing' };
}

/** Birden çok makbuzu tek istekte okur (Expo sınırı: istek başına 1000 id). Okunamayan id yanıtta yer almaz. */
export async function readExpoReceipts(ids: string[]): Promise<Map<string, ExpoResult>> {
  const out = new Map<string, ExpoResult>();
  for (let i = 0; i < ids.length; i += 1000) {
    const parca = ids.slice(i, i + 1000);
    const result = await request('getReceipts', { ids: parca });
    if (result.error || !record(result.data)) continue;
    for (const id of parca) {
      if (Object.hasOwn(result.data, id)) out.set(id, parseResult(result.data[id], false));
    }
  }
  return out;
}
