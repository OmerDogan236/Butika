import { expect, test } from 'bun:test';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The one-off announcement script (scripts/broadcast-push.ts) as the operator runs it, but
// never with --send: without it the script only counts its recipients and exits. Its own
// process gets this disposable database, a test review address and a fetch trap, so nothing
// can be sent. Accounts: a normal one, one without an e-mail, a deleted one, the shared review
// account (with REVIEW_AUTH_ENABLED on and off) and one whose only devices are disabled, for
// both audiences. The file removes its own rows.
// Run this file separately against a disposable, migrated local database
// (docs/bildirim-sistemi.md, "Test"). Never use the development or production database.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('the announcement leaves out the shared review account, whatever its switch says', async () => {
  const url = new URL(testUrl!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/butika_notification_test')) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  const { env } = await import('../../env');
  if (env.DATABASE_URL !== testUrl) {
    throw new Error('Database configuration was already loaded; run this test file separately');
  }
  const { db } = await import('../db');
  const { ensureTrackedProduct } = await import('../price-tracking/tracked-product');
  const { eq, inArray } = await import('drizzle-orm');
  const { users, countries, boutiques, trackedProducts, savedProducts, pushDevices, notifications } = await import('@butika/db');

  const run = crypto.randomUUID().slice(0, 8);
  const review = `review-${run}@example.invalid`;
  const campaign = `duyuru-testi-${run}`;
  const boutiqueId = crypto.randomUUID();
  const productUrl = 'https://www.butika-duyuru-testi.com/urun/elbise';
  // Each account gets a different number of devices, so the device count alone says which
  // accounts were counted: 1 normal, 2 no e-mail, 4 deleted, 8 review, 16 disabled, 32 no save.
  const accounts = [
    { name: 'normal', email: `normal-${run}@example.invalid`, devices: 1, saver: true },
    { name: 'no-email', email: null, devices: 2, saver: true },
    { name: 'deleted', email: `deleted-${run}@example.invalid`, devices: 4, saver: true, deleted: true },
    { name: 'review', email: review, devices: 8, saver: true },
    { name: 'disabled', email: `disabled-${run}@example.invalid`, devices: 16, saver: true, disabled: true },
    { name: 'no-save', email: `no-save-${run}@example.invalid`, devices: 32, saver: false },
  ].map(a => ({ ...a, id: crypto.randomUUID() }));
  const trap = join(tmpdir(), `broadcast-fetch-trap-${run}.mjs`);
  writeFileSync(trap, 'globalThis.fetch = async (input) => { console.error(`FETCH-TRAP ${String(input)}`); throw new Error("network trap"); };\n');
  const script = fileURLToPath(new URL('../../../scripts/broadcast-push.ts', import.meta.url));
  const apiRoot = fileURLToPath(new URL('../../../', import.meta.url));

  const count = async (audience: 'all' | 'savers', reviewSwitch: 'true' | 'false', reviewEmail = review) => {
    const proc = Bun.spawn([process.execPath, '--preload', trap, script, `--campaign=${campaign}`, `--audience=${audience}`,
      '--title=Duyuru testi', '--body=Gonderilmeyecek'], {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: testUrl, NODE_ENV: 'test', REVIEW_AUTH_EMAIL: reviewEmail, REVIEW_AUTH_ENABLED: reviewSwitch },
      stdout: 'pipe', stderr: 'pipe',
    });
    const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    const found = /Alıcı: ([0-9]+) kişi, ([0-9]+) cihaz/.exec(out);
    return { code, people: Number(found?.[1] ?? -1), devices: Number(found?.[2] ?? -1),
      dryRun: out.includes('KURU ÇALIŞMA'), trapped: `${out}${err}`.includes('FETCH-TRAP') };
  };

  try {
    await db.insert(countries).values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' }).onConflictDoNothing();
    await db.insert(boutiques).values({ id: boutiqueId, countryCode: 'TR', name: 'Duyuru testi', url: 'https://www.butika-duyuru-testi.com', coverImageUrl: '' });
    const tracked = await ensureTrackedProduct({ boutiqueId, url: productUrl, title: 'Elbise' });
    expect(tracked).toBeString();
    for (const a of accounts) {
      await db.insert(users).values({ id: a.id, displayName: `Duyuru testi ${a.name}`, email: a.email, deletedAt: a.deleted ? new Date() : null });
      await db.insert(pushDevices).values(Array.from({ length: a.devices }, (_, i) => ({ userId: a.id, installationId: `duyuru-${run}-${a.name}-${i}`,
        expoPushToken: `ExponentPushToken[duyuru-${run}-${a.name}-${i}]`, platform: 'android', enabled: !a.disabled })));
      if (a.saver) await db.insert(savedProducts).values({ userId: a.id, boutiqueId, url: productUrl, title: 'Elbise', trackedProductId: tracked });
    }

    // With the switch off and on alike: 'all' counts normal, no e-mail and no save (1+2+32);
    // 'savers' counts normal and no e-mail (1+2). Nothing is sent and nothing is fetched.
    const everyone = { code: 0, people: 3, devices: 35, dryRun: true, trapped: false };
    const savers = { code: 0, people: 2, devices: 3, dryRun: true, trapped: false };
    expect(await count('all', 'false')).toEqual(everyone);
    expect(await count('all', 'true')).toEqual(everyone);
    expect(await count('savers', 'false')).toEqual(savers);
    expect(await count('savers', 'true')).toEqual(savers);
    // The rule follows REVIEW_AUTH_EMAIL, as the queue worker does: under another review
    // address this account is an ordinary one again (1+2+8+32).
    expect(await count('all', 'false', `someone-else-${run}@example.invalid`)).toEqual({ ...everyone, people: 4, devices: 43 });

    // A dry run leaves no trace: no notification rows and no "already sent" marker.
    const ids = accounts.map(a => a.id);
    expect(await db.select({ id: notifications.id }).from(notifications).where(inArray(notifications.userId, ids))).toEqual([]);
    expect(existsSync(`/tmp/butika-broadcast-${campaign}.done`)).toBe(false);
  } finally {
    rmSync(trap, { force: true });
    await db.delete(users).where(inArray(users.id, accounts.map(a => a.id)));
    await db.delete(trackedProducts).where(eq(trackedProducts.boutiqueId, boutiqueId));
    await db.delete(boutiques).where(eq(boutiques.id, boutiqueId));
  }
}, 60000);
