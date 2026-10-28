import { describe, expect, test } from 'bun:test';
import { GECIKME_SINIRI_MS, gecikmeKarari } from './bildirim-plani-worker';

describe('gecikmeKarari', () => {
  const zaman = new Date('2026-10-05T07:00:00Z');

  test('zamanında ya da biraz geç yakalanan plan gönderilir', () => {
    expect(gecikmeKarari(zaman, new Date('2026-10-05T07:00:30Z'))).toBe('gonder');
    expect(gecikmeKarari(zaman, new Date(zaman.getTime() + GECIKME_SINIRI_MS))).toBe('gonder');
  });

  test('bir saatten fazla geç yakalanan plan gönderilmez', () => {
    expect(gecikmeKarari(zaman, new Date(zaman.getTime() + GECIKME_SINIRI_MS + 1000))).toBe(
      'gecikti',
    );
  });
});
