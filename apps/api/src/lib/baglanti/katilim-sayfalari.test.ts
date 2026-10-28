import { expect, test } from 'bun:test';
import { kurulumSayfasi } from './katilim-sayfalari';

test('kurulum sayfası: ikas varsayılanı değişmez, Shopify kendi çıkış yolunu söyler', () => {
  expect(kurulumSayfasi('bagli')).toEqual(kurulumSayfasi('bagli', 'ikas'));
  expect(kurulumSayfasi('bagli')).not.toContain('Shopify');
  expect(kurulumSayfasi('gecersiz')).toContain('ikas panelinizden');
  const bagli = kurulumSayfasi('bagli', 'shopify');
  expect(bagli).toContain('bağlantınız açık');
  expect(bagli).toContain('Shopify&#39;da Butika uygulamasını kaldırmanız yeterli');
  expect(kurulumSayfasi('gecersiz', 'shopify')).not.toContain('ikas');
  expect(kurulumSayfasi('bagli_degil', 'shopify')).toContain('davet linki');
});
