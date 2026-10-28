import { NoMarketNotice } from '@/components/NoMarketNotice';
import { PageHeader } from '@/components/PageHeader';
import { SortableList } from '@/components/SortableList';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { getMarkets, getSelectedCountry } from '@/lib/country';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { CategoryRow } from './row';

interface Category {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export default async function CategoriesPage() {
  const markets = await getMarkets();
  const country = await getSelectedCountry(markets);

  if (!country) {
    return (
      <>
        <PageHeader kicker="Kategoriler" title="Vitrin yapısı" />
        <NoMarketNotice />
      </>
    );
  }

  const current = markets.find((m) => m.code === country);
  const items = await api.get<Category[]>(`/admin/categories?country=${country}`);

  return (
    <>
      <PageHeader
        kicker="Kategoriler"
        title="Vitrin yapısı"
        description={`${current ? `${current.flag} ${current.name}` : country} · Sıralamak için kenardaki kulptan sürükle. Mobil ana ekrandaki sticky tab şeridi bu sırayla görünür.`}
        action={
          <Button asChild variant="gold" size="lg">
            <Link href="/categories/new">
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Yeni kategori
            </Link>
          </Button>
        }
      />
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 border border-mist px-8 py-24 text-center">
          <p className="font-display text-2xl italic text-ink/60">Bu pazarda henüz kategori yok.</p>
        </div>
      ) : (
        <div className="border border-mist">
          <SortableList
            items={items.map((c) => ({
              id: c.id,
              sortOrder: c.sortOrder,
              content: <CategoryRow category={c} />,
            }))}
            endpoint="/api/admin/categories/reorder"
          />
        </div>
      )}
    </>
  );
}
