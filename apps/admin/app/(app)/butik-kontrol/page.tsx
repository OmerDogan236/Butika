import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import Link from 'next/link';
import { turuCalistirAction } from './actions';
import { AutoYenile } from './auto-yenile';
import { type Bulgu, BulguTablosu, DurumRozeti, type Tur, tarihYaz } from './bulgu-tablosu';

// Butik değişim dedektörü: haftalık ve elle çalıştırılan site kontrol turları.
export default async function ButikKontrolPage() {
  const turlar = await api.get<Tur[]>('/admin/butik-kontrol/turlar');
  const son = turlar[0];
  const suruyor = turlar.some((t) => t.durum === 'suruyor');
  const detay = son
    ? await api.get<{ tur: Tur; bulgular: Bulgu[] }>(`/admin/butik-kontrol/turlar/${son.id}`)
    : null;

  return (
    <>
      <AutoYenile aktif={suruyor} />
      <PageHeader
        kicker="Butikler"
        title="Butik kontrolü"
        description="Butiklerin siteleri açılıyor mu, el değiştirmiş mi, hâlâ moda mı satıyor; haftalık kontrol ve elle tur."
        action={
          <form action={turuCalistirAction} className="flex items-center gap-3">
            {suruyor ? <span className="text-sm italic text-ink/60">Tur sürüyor…</span> : null}
            <button
              type="submit"
              className={
                suruyor
                  ? 'rounded-md border border-ink px-5 py-2.5 text-xs uppercase tracking-[0.2em] text-ink'
                  : 'rounded-md bg-ink px-5 py-2.5 text-xs uppercase tracking-[0.2em] text-cream'
              }
            >
              {suruyor ? 'Devam ettir' : 'Şimdi çalıştır'}
            </button>
          </form>
        }
      />

      {!son || !detay ? (
        <p className="text-sm italic text-ink/50">
          Henüz kontrol yapılmadı. İlk turu başlatmak için Şimdi çalıştır.
        </p>
      ) : (
        <>
          <section className="mb-12 border border-mist p-6">
            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-ink/50">
              <span>Son tur · {tarihYaz(son.baslangic)}</span>
              <DurumRozeti durum={son.durum} />
              <span>
                {son.kontrolEdilen} butik kontrol edildi · {son.sorunlu} sorunlu
              </span>
            </div>
            <p className="mt-4 font-display text-2xl italic text-ink">
              {son.ozet ?? (son.durum === 'suruyor' ? 'Tur sürüyor…' : 'Özet yok.')}
            </p>
          </section>

          <section className="mb-12">
            <h2 className="mb-6 border-b border-mist pb-3 font-display text-2xl italic text-ink">
              Bulgular
            </h2>
            <BulguTablosu bulgular={detay.bulgular} />
          </section>

          <section>
            <h2 className="mb-6 border-b border-mist pb-3 font-display text-2xl italic text-ink">
              Geçmiş turlar
            </h2>
            <ul className="flex flex-col">
              {turlar.map((t) => (
                <li key={t.id} className="border-b border-mist/60">
                  <Link
                    href={`/butik-kontrol/${t.id}`}
                    className="flex flex-wrap items-center gap-4 py-3 text-sm hover:bg-mist/20"
                  >
                    <span className="text-ink">{tarihYaz(t.baslangic)}</span>
                    <DurumRozeti durum={t.durum} />
                    <span className="text-ink/60">
                      {t.kontrolEdilen} kontrol · {t.sorunlu} sorunlu
                    </span>
                    <span className="truncate text-ink/50">{t.ozet}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
