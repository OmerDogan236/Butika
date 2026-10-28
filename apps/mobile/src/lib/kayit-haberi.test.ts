import { describe, expect, test } from 'bun:test';
import type { AppNotification } from '@butika/types';
import { HABER_GUN, haberSirasi, kayitHaberleri } from './kayit-haberi';

const SIMDI = Date.parse('2026-09-30T00:00:00Z');
const GUN = 24 * 60 * 60 * 1000;

function bildirim(
  kimlik: string,
  adres: string,
  gunOnce: number,
  secenek: Partial<AppNotification> = {},
): AppNotification {
  return {
    id: kimlik,
    eventId: `olay-${kimlik}`,
    type: 'price_drop',
    createdAt: new Date(SIMDI - gunOnce * GUN).toISOString(),
    readAt: null,
    trackedProductId: `takip-${adres}`,
    boutiqueId: 'butik',
    boutiqueName: 'Jimmy Key',
    productTitle: 'Süveter · S',
    sourceUrl: adres,
    currency: 'TRY',
    previousPriceMinor: 229995,
    newPriceMinor: 206995,
    ...secenek,
  } as AppNotification;
}

describe('kayitHaberleri', () => {
  test('her adres için en yeni haberi verir', () => {
    // 29 Eyl testindeki sıra: süveterin fiyatı üç kez düştü, sonra stoğa geldi.
    const haberler = kayitHaberleri(
      [
        bildirim('1', 'https://a/suveter', 0.1),
        bildirim('2', 'https://a/suveter', 0.05, {
          type: 'back_in_stock',
          previousPriceMinor: null,
          newPriceMinor: 150898,
        } as Partial<AppNotification>),
        bildirim('3', 'https://a/suveter', 0.2),
      ],
      SIMDI,
    );
    expect(haberler.size).toBe(1);
    const haber = haberler.get('https://a/suveter');
    expect(haber?.bildirimId).toBe('2');
    expect(haber?.tur).toBe('back_in_stock');
    expect(haber?.yeniFiyat).toBe(150898);
  });

  test('okunmamış haber ne kadar eski olursa olsun kalır', () => {
    const haberler = kayitHaberleri([bildirim('1', 'https://a/x', HABER_GUN + 30)], SIMDI);
    expect(haberler.get('https://a/x')?.okunmadi).toBe(true);
  });

  test('okunmuş haber süresi dolunca satırdan kalkar', () => {
    const okundu = { readAt: new Date(SIMDI - GUN).toISOString() };
    const haberler = kayitHaberleri(
      [
        bildirim('taze', 'https://a/taze', HABER_GUN - 1, okundu),
        bildirim('eski', 'https://a/eski', HABER_GUN + 1, okundu),
      ],
      SIMDI,
    );
    expect(haberler.has('https://a/taze')).toBe(true);
    expect(haberler.has('https://a/eski')).toBe(false);
  });

  test('en yeni haber eskiyse daha eski okunmamış haber geri gelmez', () => {
    const haberler = kayitHaberleri(
      [
        bildirim('yeni-okundu', 'https://a/x', HABER_GUN + 1, {
          readAt: new Date(SIMDI - HABER_GUN * GUN).toISOString(),
        }),
        bildirim('eski-okunmadi', 'https://a/x', HABER_GUN + 5),
      ],
      SIMDI,
    );
    expect(haberler.has('https://a/x')).toBe(false);
  });

  test('farklı adresler ayrı tutulur', () => {
    const haberler = kayitHaberleri(
      [bildirim('1', 'https://a/s', 1), bildirim('2', 'https://a/m', 2)],
      SIMDI,
    );
    expect([...haberler.keys()].sort()).toEqual(['https://a/m', 'https://a/s']);
  });

  test('bildirim yoksa boş döner', () => {
    expect(kayitHaberleri([], SIMDI).size).toBe(0);
  });
});

describe('haberSirasi', () => {
  test('önce okunmamışlar, sonra en yeniler', () => {
    const haberler = kayitHaberleri(
      [
        bildirim('okundu-yeni', 'https://a/1', 0.1, { readAt: new Date(SIMDI).toISOString() }),
        bildirim('okunmadi-eski', 'https://a/2', 3),
        bildirim('okunmadi-yeni', 'https://a/3', 1),
      ],
      SIMDI,
    );
    const sira = [...haberler.values()].sort(haberSirasi).map((h) => h.bildirimId);
    expect(sira).toEqual(['okunmadi-yeni', 'okunmadi-eski', 'okundu-yeni']);
  });
});
