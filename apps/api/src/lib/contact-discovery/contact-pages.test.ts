import { describe, expect, test } from 'bun:test';
import { iletisimSayfalariniSec } from './contact-pages';

const sec = (html: string, base = 'https://marka.com/') =>
  iletisimSayfalariniSec(html, base).map((x) => `${x.pageType}:${new URL(x.url).pathname}`);

describe('iletisimSayfalariniSec', () => {
  test('iletisim linkini bulur', () => {
    const html = '<a href="/iletisim">İletişim</a>';
    expect(sec(html)).toEqual(['iletisim:/iletisim']);
  });

  test('link metninden anlar, adres anlamsiz olsa bile', () => {
    const html = '<a href="/sayfa/12">Bize Ulaşın</a>';
    expect(sec(html)).toEqual(['iletisim:/sayfa/12']);
  });

  test('ingilizce contact-us', () => {
    const html = '<a href="/pages/contact-us">Contact</a>';
    expect(sec(html)).toEqual(['iletisim:/pages/contact-us']);
  });

  test('sayfalar oncelik sirasina gore doner', () => {
    const html = `
      <a href="/hakkimizda">Hakkımızda</a>
      <a href="/iletisim">İletişim</a>
      <a href="/destek">Müşteri Hizmetleri</a>`;
    expect(sec(html)).toEqual(['iletisim:/iletisim', 'hakkimizda:/hakkimizda', 'destek:/destek']);
  });

  test('en fazla 4 sayfa — butun site taranmaz', () => {
    const html = `
      <a href="/iletisim">İletişim</a><a href="/kurumsal">Kurumsal</a>
      <a href="/hakkimizda">Hakkımızda</a><a href="/sss">SSS</a>
      <a href="/contact">Contact</a><a href="/about">About</a>`;
    expect(sec(html).length).toBeLessThanOrEqual(4);
  });

  test('ayni turden ikinci sayfa eklenmez', () => {
    const html = '<a href="/iletisim">İletişim</a><a href="/contact">Contact</a>';
    expect(sec(html)).toEqual(['iletisim:/iletisim']);
  });

  test('dis baglantilar alinmaz', () => {
    const html = '<a href="https://instagram.com/marka">İletişim</a>';
    expect(sec(html)).toEqual([]);
  });

  test('sepet, urun, blog gibi sayfalar elenir', () => {
    const html = '<a href="/urun/iletisim-elbise">İletişim Elbise</a><a href="/sepet">Sepet</a>';
    expect(sec(html)).toEqual([]);
  });

  test('mailto ve tel linkleri sayfa sanilmaz', () => {
    const html = '<a href="mailto:info@marka.com">İletişim</a><a href="tel:+90">Ara</a>';
    expect(sec(html)).toEqual([]);
  });

  test('gorece adres mutlak adrese cevrilir', () => {
    const html = '<a href="iletisim.html">İletişim</a>';
    expect(iletisimSayfalariniSec(html, 'https://marka.com/')[0]?.url).toBe(
      'https://marka.com/iletisim.html',
    );
  });

  test('www farki ayni site sayilir', () => {
    const html = '<a href="https://www.marka.com/iletisim">İletişim</a>';
    expect(sec(html, 'https://marka.com/')).toEqual(['iletisim:/iletisim']);
  });

  test('link yoksa bos dizi', () => {
    expect(sec('<p>Marka</p>')).toEqual([]);
  });
});
