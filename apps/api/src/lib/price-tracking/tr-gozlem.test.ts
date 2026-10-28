import { expect, test } from 'bun:test';
import { type TrGozlem, gozlemDogrula } from './tr-gozlem';

const simdi = new Date('2026-10-05T09:00:00Z');
const gozlem = (degisen: Partial<TrGozlem> = {}): TrGozlem => ({
  id: 'x',
  priceMinor: 119900,
  currency: 'TRY',
  availability: 'in_stock',
  observedAt: '2026-10-05T08:55:00Z',
  ...degisen,
});
const urun = {
  trackingStatus: 'active',
  notificationBaselinePriceMinor: 119900,
  notificationBaselineCurrency: 'TRY',
};

test('geçerli Türkiye gözlemi kabul edilir', () => {
  expect(gozlemDogrula(gozlem(), urun, 'TR', simdi)).toBeNull();
  // Taban hâlâ eski avro kaydıysa ilk TL gözlemi kabul edilir (indirim sayılmaz; kayıt akışı).
  expect(
    gozlemDogrula(
      gozlem(),
      { ...urun, notificationBaselineCurrency: 'EUR', notificationBaselinePriceMinor: 2299 },
      'TR',
      simdi,
    ),
  ).toBeNull();
});

test('pazar, para birimi, zaman ve takip durumu korunur', () => {
  expect(gozlemDogrula(gozlem(), null, 'TR', simdi)).toBe('ürün bulunamadı');
  expect(gozlemDogrula(gozlem(), { ...urun, trackingStatus: 'paused' }, 'TR', simdi)).toBe(
    'takip aktif değil',
  );
  expect(gozlemDogrula(gozlem(), urun, 'US', simdi)).toBe('butik Türkiye pazarında değil (US)');
  expect(gozlemDogrula(gozlem({ currency: 'EUR' }), urun, 'TR', simdi)).toBe(
    'para birimi TRY değil (EUR)',
  );
  expect(gozlemDogrula(gozlem({ priceMinor: 0 }), urun, 'TR', simdi)).toBe('geçersiz fiyat');
  expect(gozlemDogrula(gozlem({ observedAt: '2026-10-05T05:00:00Z' }), urun, 'TR', simdi)).toBe(
    'gözlem 3 saatten eski',
  );
  expect(gozlemDogrula(gozlem({ observedAt: '2026-10-05T10:00:00Z' }), urun, 'TR', simdi)).toBe(
    'geçersiz gözlem zamanı',
  );
});

test('bir günde %60 üstü düşüş okuma hatası sayılır, gönderilmez', () => {
  expect(gozlemDogrula(gozlem({ priceMinor: 40000 }), urun, 'TR', simdi)).toBe(
    'şüpheli düşüş (%60 üstü), elle bakılmalı',
  );
  expect(gozlemDogrula(gozlem({ priceMinor: 60000 }), urun, 'TR', simdi)).toBeNull();
});
