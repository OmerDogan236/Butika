// apps/admin/app/(app)/boutiques/move-menu.tsx
'use client';

import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { moveBoutiqueAction } from './actions';

// Satırdaki "Taşı" menüsü: hedef kategori seçilir; "Taşı" bu kategoriden çıkarır,
// "Buna da ekle" burada bırakır. İkisi de hedefin en üstüne koyar.
export function MoveMenu({
  boutiqueId,
  fromCategoryId,
  categories,
}: {
  boutiqueId: string;
  fromCategoryId: string;
  categories: { id: string; name: string }[];
}) {
  const [acik, setAcik] = useState(false);
  const [hedef, setHedef] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function gonder(mode: 'tasi' | 'ekle') {
    setHata(null);
    startTransition(async () => {
      const sonuc = await moveBoutiqueAction({
        boutiqueId,
        fromCategoryId,
        toCategoryId: hedef,
        mode,
      });
      if (sonuc.error) setHata(sonuc.error);
      else {
        setAcik(false);
        setHedef('');
      }
    });
  }

  if (!acik) {
    return (
      <Button variant="ghost" size="sm" className="mr-4" onClick={() => setAcik(true)}>
        Taşı
      </Button>
    );
  }

  return (
    <div className="mr-4 flex items-center gap-2">
      <select
        aria-label="Hedef kategori"
        value={hedef}
        onChange={(e) => setHedef(e.target.value)}
        className="h-9 rounded-md border border-mist bg-cream px-2 text-sm text-ink"
      >
        <option value="">Kategori seç…</option>
        {categories
          .filter((c) => c.id !== fromCategoryId)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </select>
      <Button variant="gold" size="sm" disabled={!hedef || pending} onClick={() => gonder('tasi')}>
        Taşı
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!hedef || pending}
        onClick={() => gonder('ekle')}
      >
        Buna da ekle
      </Button>
      <button
        type="button"
        aria-label="Vazgeç"
        onClick={() => setAcik(false)}
        className="p-1 text-ink/40 hover:text-ink"
      >
        <X className="h-4 w-4" strokeWidth={1.5} />
      </button>
      {hata ? <span className="text-xs text-clay">{hata}</span> : null}
    </div>
  );
}
