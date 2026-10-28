import { PageHeader } from '@/components/PageHeader';
import { ApiClientError, api } from '@/lib/api';
import { getSelectedCountry } from '@/lib/country';
import { notFound } from 'next/navigation';
import { updateCategoryAction } from '../../actions';
import { CategoryForm } from '../../category-form';

interface Category {
  id: string;
  countryCode: string;
  slug: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const country = await getSelectedCountry();
  if (!country) return notFound();

  let category: Category;
  try {
    const all = await api.get<Category[]>(`/admin/categories?country=${country}`);
    const found = all.find((c) => c.id === id);
    if (!found) return notFound();
    category = found;
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) return notFound();
    throw err;
  }

  // bound Server Action — Client Form'a güvenle geçer (RSC boundary uyumlu).
  const boundAction = updateCategoryAction.bind(null, id);

  return (
    <>
      <PageHeader kicker="Kategoriler" title={`${category.name} düzenle`} />
      <CategoryForm
        action={boundAction}
        initial={category}
        countryCode={category.countryCode}
        submitLabel="Kaydet"
      />
    </>
  );
}
