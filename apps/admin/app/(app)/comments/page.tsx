import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import Link from 'next/link';
import { deleteCommentAction } from './actions';

interface CommentItem {
  id: string;
  url: string;
  body: string;
  createdAt: string;
  boutique: { id: string; name: string };
  user: {
    id: string;
    displayName: string;
    email: string | null;
    gender: 'female' | 'male' | null;
    heightCm: number | null;
    weightKg: number | null;
  };
}

interface CommentsData {
  items: CommentItem[];
  nextCursor: string | null;
}

interface Boutique {
  id: string;
  name: string;
}

export default async function CommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ boutiqueId?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  qs.set('limit', '50');
  if (params.boutiqueId) qs.set('boutiqueId', params.boutiqueId);
  if (params.cursor) qs.set('cursor', params.cursor);

  const [data, boutiques] = await Promise.all([
    api.get<CommentsData>(`/admin/comments?${qs.toString()}`),
    api.get<Boutique[]>('/admin/boutiques'),
  ]);

  return (
    <>
      <PageHeader
        kicker="Yorumlar"
        title="Topluluk"
        description="Kullanıcıların ürün sayfalarında bıraktığı yorumlar. Uygunsuz olanı sil."
        action={
          <div className="flex items-center gap-1 rounded-md border border-mist p-1">
            <Link
              href="/comments"
              className={
                !params.boutiqueId
                  ? 'rounded bg-ink px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-cream'
                  : 'px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-ink/60 hover:text-ink'
              }
            >
              Hepsi
            </Link>
            {boutiques.slice(0, 4).map((b) => (
              <Link
                key={b.id}
                href={`/comments?boutiqueId=${b.id}`}
                className={
                  params.boutiqueId === b.id
                    ? 'rounded bg-ink px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-cream'
                    : 'px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-ink/60 hover:text-ink'
                }
              >
                {b.name}
              </Link>
            ))}
          </div>
        }
      />

      {data.items.length === 0 ? (
        <p className="border border-mist py-16 text-center italic text-ink/40">
          Bu filtreye uyan yorum yok.
        </p>
      ) : (
        <ul className="flex flex-col border border-mist">
          {data.items.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-3 border-b border-mist/60 p-6 last:border-b-0"
            >
              <header className="flex items-baseline justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-display italic text-lg text-ink">
                      {c.user.displayName}
                    </span>
                    <span className="ml-3 text-xs uppercase tracking-[0.18em] text-ink/40">
                      {c.boutique.name}
                    </span>
                  </p>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-block max-w-full truncate text-xs text-ink/40 hover:text-ink/70"
                  >
                    {c.url}
                  </a>
                  {(() => {
                    const parts: string[] = [];
                    if (c.user.gender === 'female') parts.push('Kadın');
                    else if (c.user.gender === 'male') parts.push('Erkek');
                    if (c.user.heightCm != null) parts.push(`${c.user.heightCm} cm`);
                    if (c.user.weightKg != null) parts.push(`${c.user.weightKg} kg`);
                    return parts.length > 0 ? (
                      <p className="mt-0.5 text-xs text-ink/40">{parts.join(' · ')}</p>
                    ) : null;
                  })()}
                </div>
                <span className="shrink-0 text-xs uppercase tracking-[0.14em] text-ink/40">
                  {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true, locale: tr })}
                </span>
              </header>
              <p className="text-sm leading-relaxed text-ink/90">{c.body}</p>
              <form
                action={async () => {
                  'use server';
                  await deleteCommentAction(c.id);
                }}
                className="mt-1"
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
            </li>
          ))}
        </ul>
      )}

      {data.nextCursor && (
        <div className="mt-8 flex justify-center">
          <Link
            href={
              params.boutiqueId
                ? `/comments?boutiqueId=${params.boutiqueId}&cursor=${data.nextCursor}`
                : `/comments?cursor=${data.nextCursor}`
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
