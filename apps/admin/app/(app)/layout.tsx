import { CountrySwitcher } from '@/components/CountrySwitcher';
import { MobileNav } from '@/components/MobileNav';
import { Sidebar } from '@/components/Sidebar';
import { ApiClientError, api } from '@/lib/api';
import { getMarkets, getSelectedCountry } from '@/lib/country';
import type { ReactNode } from 'react';

interface MeResponse {
  admin: { email: string; displayName: string };
}

async function getAdminEmail(): Promise<string | undefined> {
  // İleride GET /admin/me eklendiğinde buradan oku.
  // Şimdilik dashboard sorgusu ile session geçerliliğini de doğruluyoruz.
  try {
    await api.get('/admin/dashboard');
    return 'admin@butika.local';
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 401) return undefined;
    return undefined;
  }
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [adminEmail, markets] = await Promise.all([getAdminEmail(), getMarkets()]);
  const activeMarkets = markets.filter((m) => m.isActive);
  const selected = await getSelectedCountry(markets);
  return (
    <div className="flex min-h-screen">
      <Sidebar adminEmail={adminEmail} />
      <div className="flex-1 overflow-x-auto">
        <div className="flex items-center justify-between gap-3 border-b border-mist px-6 py-3 md:px-12">
          <MobileNav adminEmail={adminEmail} />
          {activeMarkets.length > 0 && selected ? (
            <CountrySwitcher
              markets={activeMarkets.map((m) => ({ code: m.code, name: m.name, flag: m.flag }))}
              selected={selected}
            />
          ) : (
            <span />
          )}
        </div>
        <div className="mx-auto max-w-6xl px-6 py-12 md:px-12 md:py-16">{children}</div>
      </div>
    </div>
  );
}
