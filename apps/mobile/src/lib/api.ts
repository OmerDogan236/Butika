import { Platform } from 'react-native';
import { secureStorage } from './storage';

function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return Platform.select({
    android: 'http://10.0.2.2:3000',
    ios: 'http://localhost:3000',
    default: 'http://localhost:3000',
  });
}

export const API_BASE_URL = resolveBaseUrl();

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  authenticated?: boolean;
}

let inFlightRefresh: Promise<string | null> | null = null;

async function attemptRefresh(): Promise<string | null> {
  const refresh = await secureStorage.get('refreshToken');
  if (!refresh) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    await Promise.all([
      secureStorage.set('accessToken', data.accessToken),
      secureStorage.set('refreshToken', data.refreshToken),
    ]);
    return data.accessToken;
  } catch {
    return null;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  { body, authenticated = true, headers, ...init }: FetchOptions = {},
): Promise<T> {
  const h = new Headers(headers);
  if (body !== undefined && !h.has('Content-Type')) h.set('Content-Type', 'application/json');

  if (authenticated) {
    const access = await secureStorage.get('accessToken');
    if (access) h.set('Authorization', `Bearer ${access}`);
  }

  let res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Tek seferlik retry: 401 alırsak refresh dener.
  if (res.status === 401 && authenticated) {
    inFlightRefresh ??= attemptRefresh().finally(() => {
      inFlightRefresh = null;
    });
    const fresh = await inFlightRefresh;
    if (fresh) {
      h.set('Authorization', `Bearer ${fresh}`);
      res = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: h,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }
  }

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      res.status,
      payload?.error?.code ?? 'unknown',
      payload?.error?.message ?? `request failed (${res.status})`,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown, authenticated = true) =>
    apiFetch<T>(path, { method: 'POST', body, authenticated }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
