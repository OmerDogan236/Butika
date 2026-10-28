'use client';

import { SortableList } from '@/components/SortableList';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AdminCountry } from '@butika/types';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteCountryAction, toggleCountryAction } from './actions';
import { AddCountryDialog } from './add-country-dialog';

export function CountriesManager({ markets }: { markets: AdminCountry[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <>
      <div className="mb-6 flex justify-end">
        <Button variant="gold" size="lg" type="button" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          Ülke ekle
        </Button>
      </div>

      {markets.length === 0 ? (
        <div className="flex flex-col items-center gap-4 border border-mist px-8 py-24 text-center">
          <p className="font-display text-2xl italic text-ink/60">Henüz pazar yok.</p>
          <p className="text-sm text-ink/40">“Ülke ekle” ile ilk pazarını oluştur.</p>
        </div>
      ) : (
        <div className="border border-mist">
          <SortableList
            items={markets.map((m) => ({
              id: m.code,
              sortOrder: m.sortOrder,
              content: <CountryRow market={m} />,
            }))}
            endpoint="/api/admin/countries/reorder"
          />
        </div>
      )}

      {adding && (
        <AddCountryDialog existing={markets.map((m) => m.code)} onClose={() => setAdding(false)} />
      )}
    </>
  );
}

function CountryRow({ market }: { market: AdminCountry }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const res = await toggleCountryAction(market.code, !market.isActive);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await deleteCountryAction(market.code);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-4 py-4 pr-6">
      <span className="text-2xl leading-none">{market.flag}</span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-xl italic text-ink">{market.name}</p>
        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-ink/40">
          {market.code} · {market.defaultLanguage.toUpperCase()} · {market.boutiqueCount} butik ·{' '}
          {market.categoryCount} kategori
          <span
            className={cn(
              'ml-3 inline-flex items-center gap-1.5',
              market.isActive ? 'text-sage' : 'text-ink/30',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                market.isActive ? 'bg-sage' : 'bg-ink/30',
              )}
            />
            {market.isActive ? 'Aktif' : 'Pasif'}
          </span>
        </p>
        {error && <p className="mt-1.5 text-xs text-clay">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="sm" type="button" onClick={toggle} disabled={pending}>
          {market.isActive ? 'Pasifleştir' : 'Aktifleştir'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={remove}
          disabled={pending}
          className="text-clay hover:text-clay"
        >
          Sil
        </Button>
      </div>
    </div>
  );
}
