import { ApiClientError, api } from '@/lib/api';
import { NextResponse } from 'next/server';

interface PresignBody {
  filename: string;
  contentType: string;
  prefix?: 'boutiques' | 'logos';
}

export async function POST(req: Request) {
  let body: PresignBody;
  try {
    body = (await req.json()) as PresignBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body.filename || !body.contentType) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }
  try {
    const data = await api.post<{
      uploadUrl: string;
      publicUrl: string;
      key: string;
      expiresInSeconds: number;
    }>('/admin/upload', body);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ApiClientError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'unknown' }, { status: 500 });
  }
}
