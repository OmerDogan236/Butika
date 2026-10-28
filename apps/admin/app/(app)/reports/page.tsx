import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { ExternalLink } from 'lucide-react';
import { deleteReportedCommentAction } from './actions';

interface ReportItem {
  commentId: string;
  body: string;
  url: string;
  createdAt: string;
  deleted: boolean;
  author: { id: string; displayName: string };
  reportCount: number;
  reasons: string[];
  lastReportedAt: string;
}

interface ReportsData {
  items: ReportItem[];
}

const REASON_LABEL: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Hakaret / Taciz',
  inappropriate: 'Uygunsuz içerik',
  other: 'Diğer',
};

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default async function ReportsPage() {
  const data = await api.get<ReportsData>('/admin/reports');
  const active = data.items.filter((r) => !r.deleted);

  return (
    <>
      <PageHeader
        kicker="Moderasyon"
        title="Şikayetler"
        description="Kullanıcıların uygunsuz bulup şikayet ettiği yorumlar. İncele ve gerekirse sil. En çok şikayet edilen üstte."
      />

      {active.length === 0 ? (
        <p className="border border-mist py-16 text-center italic text-ink/40">
          Bekleyen şikayet yok. Harika!
        </p>
      ) : (
        <ul className="flex flex-col border border-mist">
          {active.map((r) => (
            <li
              key={r.commentId}
              className="flex flex-col gap-3 border-b border-mist/60 p-6 last:border-b-0"
            >
              <header className="flex items-start justify-between gap-6">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-clay/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-clay">
                      {r.reportCount} şikayet
                    </span>
                    {r.reasons.map((reason) => (
                      <span
                        key={reason}
                        className="rounded-full bg-mist/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-ink/60"
                      >
                        {REASON_LABEL[reason] ?? reason}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-ink/40">
                    {r.author.displayName}
                    <span className="mx-2">·</span>
                    {formatDistanceToNow(new Date(r.lastReportedAt), {
                      addSuffix: true,
                      locale: tr,
                    })}
                  </p>
                </div>
              </header>

              <blockquote className="border-l-2 border-clay/40 pl-4 text-sm italic text-ink/80">
                "{r.body}"
              </blockquote>

              <div className="flex items-center gap-4">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-xs text-ink/50 hover:text-ink"
                >
                  {hostname(r.url)}
                  <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                </a>
                <form
                  action={async () => {
                    'use server';
                    await deleteReportedCommentAction(r.commentId);
                  }}
                  className="ml-auto"
                >
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="text-clay hover:text-clay"
                  >
                    Yorumu sil
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
