import { NoMarketNotice } from '@/components/NoMarketNotice';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { getMarkets } from '@/lib/country';
import type { AdminVitrinAyari } from '@butika/types';
import { VitrinAyarlariForm } from './vitrin-ayarlari-form';

export default async function VitrinAyarlariPage() {
  const markets = await getMarkets();
  const aktif = markets.filter((m) => m.isActive);

  if (aktif.length === 0) {
    return (
      <>
        <PageHeader kicker="Uygulama" title="Vitrin ayarları" />
        <NoMarketNotice />
      </>
    );
  }

  // Her pazarın ayarı (kaydı olmayanın alanları boş gelir).
  const ayarlar = await api.get<AdminVitrinAyari[]>('/admin/vitrin-ayarlari');
  const byCode = new Map(ayarlar.map((a) => [a.countryCode, a]));

  return (
    <>
      <PageHeader
        kicker="Uygulama"
        title="Vitrin ayarları"
        description="Her pazar için vitrindeki seçki şeridinin başlığı ve mağazadaki son uygulama sürümü."
      />
      <div className="flex flex-col gap-12">
        {aktif.map((m) => (
          <VitrinAyarlariForm
            key={m.code}
            pazarAdi={`${m.flag} ${m.name}`}
            ayar={
              byCode.get(m.code) ?? {
                countryCode: m.code,
                seckiBasligi: null,
                guncelSurumIos: null,
                guncelSurumAndroid: null,
                updatedAt: null,
              }
            }
          />
        ))}
      </div>
    </>
  );
}
