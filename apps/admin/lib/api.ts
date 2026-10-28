import { cookies } from 'next/headers';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
export const ADMIN_COOKIE = 'butika_admin_session';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  authenticated?: boolean;
}

export async function apiFetch<T = unknown>(
  path: string,
  { body, authenticated = true, headers: extraHeaders, ...init }: ApiFetchOptions = {},
): Promise<T> {
  const headers = new Headers(extraHeaders);
  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (authenticated) {
    const session = (await cookies()).get(ADMIN_COOKIE)?.value;
    if (session) headers.set('Authorization', `Bearer ${session}`);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  if (!res.ok) {
    const errPayload = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiClientError(
      res.status,
      errPayload?.error?.code ?? 'unknown',
      errPayload?.error?.message ?? `request failed (${res.status})`,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
