'use client';

import { SortableList } from '@/components/SortableList';
import { normalizeTr } from '@/lib/normalize';
import { cn } from '@/lib/utils';
import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MoveMenu } from './move-menu';
import { BoutiqueRow } from './row';

interface Membership {
  categoryId: string;
  sortOrder: number;
}

interface Boutique {
  id: string;
  name: string;
  url: string;
  coverImageUrl: string;
  isActive: boolean;
  firsat?: boolean;
  categoryIds: string[];
  memberships: Membership[];
}

interface Category {
  id: string;
  name: string;
  cinsiyet?: 'kadin' | 'erkek';
}

type Taraf = 'kadin' | 'erkek';

export function BoutiquesManager({
  boutiques,
  categories,
}: {
  boutiques: Boutique[];
  categories: Category[];
}) {
  // Vitrin tarafı (uygulamadaki KADIN | ERKEK): sekmeler yalnız o tarafın kategorileri.
  const [taraf, setTaraf] = useState<Taraf>('kadin');
  const taraftakiler = categories.filter((c) => (c.cinsiyet ?? 'kadin') === taraf);
  const [activeCat, setActiveCat] = useState<string>(taraftakiler[0]?.id ?? '');
  function tarafSec(t: Taraf) {
    setTaraf(t);
    setActiveCat(categories.find((c) => (c.cinsiyet ?? 'kadin') === t)?.id ?? '');
  }
  const erkekButikSayisi = useMemo(() => {
    const erkekler = new Set(categories.filter((c) => c.cinsiyet === 'erkek').map((c) => c.id));
    return boutiques.filter((b) => b.categoryIds.some((id) => erkekler.has(id))).length;
  }, [boutiques, categories]);
  const catName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name] as const)),
    [categories],
  );

  // Tüm butiklerde arama: kategori sekmesinden bağımsız; pasif ve kategorisiz
  // butikler de bulunur (onlar hiçbir sekmede görünmüyordu).
  const [ara, setAra] = useState('');
  const aranan = normalizeTr(ara);
  const bulunanlar = useMemo(() => {
    if (!aranan) return [];
    return boutiques
      .filter((b) => normalizeTr(`${b.name} ${b.url}`).includes(aranan))
      .sort(
        (a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, 'tr'),
      );
  }, [boutiques, aranan]);

  const orderIn = (b: Boutique) =>
    b.memberships.find((m) => m.categoryId === activeCat)?.sortOrder ?? 0;

  const inCategory = boutiques
    .filter((b) => b.categoryIds.includes(activeCat))
    .sort((a, b) => orderIn(a) - orderIn(b));

  return (
    <div className="border border-mist">
      <div className="flex items-center gap-3 border-b border-mist px-4 py-3">
        <Search className="h-4 w-4 shrink-0 text-ink/40" strokeWidth={1.5} />
        <input
          type="text"
          inputMode="search"
          value={ara}
          onChange={(e) => setAra(e.target.value)}
          placeholder={`Tüm butiklerde ara (ad ya da site adresi) · ${boutiques.length} butik`}
          aria-label="Tüm butiklerde ara"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink/40 focus:outline-none"
        />
        {ara ? (
          <button
            type="button"
            onClick={() => setAra('')}
            aria-label="Aramayı temizle"
            className="text-ink/40 hover:text-ink"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        ) : null}
      </div>

      {aranan ? (
        <div>
          <p className="border-b border-mist px-4 py-2 text-xs uppercase tracking-[0.18em] text-ink/40">
            {bulunanlar.length} sonuç · tüm kategoriler, pasifler dahil
          </p>
          {bulunanlar.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-ink/40">
              “{ara.trim()}” ile eşleşen butik yok.
            </p>
          ) : (
            <ul className="divide-y divide-mist">
              {bulunanlar.map((b) => (
                <li key={b.id} className="pl-4">
                  <BoutiqueRow
                    boutique={b}
                    categoryNames={
                      b.categoryIds.length > 0
                        ? b.categoryIds.map((id) => catName.get(id) ?? '—')
                        : ['Kategorisiz']
                    }
                    url={b.url}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b border-mist px-4 py-2">
            <span className="text-xs uppercase tracking-[0.18em] text-ink/40">Vitrin</span>
            {(['kadin', 'erkek'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => tarafSec(t)}
                aria-pressed={taraf === t}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  taraf === t
                    ? 'border-ink bg-ink text-cream'
                    : 'border-mist text-ink/60 hover:bg-mist/40',
                )}
              >
                {t === 'kadin' ? 'Kadın' : `Erkek · ${erkekButikSayisi} butik`}
              </button>
            ))}
          </div>
          <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-mist px-2 py-2">
            {taraftakiler.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={c.id === activeCat}
                onClick={() => setActiveCat(c.id)}
                className={cn(
                  'whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors',
                  c.id === activeCat ? 'bg-ink text-cream' : 'text-ink/60 hover:bg-mist/40',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>

          {taraftakiler.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-ink/40">
              Erkek vitrininde henüz kategori yok. Kategoriler sayfasında “Vitrin: Erkek” seçerek
              ekle.
            </p>
          ) : inCategory.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-ink/40">
              Bu kategoride henüz butik yok.
            </p>
          ) : (
            <SortableList
              // Taşıma sonrası sunucudan gelen yeni üyelik listesiyle yerel sıra durumu sıfırlansın.
              // "Buna da ekle" bu sekmenin id/sıra listesini değiştirmeyebilir (başka kategoriye
              // eklenir) ama satırın categoryIds'i değişir; anahtar bunu da içermeli ki
              // BoutiqueRow'daki kategori rozetleri güncel kalsın.
              key={`${activeCat}:${inCategory.map((b) => `${b.id}:${b.categoryIds.join('+')}`).join(',')}`}
              items={inCategory.map((b) => ({
                id: b.id,
                sortOrder: orderIn(b),
                searchText: b.name,
                content: (
                  <BoutiqueRow
                    boutique={b}
                    categoryNames={b.categoryIds.map((id) => catName.get(id) ?? '—')}
                  />
                ),
              }))}
              endpoint="/api/admin/boutiques/reorder"
              extraBody={{ categoryId: activeCat }}
              searchable
              searchPlaceholder="Marka ara…"
              positionControls
              rowExtra={(id) => (
                <MoveMenu boutiqueId={id} fromCategoryId={activeCat} categories={categories} />
              )}
            />
          )}
        </>
      )}
    </div>
  );
}
