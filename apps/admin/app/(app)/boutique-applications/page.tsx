import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { ExternalLink, Instagram, Mail, MapPin, Phone } from 'lucide-react';
import { deleteApplicationAction } from './actions';

interface ApplicationItem {
  id: string;
  boutiqueName: string;
  city: string;
  contactName: string;
  phone: string;
  email: string;
  website: string | null;
  description: string | null;
  createdAt: string;
}

interface ApplicationsData {
  items: ApplicationItem[];
  nextCursor: string | null;
}

// "instagram.com/foo" veya "foo.com" → tıklanabilir tam adres
function toHref(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export default async function BoutiqueApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const params = await searchParams;

  const qs = new URLSearchParams();
  qs.set('limit', '50');
  if (params.cursor) qs.set('cursor', params.cursor);

  const data = await api.get<ApplicationsData>(`/admin/boutique-applications?${qs.toString()}`);

  return (
    <>
      <PageHeader
        kicker="Başvurular"
        title="Butik başvuruları"
        description="butika.ai tanıtım sayfasındaki formdan gelen butik başvuruları. En yeni en üstte."
      />

      {data.items.length === 0 ? (
        <p className="border border-mist py-16 text-center italic text-ink/40">
          Henüz başvuru yok.
        </p>
      ) : (
        <ul className="flex flex-col border border-mist">
          {data.items.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-4 border-b border-mist/60 p-6 last:border-b-0"
            >
              <header className="flex items-start justify-between gap-6">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-2xl italic leading-tight text-ink">
                    {a.boutiqueName}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs uppercase tracking-[0.16em] text-ink/40">
                    <MapPin className="h-3 w-3" strokeWidth={1.5} />
                    {a.city}
                    <span className="mx-1">·</span>
                    {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true, locale: tr })}
                  </p>
                </div>
              </header>

              <div className="flex flex-col gap-2 text-sm text-ink/80">
                <p className="text-ink">{a.contactName}</p>
                <a
                  href={`tel:${a.phone}`}
                  className="inline-flex items-center gap-2 text-ink/70 hover:text-ink"
                >
                  <Phone className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {a.phone}
                </a>
                <a
                  href={`mailto:${a.email}`}
                  className="inline-flex items-center gap-2 text-ink/70 hover:text-ink"
                >
                  <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {a.email}
                </a>
                {a.website && (
                  <a
                    href={toHref(a.website)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-2 font-medium text-gold hover:underline"
                  >
                    <Instagram className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {a.website}
                    <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                  </a>
                )}
              </div>

              {a.description && (
                <blockquote className="border-l-2 border-gold/40 pl-4 text-sm italic text-ink/70">
                  "{a.description}"
                </blockquote>
              )}

              <div className="flex items-center gap-3">
                <form
                  action={async () => {
                    'use server';
                    await deleteApplicationAction(a.id);
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
          <a
            href={`/boutique-applications?cursor=${data.nextCursor}`}
            className="rounded-md border border-mist px-5 py-2 text-xs uppercase tracking-[0.18em] text-ink/70 hover:bg-mist/40 hover:text-ink"
          >
            Daha eskileri yükle
          </a>
        </div>
      )}
    </>
  );
}
