import { PageHeader } from '@/components/PageHeader';
import { ApiClientError, api } from '@/lib/api';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AutoYenile } from '../auto-yenile';
import { type Bulgu, BulguTablosu, DurumRozeti, type Tur, tarihYaz } from '../bulgu-tablosu';

export default async function TurDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let detay: { tur: Tur; bulgular: Bulgu[] };
  try {
    detay = await api.get(`/admin/butik-kontrol/turlar/${id}`);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) notFound();
    throw err;
  }
  const { tur, bulgular } = detay;

  return (
    <>
      <AutoYenile aktif={tur.durum === 'suruyor'} />
      <PageHeader
        kicker="Butik kontrolü"
        title={tarihYaz(tur.baslangic)}
        action={
          <Link href="/butik-kontrol" className="text-xs uppercase tracking-[0.2em] text-ink/60">
            ← Tüm turlar
          </Link>
        }
      />
      <section className="mb-12 border border-mist p-6">
        <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-ink/50">
          <DurumRozeti durum={tur.durum} />
          <span>
            {tur.kontrolEdilen} butik kontrol edildi · {tur.sorunlu} sorunlu
          </span>
        </div>
        <p className="mt-4 font-display text-2xl italic text-ink">{tur.ozet ?? 'Özet yok.'}</p>
      </section>
      <BulguTablosu bulgular={bulgular} />
    </>
  );
}
