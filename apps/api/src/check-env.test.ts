import { expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const betik = join(import.meta.dir, 'check-env.ts');

function calistir(ek: Record<string, string>) {
  // cwd geçici dizin: yerel .env dosyası okunmasın
  const s = Bun.spawnSync([process.execPath, 'run', betik], {
    cwd: tmpdir(),
    env: {
      PATH: process.env.PATH ?? '',
      DATABASE_URL: 'postgres://x:y@localhost:1/check_env_test',
      ...ek,
    },
  });
  expect(s.exitCode).toBe(0);
  return JSON.parse(s.stdout.toString()) as { workers: Record<string, boolean> };
}

test('check-env butik kontrolü anahtarını diğer işçiler gibi raporlar', () => {
  expect(calistir({ BOUTIQUE_CHECK_ENABLED: 'true' }).workers.boutiqueCheck).toBe(true);
  expect(calistir({ BOUTIQUE_CHECK_ENABLED: 'false' }).workers.boutiqueCheck).toBe(false);
});
