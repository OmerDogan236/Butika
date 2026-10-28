'use client';

import { logoutAction } from '@/app/login/actions';
import { navItems } from '@/components/nav-items';
import { cn } from '@/lib/utils';
import { LogOut, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

// Mobil navigasyon — sidebar mobilde gizli (hidden md:flex) olduğundan,
// üst barda hamburger menüsü. Geniş ekranda gizli (md:hidden).
export function MobileNav({ adminEmail }: { adminEmail?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Sayfa değişince paneli kapat.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname değişiminde kapanması amaç
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Menü"
        className="inline-flex items-center gap-2 rounded-md border border-mist px-3 py-1.5 text-ink hover:bg-mist/30"
      >
        <Menu className="h-5 w-5" strokeWidth={1.5} />
        <span className="font-display text-lg italic leading-none">Admin</span>
      </button>

      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop tıklamayla kapanır
        <div className="fixed inset-0 z-50 bg-ink/40" onClick={() => setOpen(false)}>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: panel tıklaması kapanmayı durdurur */}
          <div
            className="flex h-full w-72 max-w-[80%] flex-col bg-cream shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-8 pb-6">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-ink/50">Butika</p>
                <p className="mt-2 font-display text-2xl italic leading-none text-ink">Admin</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Kapat"
                className="text-ink/40 hover:text-ink"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-4">
              {navItems.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'group flex items-center gap-3 rounded-md px-4 py-3 text-sm transition-colors',
                      active
                        ? 'bg-mist/60 text-ink'
                        : 'text-ink/60 hover:bg-mist/30 hover:text-ink',
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.5} />
                    <span className="tracking-wide">{label}</span>
                    {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold" />}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-mist px-6 py-5">
              {adminEmail && (
                <p className="mb-3 truncate text-xs text-ink/50" title={adminEmail}>
                  {adminEmail}
                </p>
              )}
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-ink/60 hover:text-ink"
                >
                  <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Çıkış
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
