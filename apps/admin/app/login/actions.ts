'use server';

import { ADMIN_COOKIE } from '@/lib/api';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

const loginSchema = z.object({
  email: z.string().email('Geçerli bir e-posta girin'),
  password: z.string().min(1, 'Şifre gerekli'),
});

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Geçersiz form' };
  }

  const res = await fetch(`${API_URL}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
    cache: 'no-store',
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { error: err?.error?.message ?? 'Giriş başarısız' };
  }

  const data = (await res.json()) as { token: string; expiresAt: string };
  const expiresMs = new Date(data.expiresAt).getTime() - Date.now();
  const maxAge = Math.max(60, Math.floor(expiresMs / 1000));

  const store = await cookies();
  store.set(ADMIN_COOKIE, data.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });

  const next = formData.get('next')?.toString();
  // next.js 16 typedRoutes ile dinamik string redirect'i için cast — gelen next
  // parametresi /<path> formunda doğrulanmış, statik literal değil.
  const target = next?.startsWith('/') ? next : '/dashboard';
  redirect(target as never);
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  redirect('/login');
}
