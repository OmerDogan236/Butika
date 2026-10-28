import { PageHeader } from '@/components/PageHeader';
import { ApiClientError, api } from '@/lib/api';
import { notFound } from 'next/navigation';
import { updateBoutiqueAction } from '../../actions';
import { BoutiqueForm } from '../../boutique-form';

interface Boutique {
  id: string;
  countryCode: string;
  categoryIds: string[];
  name: string;
  description: string;
  url: string;
  coverImageUrl: string;
  logoUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  fiyatSegmenti: string | null;
  fiyatGuven: string | null;
  temsiliFiyatTl: string | null;
  urunSayisiKategori: number | null;
  fiyatHesapTarihi: string | null;
  tarz1: string | null;
  tarz2: string | null;
  tarzGuven: string | null;
  tarzDurumu: string | null;
  tarzGerekce: string | null;
  tarzHesapTarihi: string | null;
  editorSecimi: boolean;
  editorSirasi: number | null;
  editorNotu: string | null;
  firsat: boolean;
  firsatSirasi: number | null;
  firsatNotu: string | null;
}

interface Category {
  id: string;
  slug: string;
  name: string;
}

export default async function EditBoutiquePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let boutique: Boutique;
  try {
    boutique = await api.get<Boutique>(`/admin/boutiques/${id}`);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) return notFound();
    throw err;
  }
  // Butiğin kendi pazarındaki kategoriler.
  const categories = await api.get<Category[]>(`/admin/categories?country=${boutique.countryCode}`);

  // .bind() Server Action'ı koruyor — closure wrapper Client'a fonksiyon
  // olarak geçemiyor (RSC boundary), ama bound server action geçebilir.
  const boundAction = updateBoutiqueAction.bind(null, id);

  return (
    <>
      <PageHeader kicker="Butikler" title={`${boutique.name} düzenle`} />
      <BoutiqueForm
        action={boundAction}
        initial={boutique}
        categories={categories}
        countryCode={boutique.countryCode}
        submitLabel="Kaydet"
      />
    </>
  );
}
