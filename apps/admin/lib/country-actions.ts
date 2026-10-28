'use server';

import { cookies } from 'next/headers';
import { COUNTRY_COOKIE } from './country';

// Global pazar seçicisi bunu çağırır; ardından client router.refresh() yapar.
export async function setCountryAction(code: string): Promise<void> {
  (await cookies()).set(COUNTRY_COOKIE, code.toUpperCase(), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });
}
