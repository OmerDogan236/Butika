import { PageHeader } from '@/components/PageHeader';
import { getMarkets } from '@/lib/country';
import { CountriesManager } from './countries-manager';

export default async function CountriesPage() {
  const markets = await getMarkets();

  return (
    <>
      <PageHeader
        kicker="Pazarlar"
        title="Ülkeler"
        description="Bayrağa tıklayarak yeni pazar ekle. Sıralamak için kenardaki kulptan sürükle. Üst bardan pazar seçip o pazarın kategori ve butiklerini düzenlersin."
      />
      <CountriesManager markets={markets} />
    </>
  );
}
