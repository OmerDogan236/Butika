import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Download } from 'lucide-react';

interface ConsentItem {
  id: string;
  email: string | null;
  userId: string | null;
  visitorId: string | null;
  consentType: string;
  granted: boolean;
  textVersion: string;
  source: string;
  ipAddress: string | null;
  userAgent: string | null;
  locale: string | null;
  createdAt: string;
}

interface ConsentsData {
  items: ConsentItem[];
  nextCursor: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  kvkk_acik_riza: 'KVKK Açık Rıza',
  ticari_ileti: 'Ticari İleti',
  cerez_analitik: 'Çerez / Analitik',
};

const SOURCE_LABEL: Record<string, string> = {
  web_butik_formu: 'Web — Butik Formu',
  web_quiz: 'Web — Quiz',
  web_cerez: 'Web — Çerez Bandı',
  mobil_kayit: 'Mobil — Kayıt',
};

export default async function ConsentsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  qs.set('limit', '50');
  if (params.cursor) qs.set('cursor', params.cursor);

  const data = await api.get<ConsentsData>(`/admin/consents?${qs.toString()}`);

  return (
    <>
      <PageHeader
        kicker="KVKK"
        title="Rıza kayıtları"
        description="Yasal ispat defteri. Her satır bir onay kararıdır (verildi/reddedildi); kayıtlar silinmez."
        action={
          <a
            href="/api/consents/export"
            className="inline-flex items-center gap-2 rounded-md border border-mist px-4 py-2 text-xs uppercase tracking-[0.16em] text-ink/70 hover:bg-mist/40 hover:text-ink"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
            CSV indir
          </a>
        }
      />

      {data.items.length === 0 ? (
        <p className="border border-mist py-16 text-center italic text-ink/40">
          Henüz rıza kaydı yok.
        </p>
      ) : (
        <div className="overflow-x-auto border border-mist">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-mist text-left text-[10px] uppercase tracking-[0.16em] text-ink/40">
                <th className="p-3 font-medium">Tarih</th>
                <th className="p-3 font-medium">Kime</th>
                <th className="p-3 font-medium">Onay türü</th>
                <th className="p-3 font-medium">Karar</th>
                <th className="p-3 font-medium">Kaynak</th>
                <th className="p-3 font-medium">Ver.</th>
                <th className="p-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} className="border-b border-mist/50 last:border-b-0">
                  <td className="p-3 text-ink/60 whitespace-nowrap">
                    {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true, locale: tr })}
                  </td>
                  <td className="p-3 text-ink/80">{r.email ?? r.userId ?? r.visitorId ?? '—'}</td>
                  <td className="p-3 text-ink/80">{TYPE_LABEL[r.consentType] ?? r.consentType}</td>
                  <td className="p-3">
                    <span
                      className={
                        r.granted
                          ? 'rounded-full bg-sage/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-sage'
                          : 'rounded-full bg-clay/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-clay'
                      }
                    >
                      {r.granted ? 'Verildi' : 'Reddedildi'}
                    </span>
                  </td>
                  <td className="p-3 text-ink/60">{SOURCE_LABEL[r.source] ?? r.source}</td>
                  <td className="p-3 text-ink/50">{r.textVersion}</td>
                  <td className="p-3 text-ink/50 whitespace-nowrap">{r.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.nextCursor && (
        <div className="mt-8 flex justify-center">
          <a
            href={`/consents?cursor=${data.nextCursor}`}
            className="rounded-md border border-mist px-5 py-2 text-xs uppercase tracking-[0.18em] text-ink/70 hover:bg-mist/40 hover:text-ink"
          >
            Daha eskileri yükle
          </a>
        </div>
      )}
    </>
  );
}
