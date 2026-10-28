'use client';

import { setCountryAction } from '@/lib/country-actions';
import { cn } from '@/lib/utils';
import { Check, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

interface Market {
  code: string;
  name: string;
  flag: string;
}

// Global pazar seçici (admin üst bar). Seçimi cookie'ye yazar + sayfayı yeniler;
// böylece kategori/butik ekranları o pazara göre scope'lanır.
export function CountrySwitcher({ markets, selected }: { markets: Market[]; selected: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const current = markets.find((m) => m.code === selected) ?? markets[0];

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!current) return null;

  function choose(code: string) {
    setOpen(false);
    if (code === selected) return;
    startTransition(async () => {
      await setCountryAction(code);
      router.refresh();
    });
  }

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-[0.2em] text-ink/40">Pazar</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md border border-mist px-3 py-1.5 text-sm text-ink transition-colors hover:bg-mist/30 disabled:opacity-50"
      >
        <span className="text-base leading-none">{current.flag}</span>
        <span className="tracking-wide">{current.name}</span>
        <ChevronDown className="h-3.5 w-3.5 text-ink/40" strokeWidth={1.5} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-[13rem] overflow-hidden rounded-md border border-mist bg-cream shadow-lg">
          {markets.map((m) => (
            <button
              key={m.code}
              type="button"
              onClick={() => choose(m.code)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-mist/40',
                m.code === selected ? 'text-ink' : 'text-ink/70',
              )}
            >
              <span className="text-base leading-none">{m.flag}</span>
              <span className="flex-1 tracking-wide">{m.name}</span>
              {m.code === selected && <Check className="h-3.5 w-3.5 text-gold" strokeWidth={2} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
