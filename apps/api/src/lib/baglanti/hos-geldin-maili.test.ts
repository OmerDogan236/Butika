import { expect, test } from 'bun:test';
import { hosGeldinMaili } from './hos-geldin-maili';

test('hoş geldin maili: butik adı, deneme dönemi, çıkış yolu; indirim kodu yok', () => {
  const m = hosGeldinMaili('Lujo Studio');
  expect(m.text).toContain('Lujo Studio');
  expect(m.text).toContain('deneme');
  expect(m.text).toContain('birkaç saat');
  expect(m.text).toContain('uygulamasını kaldırmanız yeterli');
  expect(m.text).not.toContain('indirim kodu');
  expect(m.subject.length).toBeGreaterThan(0);
  expect(m.html).toContain('Lujo Studio');
});

test('hoş geldin maili: butik adı HTML için kaçırılır', () => {
  expect(hosGeldinMaili('A<b>').html).toContain('A&lt;b&gt;');
});

test('hoş geldin maili: Shopify çıkış yolu; ikas varsayılanı aynı kalır', () => {
  const s = hosGeldinMaili('Casa', 'shopify');
  expect(s.text).toContain('Shopify mağazanız');
  expect(s.text).toContain("Shopify'da Butika uygulamasını kaldırmanız yeterli");
  expect(s.text).not.toContain('ikas');
  expect(hosGeldinMaili('Casa', 'ikas')).toEqual(hosGeldinMaili('Casa'));
  expect(hosGeldinMaili('Casa').text).toContain('ikas panelinizde Butika uygulamasını kaldırmanız');
});
