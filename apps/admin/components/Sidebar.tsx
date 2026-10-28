'use client';

import { logoutAction } from '@/app/login/actions';
import { navItems } from '@/components/nav-items';
import { cn } from '@/lib/utils';
import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Sidebar({ adminEmail }: { adminEmail?: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-mist md:flex md:flex-col">
      <div className="px-8 pt-10 pb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-ink/50">Butika</p>
        <p className="mt-3 font-display text-3xl italic leading-none text-ink">Admin</p>
        <div className="mt-5 h-px w-12 bg-gold" />
      </div>
      <nav className="flex-1 px-4">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'group flex items-center gap-3 rounded-md px-4 py-2.5 text-sm transition-colors',
                active ? 'bg-mist/60 text-ink' : 'text-ink/60 hover:bg-mist/30 hover:text-ink',
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
    </aside>
  );
}
