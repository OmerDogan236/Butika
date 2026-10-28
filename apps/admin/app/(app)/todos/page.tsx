import { NoMarketNotice } from '@/components/NoMarketNotice';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { getMarkets, getSelectedCountry } from '@/lib/country';
import Link from 'next/link';

interface TodoItem {
  tur: 'fiyat_segmenti';
  boutiqueId: string;
  butikAdi: string;
  kategoriler: string[];
  durum: 'hic_hesaplanmadi' | 'yetersiz_veri' | 'fiyat_supheli';
  temsiliFiyatTl: string | null;
}

// Sayfa İŞ TÜRÜNE göre gruplu kurulur. Şimdilik tek tür dolu; tarz etiketleme
// devreye girdiğinde buraya 'tarz' başlıklı ikinci grup eklenecek ve sayfa
// yeniden yazılmayacak.
const GRUP_BASLIKLARI: Record<TodoItem['tur'], string> = {
  fiyat_segmenti: 'Fiyat segmenti',
};

function nedenMetni(item: TodoItem): string {
  if (item.durum === 'fiyat_supheli') {
    const f = item.temsiliFiyatTl
      ? `${Math.round(Number(item.temsiliFiyatTl)).toLocaleString('tr-TR')} ₺`
      : '';
    return `Fiyat şüpheli — bulunan ortanca ${f}`;
  }
  if (item.durum === 'yetersiz_veri') return 'Veri alınamadı — yeterli ürün fiyatı yok';
  return 'Veri alınamadı — siteye erişilemedi';
}

export default async function TodosPage() {
  const markets = await getMarkets();
  const country = await getSelectedCountry(markets);

  if (!country) {
    return (
      <>
        <PageHeader kicker="Butika" title="Yapılacaklar" />
        <NoMarketNotice />
      </>
    );
  }

  const items = await api.get<TodoItem[]>(`/admin/todos?country=${country}`);

  const gruplar = new Map<TodoItem['tur'], TodoItem[]>();
  for (const item of items) {
    const liste = gruplar.get(item.tur) ?? [];
    liste.push(item);
    gruplar.set(item.tur, liste);
  }

  return (
    <>
      <PageHeader
        kicker="Butika"
        title="Yapılacaklar"
        description="Otomatik olarak karara bağlanamayan butikler. Siteyi inceleyip elle seçim yap; hallettiğin butik listeden düşer."
      />

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 border border-mist px-8 py-24 text-center">
          <p className="font-display text-2xl italic text-ink/60">Bekleyen iş yok.</p>
          <p className="text-sm text-ink/40">Bu pazardaki bütün butikler karara bağlanmış.</p>
        </div>
      ) : (
        [...gruplar.entries()].map(([tur, liste]) => (
          <section key={tur} className="mb-12">
            <h2 className="mb-4 text-xs uppercase tracking-[0.18em] text-ink/70">
              {GRUP_BASLIKLARI[tur]} · {liste.length} butik
            </h2>
            <div className="overflow-x-auto border border-mist">
              <table className="w-full text-sm">
                <thead className="border-b border-mist text-left text-xs uppercase tracking-[0.14em] text-ink/50">
                  <tr>
                    <th className="p-3 font-medium">Butik</th>
                    <th className="p-3 font-medium">Kategori</th>
                    <th className="p-3 font-medium">Neden</th>
                    <th className="p-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {liste.map((item) => (
                    <tr key={item.boutiqueId} className="border-b border-mist/60 last:border-0">
                      <td className="p-3 text-ink">{item.butikAdi}</td>
                      <td className="p-3 text-ink/60">{item.kategoriler.join(', ') || '—'}</td>
                      <td className="p-3 text-ink/60">{nedenMetni(item)}</td>
                      <td className="p-3 text-right">
                        <Link
                          href={`/boutiques/${item.boutiqueId}/edit`}
                          className="text-gold underline underline-offset-2"
                        >
                          Düzenle
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </>
  );
}
