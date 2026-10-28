import { describe, expect, test } from 'bun:test';
import { ayAdi, aylikOzetMaili, ozetAyi, paraYaz } from './aylik-ozet';

const ozet = {
  kisiSayisi: 42,
  satisAdedi: 3,
  satisTutariMinor: 1234500,
  komisyonMinor: 123450,
  currency: 'TRY',
};

describe('aylikOzetMaili', () => {
  test('deneme: tahsil edilmeyecek notu var', () => {
    const m = aylikOzetMaili('Lujo', 'Ekim 2026', ozet, 'deneme');
    expect(m.text).toContain('tahsil edilmeyecek');
    expect(m.html).toContain('tahsil edilmeyecek');
  });
  test('deneme dışında not yok; tutarlar Türkçe biçimde', () => {
    const m = aylikOzetMaili('Lujo', 'Ekim 2026', ozet, 'ikas');
    expect(m.text).not.toContain('tahsil edilmeyecek');
    expect(m.text).toContain('Komisyon ödemesiyle ilgili ayrıca sizinle iletişime geçeceğiz.');
    expect(m.text).not.toContain('mutat');
    expect(m.text).toContain('42 kişi');
    expect(m.text).toContain('3 satış');
    expect(m.text).toContain('12.345,00 TL');
    expect(m.text).toContain('1.234,50 TL');
  });
  test('butik adı HTML için kaçırılır', () => {
    expect(aylikOzetMaili('A<b>', 'Ekim 2026', ozet, 'deneme').html).toContain('A&lt;b&gt;');
  });
});

test('paraYaz: TL ve diğer para birimleri', () => {
  expect(paraYaz(0, 'TRY')).toBe('0,00 TL');
  expect(paraYaz(1234500, 'USD')).toBe('12.345,00 USD');
});

test('ayAdi', () => {
  expect(ayAdi({ yil: 2026, ay: 10 })).toBe('Ekim 2026');
});

describe('ozetAyi (İstanbul saati)', () => {
  test("ayın 1'i 10:00 öncesi: yok", () => {
    expect(ozetAyi(new Date('2026-11-01T06:59:00Z'))).toBeNull(); // 09:59 İstanbul
  });
  test("ayın 1'i 10:00 sonrası: önceki ay", () => {
    expect(ozetAyi(new Date('2026-11-01T07:00:00Z'))).toEqual({ yil: 2026, ay: 10 });
  });
  test('ayın ilerleyen günleri de önceki ayı verir', () => {
    expect(ozetAyi(new Date('2026-11-15T12:00:00Z'))).toEqual({ yil: 2026, ay: 10 });
  });
  test('UTC ay sonu ama İstanbul yeni ay: 31 Ekim 22:00 UTC = 1 Kasım 01:00', () => {
    expect(ozetAyi(new Date('2026-10-31T22:00:00Z'))).toBeNull();
  });
  test('ocakta önceki yıl aralık', () => {
    expect(ozetAyi(new Date('2027-01-02T10:00:00Z'))).toEqual({ yil: 2026, ay: 12 });
  });
});
