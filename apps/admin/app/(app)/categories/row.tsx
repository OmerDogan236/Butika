'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { deleteCategoryAction } from './actions';

interface Category {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  cinsiyet?: 'kadin' | 'erkek';
}

export function CategoryRow({ category }: { category: Category }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteCategoryAction(category.id);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex items-center gap-4 py-4 pr-6">
      <div className="min-w-0 flex-1">
        <p className="font-display text-xl italic text-ink">{category.name}</p>
        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink/40">
          /{category.slug}
          <span
            className={
              category.isActive
                ? 'ml-3 inline-flex items-center gap-1.5 text-sage'
                : 'ml-3 inline-flex items-center gap-1.5 text-ink/30'
            }
          >
            <span
              className={
                category.isActive
                  ? 'h-1.5 w-1.5 rounded-full bg-sage'
                  : 'h-1.5 w-1.5 rounded-full bg-ink/30'
              }
            />
            {category.isActive ? 'Aktif' : 'Gizli'}
          </span>
          {category.cinsiyet === 'erkek' ? (
            <span className="ml-3 rounded-full bg-ink px-2 py-0.5 text-[10px] text-cream">
              Erkek
            </span>
          ) : null}
        </p>
        {error && <p className="mt-1.5 text-xs text-clay">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/categories/${category.id}/edit`}>Düzenle</Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="text-clay hover:text-clay"
        >
          {pending ? 'Siliniyor…' : 'Sil'}
        </Button>
      </div>
    </div>
  );
}
