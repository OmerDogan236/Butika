import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { baglantiKapatAction } from './actions';
import { DavetFormu } from './davet-formu';
import { IadePolitikasi } from './iade-politikasi';

interface Baglanti {
  id: string;
  butikAdi: string;
  platform: string;
  magazaAdi: string;
  durum: 'aktif' | 'koptu' | 'kapali';
  tahsilat: string;
  urunSayisi: number;
  sonUrunEsitlemeAt: string | null;
  sonHata: string | null;
  iadePolitikasi: string | null;
  buAy: { gonderim: number; satis: number; komisyon: { currency: string; minor: number }[] };
}

const DURUM: Record<Baglanti['durum'], string> = {
  aktif: 'Aktif',
  koptu: 'Koptu',
  kapali: 'Kapalı',
};

function para(minor: number, currency: string): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(minor / 100);
}

export default async function BaglantilarPage() {
  const [baglantilar, butikler] = await Promise.all([
    api.get<Baglanti[]>('/admin/baglantilar'),
    api.get<{ id: string; name: string; countryCode: string }[]>('/admin/baglantilar/butikler'),
  ]);

  return (
    <>
      <PageHeader
        kicker="Butik bağlantıları"
        title="Butik bağlantıları"
        description="ikas ya da Shopify mağazasını Butika'ya bağlayan butikler ve bu ayın rakamları."
      />

      <DavetFormu butikler={butikler} />

      {baglantilar.length === 0 ? (
        <p className="border border-mist py-16 text-center italic text-ink/40">
          Henüz bağlanan butik yok.
        </p>
      ) : (
        <ul className="flex flex-col border border-mist">
          {baglantilar.map((b) => (
            <li
              key={b.id}
              className="flex flex-col gap-4 border-b border-mist/60 p-6 last:border-b-0"
            >
              <header className="flex items-start justify-between gap-6">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-2xl italic leading-tight text-ink">
                    {b.butikAdi}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-ink/40">
                    {b.platform} · {b.magazaAdi} · {DURUM[b.durum]} · tahsilat: {b.tahsilat}
                  </p>
                </div>
                {b.durum !== 'kapali' && (
                  <form
                    action={async () => {
                      'use server';
                      await baglantiKapatAction(b.id);
                    }}
                  >
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="text-clay hover:text-clay"
                    >
                      Bağlantıyı kapat
                    </Button>
                  </form>
                )}
              </header>

              <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
                <div>
                  <dt className="text-xs uppercase tracking-[0.16em] text-ink/40">Ürün</dt>
                  <dd>{b.urunSayisi}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.16em] text-ink/40">Son eşitleme</dt>
                  <dd>
                    {b.sonUrunEsitlemeAt
                      ? formatDistanceToNow(new Date(b.sonUrunEsitlemeAt), {
                          addSuffix: true,
                          locale: tr,
                        })
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.16em] text-ink/40">
                    Bu ay gönderim
                  </dt>
                  <dd>{b.buAy.gonderim}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.16em] text-ink/40">Bu ay satış</dt>
                  <dd>{b.buAy.satis}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.16em] text-ink/40">
                    Bu ay komisyon
                  </dt>
                  <dd>
                    {b.buAy.komisyon.length === 0
                      ? '—'
                      : b.buAy.komisyon.map((k) => para(k.minor, k.currency)).join(' + ')}
                  </dd>
                </div>
              </dl>

              {b.sonHata && <p className="text-sm text-clay">Son hata: {b.sonHata}</p>}

              <IadePolitikasi id={b.id} ilk={b.iadePolitikasi} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
