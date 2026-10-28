import { NoMarketNotice } from '@/components/NoMarketNotice';
import { PageHeader } from '@/components/PageHeader';
import { getSelectedCountry } from '@/lib/country';
import { createCategoryAction } from '../actions';
import { CategoryForm } from '../category-form';

export default async function NewCategoryPage() {
  const country = await getSelectedCountry();
  return (
    <>
      <PageHeader kicker="Kategoriler" title="Yeni kategori" />
      {country ? (
        <CategoryForm action={createCategoryAction} countryCode={country} submitLabel="Oluştur" />
      ) : (
        <NoMarketNotice />
      )}
    </>
  );
}
