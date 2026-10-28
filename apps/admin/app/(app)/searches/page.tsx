import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import Link from 'next/link';
import { SearchTrendChart } from './trend-chart';

interface SearchesData {
  range: '1d' | '7d' | '30d' | '90d';
  total: number;
  trend: Array<{ day: string; total: number; unique: number }>;
  topQueries: Array<{
    query: string;
    count: number;
    zeroResults: number;
    lastAt: string | null;
  }>;
}

const RANGES = [
  { key: '1d', label: 'Bugün' },
  { key: '7d', label: '7 gün' },
  { key: '30d', label: '30 gün' },
  { key: '90d', label: '90 gün' },
] as const;

export default async function SearchesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const range = (RANGES.find((r) => r.key === params.range)?.key ?? '7d') as SearchesData['range'];
  const data = await api.get<SearchesData>(`/admin/searches?range=${range}&limit=30`);

  return (
    <>
      <PageHeader
        kicker="Aramalar"
        title="Sorgu analitiği"
        description="Kullanıcılar ne aradı, kaç tanesi sonuçsuz kaldı — yeni butik / kategori fırsatları."
        action={
          <div className="flex items-center gap-1 rounded-md border border-mist p-1">
            {RANGES.map((r) => (
              <Link
                key={r.key}
                href={`/searches?range=${r.key}`}
                className={
                  r.key === range
                    ? 'rounded bg-ink px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-cream'
                    : 'px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-ink/60 hover:text-ink'
                }
              >
                {r.label}
              </Link>
            ))}
          </div>
        }
      />

      <section className="mb-12 border border-mist p-8">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-ink/50">Trend</p>
            <p className="mt-3 font-display text-4xl italic leading-none text-ink">
              {data.total.toLocaleString('tr-TR')}
              <span className="ml-3 text-base text-ink/40">toplam sorgu</span>
            </p>
          </div>
        </header>
        {data.trend.length === 0 ? (
          <p className="py-12 text-center italic text-ink/40">Bu aralıkta arama yok.</p>
        ) : (
          <SearchTrendChart data={data.trend} />
        )}
      </section>

      <section>
        <header className="mb-6 flex items-end justify-between border-b border-mist pb-3">
          <h2 className="font-display text-2xl italic text-ink">Öne çıkan sorgular</h2>
          <span className="text-xs uppercase tracking-[0.2em] text-ink/40">
            sıfır-sonuç = ürün fırsatı
          </span>
        </header>
        {data.topQueries.length === 0 ? (
          <p className="text-sm italic text-ink/40">Veri yok.</p>
        ) : (
          <div className="border border-mist">
            <table className="w-full">
              <thead>
                <tr className="border-b border-mist text-left text-xs uppercase tracking-[0.18em] text-ink/50">
                  <th className="px-6 py-3 font-medium">Sorgu</th>
                  <th className="px-6 py-3 font-medium">Adet</th>
                  <th className="px-6 py-3 font-medium">Sıfır sonuç</th>
                  <th className="px-6 py-3 font-medium">Son</th>
                </tr>
              </thead>
              <tbody>
                {data.topQueries.map((q) => (
                  <tr key={q.query} className="border-t border-mist/60">
                    <td className="px-6 py-3">
                      <span className="font-display italic text-ink">"{q.query}"</span>
                    </td>
                    <td className="px-6 py-3 text-ink/80">{q.count}</td>
                    <td className="px-6 py-3">
                      {q.zeroResults > 0 ? (
                        <span className="font-medium text-clay">{q.zeroResults}</span>
                      ) : (
                        <span className="text-ink/30">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-xs text-ink/50">
                      {q.lastAt
                        ? formatDistanceToNow(new Date(q.lastAt), { addSuffix: true, locale: tr })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
