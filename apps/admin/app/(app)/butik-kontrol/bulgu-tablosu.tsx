import Link from 'next/link';
import { bulguYoksayAction } from './actions';

export interface Bulgu {
  id: string;
  boutiqueId: string;
  butikAdi: string;
  ulke: string;
  tur: string;
  onem: string;
  yeni: boolean;
  kanit: string | null;
  oncekiDeger: string | null;
  simdikiDeger: string | null;
  yoksayildi: boolean;
}

export interface Tur {
  id: string;
  baslangic: string;
  bitis: string | null;
  durum: string;
  kontrolEdilen: number;
  sorunlu: number;
  ozet: string | null;
}

export const TUR_ETIKETI: Record<string, string> = {
  acilmiyor: 'Açılmıyor',
  park_satilik: 'Park / satılık alan adı',
  magaza_kapali: 'Mağaza kapalı',
  baska_alan_adi: 'Başka alan adı',
  para_birimi: 'Para birimi',
  marka_uyusmuyor: 'Marka adı farklı',
  moda_disi: 'Moda dışı olabilir',
  elle_bak: 'Elle bakılmalı',
};

const BILGI = { etiket: 'Bilgi', sinif: 'border border-mist text-ink/60' };
const ONEM: Record<string, { etiket: string; sinif: string }> = {
  yuksek: { etiket: 'Yüksek', sinif: 'bg-clay text-cream' },
  orta: { etiket: 'Orta', sinif: 'bg-gold text-ink' },
  dusuk: { etiket: 'Düşük', sinif: 'bg-mist text-ink' },
};

export function tarihYaz(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function DurumRozeti({ durum }: { durum: string }) {
  const suruyor = durum === 'suruyor';
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] uppercase tracking-[0.15em] ${
        suruyor ? 'bg-gold text-ink' : 'border border-mist text-ink/60'
      }`}
    >
      {suruyor ? 'Sürüyor' : durum === 'tamam' ? 'Tamamlandı' : durum === 'hata' ? 'Hata' : durum}
    </span>
  );
}

export function BulguTablosu({ bulgular }: { bulgular: Bulgu[] }) {
  if (bulgular.length === 0) {
    return <p className="text-sm italic text-ink/40">Bu turda sorunlu butik bulunmadı.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] text-left text-sm">
        <thead>
          <tr className="border-b border-mist text-xs uppercase tracking-[0.2em] text-ink/50">
            <th className="py-3 pr-4 font-normal">Önem</th>
            <th className="py-3 pr-4 font-normal">Butik</th>
            <th className="py-3 pr-4 font-normal">Sorun</th>
            <th className="py-3 pr-4 font-normal">Kanıt</th>
            <th className="py-3 pr-4 font-normal">Önceki → Şimdiki</th>
            <th className="py-3 font-normal" />
          </tr>
        </thead>
        <tbody>
          {bulgular.map((b) => {
            const onem = ONEM[b.onem] ?? BILGI;
            return (
              <tr
                key={b.id}
                className={`border-b border-mist/60 align-top ${b.yoksayildi ? 'opacity-40' : ''}`}
              >
                <td className="py-3 pr-4">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] uppercase tracking-[0.15em] ${onem.sinif}`}
                  >
                    {onem.etiket}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <span className="text-ink">{b.butikAdi}</span>
                  <span className="ml-2 text-xs uppercase text-ink/50">{b.ulke}</span>
                  {b.yeni ? (
                    <span className="ml-2 rounded-full bg-ink px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-cream">
                      Yeni
                    </span>
                  ) : (
                    <span className="ml-2 rounded-full border border-mist px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-ink/60">
                      Sürüyor
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4 text-ink">{TUR_ETIKETI[b.tur] ?? b.tur}</td>
                <td className="max-w-xs py-3 pr-4 text-ink/70">{b.kanit ?? '—'}</td>
                <td className="py-3 pr-4 text-ink/70">
                  {b.oncekiDeger || b.simdikiDeger ? (
                    <>
                      {b.oncekiDeger || '—'} → {b.simdikiDeger || '—'}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-3 text-right">
                  <div className="flex items-center justify-end gap-4 whitespace-nowrap">
                    <Link
                      href={`/boutiques/${b.boutiqueId}/edit`}
                      className="text-xs uppercase tracking-[0.15em] text-ink underline underline-offset-4"
                    >
                      Düzenle
                    </Link>
                    {b.yoksayildi ? (
                      <span className="text-xs italic text-ink/50">Yoksayıldı</span>
                    ) : (
                      <form action={bulguYoksayAction.bind(null, b.id)}>
                        <button
                          type="submit"
                          className="text-xs uppercase tracking-[0.15em] text-ink/60 hover:text-ink"
                        >
                          Gördüm, yoksay
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
