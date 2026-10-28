import { api } from '@/lib/api';

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

// CSV hücresi kaçışı — çift tırnak içine al, içteki tırnakları ikiye katla.
function cell(v: string | boolean | null): string {
  const s = v === null ? '' : typeof v === 'boolean' ? (v ? 'evet' : 'hayir') : v;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET() {
  const columns = [
    'createdAt',
    'email',
    'userId',
    'visitorId',
    'consentType',
    'granted',
    'textVersion',
    'source',
    'ipAddress',
    'userAgent',
    'locale',
  ] as const;

  const lines: string[] = [columns.join(',')];

  // Tüm sayfaları cursor ile dolaş (güvenlik için üst sınır).
  let cursor: string | null = null;
  for (let page = 0; page < 200; page++) {
    const qs = new URLSearchParams({ limit: '500' });
    if (cursor) qs.set('cursor', cursor);
    const data: ConsentsData = await api.get<ConsentsData>(`/admin/consents?${qs.toString()}`);
    for (const r of data.items) {
      lines.push(columns.map((k) => cell(r[k])).join(','));
    }
    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }

  const csv = `﻿${lines.join('\r\n')}`; // BOM — Excel Türkçe karakterleri doğru okur
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="butika-riza-kayitlari.csv"',
    },
  });
}
