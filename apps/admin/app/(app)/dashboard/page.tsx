import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import Image from 'next/image';
import Link from 'next/link';

type Aralik = '24s' | '7g' | '30g';

const ARALIKLAR: Array<{ deger: Aralik; etiket: string }> = [
  { deger: '24s', etiket: '24 saat' },
  { deger: '7g', etiket: '7 gün' },
  { deger: '30g', etiket: '30 gün' },
];

interface DashboardData {
  aralik: Aralik;
  totals: { users: number; boutiques: number; savedProducts: number; events: number };
  dau: number;
  mau: number;
  topBoutiques: Array<{ id: string; name: string; coverImageUrl: string; viewCount: number }>;
  topSavedProducts: Array<{
    url: string;
    title: string;
    imageUrl: string | null;
    boutiqueName: string;
    saveCount: number;
  }>;
  recentEvents: Array<{
    id: string;
    type: string;
    payload: Record<string, unknown>;
    createdAt: string;
    user: { id: string; displayName: string; email: string | null } | null;
  }>;
}

const EVENT_LABELS: Record<string, string> = {
  app_open: 'uygulama açtı',
  boutique_view: 'butike baktı',
  webview_open: 'butike girdi',
  product_saved: 'ürün kaydetti',
  product_unsaved: 'kaydı kaldırdı',
  product_open: 'kayıttan açtı',
  search: 'arama yaptı',
  share: 'paylaştı',
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ aralik?: string }>;
}) {
  const { aralik } = await searchParams;
  const data = await api.get<DashboardData>(
    `/admin/dashboard?aralik=${encodeURIComponent(aralik ?? '30g')}`,
  );

  const metrics = [
    { label: 'DAU', value: data.dau, hint: 'Son 24 saatte kullanan' },
    { label: 'MAU', value: data.mau, hint: 'Son 30 günde kullanan' },
    { label: 'Kullanıcı', value: data.totals.users, hint: 'Yeni üye' },
    { label: 'Butik', value: data.totals.boutiques, hint: 'Vitrinde' },
    { label: 'Kayıt', value: data.totals.savedProducts, hint: 'Kaydedilen ürün' },
    { label: 'Olay', value: data.totals.events, hint: 'Uygulama içi hareket' },
  ];

  return (
    <>
      <PageHeader
        kicker="Pano"
        title="Genel görünüm"
        description="21 Eylül 2026 yayınından beri. Ekip ve mağaza inceleme hesapları sayılmaz."
      />

      <section className="grid grid-cols-2 gap-px border border-mist bg-mist sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((m) => (
          <div key={m.label} className="bg-background p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-ink/50">{m.label}</p>
            <p className="mt-4 font-display text-4xl italic leading-none text-ink">
              {m.value.toLocaleString('tr-TR')}
            </p>
            <p className="mt-3 text-xs text-ink/40">{m.hint}</p>
          </div>
        ))}
      </section>

      <section className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-2">
        <div>
          <header className="mb-6 flex items-end justify-between border-b border-mist pb-3">
            <h2 className="font-display text-2xl italic text-ink">Öne çıkan butikler</h2>
            <nav className="flex gap-3 text-xs uppercase tracking-[0.2em]">
              {ARALIKLAR.map((a) => (
                <Link
                  key={a.deger}
                  href={`/dashboard?aralik=${a.deger}`}
                  className={a.deger === data.aralik ? 'text-ink' : 'text-ink/40 hover:text-ink/70'}
                >
                  {a.etiket}
                </Link>
              ))}
            </nav>
          </header>
          {data.topBoutiques.length === 0 ? (
            <p className="text-sm italic text-ink/40">Henüz veri yok.</p>
          ) : (
            <ul className="flex flex-col">
              {data.topBoutiques.map((b, i) => (
                <li
                  key={b.id}
                  className="flex items-center gap-4 border-b border-mist/60 py-3 last:border-b-0"
                >
                  <span className="w-5 font-display text-lg italic text-ink/50">{i + 1}</span>
                  <div className="relative h-14 w-12 overflow-hidden rounded bg-mist">
                    <Image
                      src={b.coverImageUrl}
                      alt={b.name}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  </div>
                  <p className="flex-1 font-display text-lg italic text-ink">{b.name}</p>
                  <p className="font-display text-2xl italic text-gold">
                    {b.viewCount}
                    <span className="ml-1 font-sans text-xs not-italic text-ink/40">kişi</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <header className="mb-6 flex items-end justify-between border-b border-mist pb-3">
            <h2 className="font-display text-2xl italic text-ink">En çok kaydedilen ürünler</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-ink/40">toplam</span>
          </header>
          {data.topSavedProducts.length === 0 ? (
            <p className="text-sm italic text-ink/40">Henüz kaydedilen ürün yok.</p>
          ) : (
            <ul className="flex flex-col">
              {data.topSavedProducts.map((p, i) => (
                <li
                  key={p.url}
                  className="flex items-center gap-4 border-b border-mist/60 py-3 last:border-b-0"
                >
                  <span className="w-5 font-display text-lg italic text-ink/50">{i + 1}</span>
                  <div className="relative h-14 w-12 overflow-hidden rounded bg-mist">
                    {p.imageUrl && (
                      <Image
                        src={p.imageUrl}
                        alt={p.title}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                    <p className="truncate text-xs text-ink/50">{p.boutiqueName}</p>
                  </div>
                  <p className="font-display text-2xl italic text-gold">{p.saveCount}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-16">
        <header className="mb-6 flex items-end justify-between border-b border-mist pb-3">
          <h2 className="font-display text-2xl italic text-ink">Son aktivite</h2>
          <span className="text-xs uppercase tracking-[0.2em] text-ink/40">canlı akış</span>
        </header>
        <ul className="flex flex-col">
          {data.recentEvents.slice(0, 12).map((e) => (
            <li
              key={e.id}
              className="flex items-baseline gap-4 border-b border-mist/40 py-2.5 text-sm last:border-b-0"
            >
              <span className="w-20 text-xs uppercase tracking-[0.14em] text-ink/40">
                {formatDistanceToNow(new Date(e.createdAt), { addSuffix: false, locale: tr })}
              </span>
              <span className="text-ink/80">
                <span className="font-medium">{e.user?.displayName ?? 'misafir'}</span>{' '}
                <span className="text-ink/50">{EVENT_LABELS[e.type] ?? e.type}</span>
              </span>
              {typeof e.payload?.query === 'string' && (
                <span className="font-display italic text-ink/60">"{e.payload.query}"</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
