import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import Link from 'next/link';

interface EventsData {
  items: Array<{
    id: string;
    type: string;
    payload: Record<string, unknown>;
    createdAt: string;
    user: { id: string; displayName: string; email: string | null } | null;
  }>;
  nextCursor: string | null;
}

const EVENT_LABELS: Record<string, { label: string; tone: string }> = {
  app_open: { label: 'Açılış', tone: 'text-ink/60' },
  boutique_view: { label: 'Butik bakış', tone: 'text-ink' },
  webview_open: { label: 'Butike girdi', tone: 'text-gold' },
  product_saved: { label: 'Kaydetti', tone: 'text-sage' },
  product_unsaved: { label: 'Kaldırdı', tone: 'text-ink/50' },
  product_open: { label: 'Açtı', tone: 'text-ink' },
  search: { label: 'Arama', tone: 'text-ink' },
  share: { label: 'Paylaştı', tone: 'text-gold' },
};

const TYPES = [
  { key: 'all', label: 'Hepsi' },
  { key: 'product_saved', label: 'Kaydetti' },
  { key: 'webview_open', label: 'Butike girdi' },
  { key: 'search', label: 'Arama' },
  { key: 'share', label: 'Paylaştı' },
  { key: 'boutique_view', label: 'Bakış' },
] as const;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const type = params.type && params.type !== 'all' ? params.type : undefined;
  const cursor = params.cursor;

  const qs = new URLSearchParams();
  qs.set('limit', '50');
  if (type) qs.set('type', type);
  if (cursor) qs.set('cursor', cursor);

  const data = await api.get<EventsData>(`/admin/events?${qs.toString()}`);

  return (
    <>
      <PageHeader
        kicker="Olaylar"
        title="Zaman çizelgesi"
        description="Tüm kullanıcı aktivitesi — kaydetme, paylaşma, arama, butik bakışı."
        action={
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-mist p-1">
            {TYPES.map((t) => {
              const active = (t.key === 'all' && !type) || t.key === type;
              return (
                <Link
                  key={t.key}
                  href={t.key === 'all' ? '/events' : `/events?type=${t.key}`}
                  className={
                    active
                      ? 'rounded bg-ink px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-cream'
                      : 'px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-ink/60 hover:text-ink'
                  }
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        }
      />

      {data.items.length === 0 ? (
        <p className="border border-mist py-16 text-center italic text-ink/40">
          Bu filtreye uyan olay yok.
        </p>
      ) : (
        <div className="border border-mist">
          <ul>
            {data.items.map((e) => {
              const meta = EVENT_LABELS[e.type] ?? { label: e.type, tone: 'text-ink/60' };
              return (
                <li
                  key={e.id}
                  className="flex items-baseline gap-4 border-b border-mist/40 px-6 py-3 text-sm last:border-b-0"
                >
                  <span className="w-28 shrink-0 text-xs uppercase tracking-[0.14em] text-ink/40">
                    {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true, locale: tr })}
                  </span>
                  <span
                    className={`w-28 shrink-0 text-xs uppercase tracking-[0.18em] ${meta.tone}`}
                  >
                    {meta.label}
                  </span>
                  <span className="w-40 shrink-0 truncate text-ink/80">
                    {e.user?.displayName ?? 'misafir'}
                  </span>
                  <span className="flex-1 truncate text-xs text-ink/50">
                    {summarizePayload(e.payload)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {data.nextCursor && (
        <div className="mt-8 flex justify-center">
          <Link
            href={
              type
                ? `/events?type=${type}&cursor=${data.nextCursor}`
                : `/events?cursor=${data.nextCursor}`
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

function summarizePayload(payload: Record<string, unknown>): string {
  if (!payload || Object.keys(payload).length === 0) return '';
  if (typeof payload.query === 'string') return `"${payload.query}"`;
  if (typeof payload.url === 'string') return payload.url;
  if (typeof payload.boutiqueId === 'string') return `butik ${payload.boutiqueId.slice(0, 8)}`;
  return JSON.stringify(payload).slice(0, 100);
}
