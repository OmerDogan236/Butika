import { ApiClientError, api } from '@/lib/api';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  try {
    const data = await api.post('/admin/countries/reorder', body);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ApiClientError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'unknown' }, { status: 500 });
  }
}
