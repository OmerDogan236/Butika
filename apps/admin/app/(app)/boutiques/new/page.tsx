import { NoMarketNotice } from '@/components/NoMarketNotice';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { getSelectedCountry } from '@/lib/country';
import Link from 'next/link';
import { createBoutiqueAction } from '../actions';
import { BoutiqueForm } from '../boutique-form';

interface Category {
  id: string;
  slug: string;
  name: string;
}

interface Suggestion {
  id: string;
  name: string;
  url: string;
  note: string | null;
  countryCode: string | null;
}

export default async function NewBoutiquePage({
  searchParams,
}: {
  searchParams: Promise<{ suggestionId?: string }>;
}) {
  const { suggestionId } = await searchParams;

  let initial: { name?: string; url?: string } | undefined;
  let title = 'Yeni butik';
  let suggestionCountry: string | null = null;
  if (suggestionId) {
    const s = await api.get<Suggestion>(`/admin/suggestions/${suggestionId}`);
    initial = { name: s.name, url: s.url };
    title = 'Öneriden butik oluştur';
    suggestionCountry = s.countryCode;
  }

  // Öneriden geliyorsa önerinin pazarı, değilse global seçili pazar.
  const country = suggestionCountry ?? (await getSelectedCountry());
  if (!country) {
    return (
      <>
        <PageHeader kicker="Butikler" title={title} />
        <NoMarketNotice />
      </>
    );
  }

  const categories = await api.get<Category[]>(`/admin/categories?country=${country}`);

  return (
    <>
      <PageHeader kicker="Butikler" title={title} />
      {categories.length === 0 ? (
        <div className="flex flex-col items-center gap-4 border border-mist px-8 py-24 text-center">
          <p className="font-display text-2xl italic text-ink/60">Bu pazarda henüz kategori yok.</p>
          <p className="text-sm text-ink/40">Butik bir kategoriye bağlanmalı; önce kategori ekle.</p>
          <Button asChild variant="gold" size="lg">
            <Link href="/categories/new">Kategori ekle</Link>
          </Button>
        </div>
      ) : (
        <BoutiqueForm
          action={createBoutiqueAction}
          initial={initial}
          categories={categories}
          countryCode={country}
          submitLabel="Oluştur"
          suggestionId={suggestionId}
        />
      )}
    </>
  );
}
