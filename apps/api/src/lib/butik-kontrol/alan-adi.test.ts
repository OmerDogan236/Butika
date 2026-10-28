import { expect, test } from 'bun:test';
import { kokAlanAdi } from './alan-adi';
test('www ve dil yolu aynı kök', () => {
  expect(kokAlanAdi('https://www.minetanbutik.com.tr/')).toBe('minetanbutik.com.tr');
  expect(kokAlanAdi('https://minetanbutik.com.tr/tr/')).toBe('minetanbutik.com.tr');
  expect(kokAlanAdi('https://tr.ilkyazozel.com')).toBe('ilkyazozel.com');
  expect(kokAlanAdi('https://shop.brand.co.uk/x')).toBe('brand.co.uk');
});
test('geçersiz adres null', () => expect(kokAlanAdi('yok')).toBeNull());
test('yeni iki parçalı sonekler ve myshopify', () => {
  expect(kokAlanAdi('https://www.x.web.tr')).toBe('x.web.tr');
  expect(kokAlanAdi('https://a.x.co.za')).toBe('x.co.za');
  expect(kokAlanAdi('https://a.x.com.mx')).toBe('x.com.mx');
  expect(kokAlanAdi('https://magaza.myshopify.com/')).toBe('magaza.myshopify.com');
  expect(kokAlanAdi('https://a.myshopify.com')).not.toBe(kokAlanAdi('https://b.myshopify.com'));
});
