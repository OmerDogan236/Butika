import { describe, expect, test } from 'bun:test';
import type { SavedTracking } from '@butika/types';
import { restockControl, takipBekliyorMu } from './restock';

const t = (status: string): SavedTracking =>
  ({ status, priceMinor: null, currency: null, checkedAt: null }) as SavedTracking;

test('bedensiz tükenmiş kayıtta alarm sunulur', () =>
  expect(restockControl(t('out_of_stock'), 'off')).toBe('notify'));

describe('takipBekliyorMu', () => {
  const simdi = Date.parse('2026-10-01T12:00:00.000Z');
  const once = (dk: number) => new Date(simdi - dk * 60_000).toISOString();
  const kayit = (tracking: unknown, dk = 1) => ({ tracking, createdAt: once(dk) }) as never;

  test('yeni kaydedilmiş, hiç kontrol edilmemiş ürün beklenir', () =>
    expect(takipBekliyorMu([kayit(t('pending'))], simdi)).toBe(true));
  test('kontrol bitmiş ürün beklenmez', () =>
    expect(takipBekliyorMu([kayit(t('active'))], simdi)).toBe(false));
  test('boş liste beklenmez', () => expect(takipBekliyorMu([], simdi)).toBe(false));
  test('10 dakikadan eski kayıt beklenmez', () =>
    expect(takipBekliyorMu([kayit(t('pending'), 11)], simdi)).toBe(false));
  test('sınırın hemen içi beklenir', () =>
    expect(takipBekliyorMu([kayit(t('pending'), 9)], simdi)).toBe(true));
  test('daha önce kontrol edilmiş (paylaşılan) ürün beklenmez', () =>
    expect(takipBekliyorMu([kayit({ ...t('pending'), checkedAt: once(60) })], simdi)).toBe(false));
  test('takip bilgisi olmayan kayıt beklenmez', () =>
    expect(takipBekliyorMu([kayit(undefined)], simdi)).toBe(false));
  test('listede bir tane yeni bekleyen yeter', () =>
    expect(
      takipBekliyorMu([kayit(t('active')), kayit(t('pending'), 30), kayit(t('pending'))], simdi),
    ).toBe(true));
});
