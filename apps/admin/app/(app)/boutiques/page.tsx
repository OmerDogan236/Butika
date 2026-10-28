import { NoMarketNotice } from '@/components/NoMarketNotice';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { getMarkets, getSelectedCountry } from '@/lib/country';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { BoutiquesManager } from './boutiques-manager';

interface Membership {
  categoryId: string;
  sortOrder: number;
}

interface Boutique {
  id: string;
  name: string;
  description: string;
  url: string;
  coverImageUrl: string;
  logoUrl: string | null;
  isActive: boolean;
  firsat?: boolean;
  sortOrder: number;
  createdAt: string;
  categoryIds: string[];
  memberships: Membership[];
}

interface Category {
  id: string;
  name: string;
  cinsiyet?: 'kadin' | 'erkek';
}

export default async function BoutiquesPage() {
  const markets = await getMarkets();
  const country = await getSelectedCountry(markets);

  if (!country) {
    return (
      <>
        <PageHeader kicker="Butikler" title="Vitrin" />
        <NoMarketNotice />
      </>
    );
  }

  const current = markets.find((m) => m.code === country);
  const [items, categories] = await Promise.all([
    api.get<Boutique[]>(`/admin/boutiques?country=${country}`),
    api.get<Category[]>(`/admin/categories?country=${country}`),
  ]);

  return (
    <>
      <PageHeader
        kicker="Butikler"
        title="Vitrin"
        description={`${current ? `${current.flag} ${current.name}` : country} · Bir kategori sekmesi seç; sırayı kulptan sürükleyerek, sıra kutusuna numara yazarak ya da En üste / En alta ile düzenle. "Taşı" ile butiği başka kategoriye taşı veya ekle. Mobildeki dizilim birebir aynı.`}
        action={
          <Button asChild variant="gold" size="lg">
            <Link href="/boutiques/new">
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Yeni butik
            </Link>
          </Button>
        }
      />
      {categories.length === 0 ? (
        <div className="flex flex-col items-center gap-4 border border-mist px-8 py-24 text-center">
          <p className="font-display text-2xl italic text-ink/60">Bu pazarda henüz kategori yok.</p>
          <p className="text-sm text-ink/40">
            Önce kategori ekle, sonra butikleri o kategorilere yerleştir.
          </p>
          <Button asChild variant="gold" size="lg">
            <Link href="/categories/new">Kategori ekle</Link>
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 border border-mist px-8 py-24 text-center">
          <p className="font-display text-2xl italic text-ink/60">Bu pazarda henüz butik yok.</p>
          <p className="text-sm text-ink/40">İlk butiği eklemek için sağ üstteki butonu kullan.</p>
        </div>
      ) : (
        <BoutiquesManager boutiques={items} categories={categories} />
      )}
    </>
  );
}
