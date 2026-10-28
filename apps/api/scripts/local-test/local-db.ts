// The local test helpers only run against a dedicated local database whose
// name starts with butika_local. Development, staging and production databases
// are refused, so synthetic prices never reach real data.
export function localTestDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? '';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('DATABASE_URL yok. Komutu apps/api klasöründen çalıştırın; Bun apps/api/.env dosyasını okur.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (process.env.NODE_ENV === 'production' || !local || !url.pathname.startsWith('/butika_local')) {
    throw new Error('Reddedildi: bu betik yalnız adı butika_local ile başlayan yerel bir veritabanında çalışır (TEST-REHBERI.md).');
  }
  return raw;
}
