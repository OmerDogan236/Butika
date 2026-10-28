import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { ExternalLink, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { deleteSuggestionAction } from './actions';
import { KullaniciButikleri } from './KullaniciButikleri';

interface SuggestionItem {
  id: string;
  name: string;
  url: string;
  note: string | null;
  status: 'pending' | 'approved';
  createdAt: string;
  approvedAt: string | null;
  user: { id: string; displayName: string; email: string | null };
  approvedBoutique: { id: string; name: string } | null;
}

interface SuggestionsData {
  items: SuggestionItem[];
  nextCursor: string | null;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Bekleyen' },
  { value: 'approved', label: 'Onaylanmış' },
  { value: 'all', label: 'Hepsi' },
] as const;

type StatusFilter = (typeof STATUS_OPTIONS)[number]['value'];

export default async function SuggestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: StatusFilter; cursor?: string }>;
}) {
  const params = await searchParams;
  const status: StatusFilter = params.status ?? 'pending';

  const qs = new URLSearchParams();
  qs.set('limit', '50');
  qs.set('status', status);
  if (params.cursor) qs.set('cursor', params.cursor);

  const data = await api.get<SuggestionsData>(`/admin/suggestions?${qs.toString()}`);

  return (
    <>
      <PageHeader
        kicker="Öneriler"
        title="Kullanıcı önerileri"
        description="Kullanıcıların eklenmesini istediği butikler. Onayla ve butik formuyla tamamla, ya da reddet."
        action={
          <div className="flex items-center gap-1 rounded-md border border-mist p-1">
            {STATUS_OPTIONS.map((opt) => (
              <Link
                key={opt.value}
                href={opt.value === 'pending' ? '/suggestions' : `/suggestions?status=${opt.value}`}
                className={
                  status === opt.value
                    ? 'rounded bg-ink px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-cream'
                    : 'px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-ink/60 hover:text-ink'
                }
              >
                {opt.label}
              </Link>
            ))}
          </div>
        }
      />

      {status === 'pending' && !params.cursor && <KullaniciButikleri />}

      {data.items.length === 0 ? (
        <p className="border border-mist py-16 text-center italic text-ink/40">
          {status === 'pending'
            ? 'Bekleyen öneri yok. Harika!'
            : status === 'approved'
              ? 'Henüz onaylanmış öneri yok.'
              : 'Henüz öneri yok.'}
        </p>
      ) : (
        <ul className="flex flex-col border border-mist">
          {data.items.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-4 border-b border-mist/60 p-6 last:border-b-0"
            >
              <header className="flex items-start justify-between gap-6">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-2xl italic leading-tight text-ink">{s.name}</p>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink/50 hover:text-ink"
                  >
                    {hostname(s.url)}
                    <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                  </a>
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-ink/40">
                    {s.user.displayName}
                    <span className="mx-2">·</span>
                    {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true, locale: tr })}
                  </p>
                </div>
                <span
                  className={
                    s.status === 'approved'
                      ? 'shrink-0 rounded-full bg-sage/15 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-sage'
                      : 'shrink-0 rounded-full bg-gold/15 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-gold'
                  }
                >
                  {s.status === 'approved' ? 'Onaylandı' : 'Bekliyor'}
                </span>
              </header>

              {s.note && (
                <blockquote className="border-l-2 border-gold/40 pl-4 text-sm italic text-ink/70">
                  "{s.note}"
                </blockquote>
              )}

              {s.status === 'approved' && s.approvedBoutique && (
                <p className="text-xs text-ink/50">
                  Yaratılan butik:{' '}
                  <Link
                    href={`/boutiques/${s.approvedBoutique.id}/edit`}
                    className="text-gold hover:underline"
                  >
                    {s.approvedBoutique.name}
                  </Link>
                </p>
              )}

              <div className="flex items-center gap-3">
                {s.status === 'pending' && (
                  <Button asChild variant="gold" size="sm">
                    <Link href={`/boutiques/new?suggestionId=${s.id}`}>
                      <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Onayla & Butik Oluştur
                    </Link>
                  </Button>
                )}
                <form
                  action={async () => {
                    'use server';
                    await deleteSuggestionAction(s.id);
                  }}
                >
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="text-clay hover:text-clay"
                  >
                    Sil
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data.nextCursor && (
        <div className="mt-8 flex justify-center">
          <Link
            href={
              status === 'pending'
                ? `/suggestions?cursor=${data.nextCursor}`
                : `/suggestions?status=${status}&cursor=${data.nextCursor}`
            }
            className="rounded-md border border-mist px-5 py-2 text-xs uppercase tracking-[0.18em] text-ink/70 hover:bg-mist/40 hover:text-ink"
          >
            Daha eskileri yükle
          </Link>
        </div>
      )}
    </>
  );
}
