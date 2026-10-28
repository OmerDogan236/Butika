import { describe, expect, test } from 'bun:test';
import { hedefYasAlanlari } from './hedef-yas';

describe('hedefYasAlanlari', () => {
  test('alan gelmediyse dokunmaz', () => {
    expect(hedefYasAlanlari(['18_24'], undefined)).toEqual({});
  });
  test('değiştiyse kaydeder ve yuksek yapar', () => {
    expect(hedefYasAlanlari(null, ['25_34', '35_44'])).toEqual({
      hedefYaslar: ['25_34', '35_44'],
      yasGuven: 'yuksek',
    });
  });
  test('aynı küme (sıra farkı) değişiklik sayılmaz', () => {
    expect(hedefYasAlanlari(['35_44', '25_34'], ['25_34', '35_44'])).toEqual({});
  });
  test('boş liste ve null temizler', () => {
    expect(hedefYasAlanlari(['18_24'], [])).toEqual({ hedefYaslar: null, yasGuven: null });
    expect(hedefYasAlanlari(['18_24'], null)).toEqual({ hedefYaslar: null, yasGuven: null });
  });
  test('zaten boşken boş gelirse dokunmaz', () => {
    expect(hedefYasAlanlari(null, [])).toEqual({});
  });
  test('tekrarları eler', () => {
    expect(hedefYasAlanlari(null, ['18_24', '18_24'])).toEqual({
      hedefYaslar: ['18_24'],
      yasGuven: 'yuksek',
    });
  });
  test('emin olunmayan tahmin aynen kaydedilince onaylanmış sayılır', () => {
    expect(hedefYasAlanlari(['25_34'], ['25_34'], 'dusuk')).toEqual({ yasGuven: 'yuksek' });
  });
  test('zaten onaylıysa aynı değer dokunmaz', () => {
    expect(hedefYasAlanlari(['25_34'], ['25_34'], 'yuksek')).toEqual({});
  });
  test('alan gelmediyse emin olunmayan tahmin onaylanmaz', () => {
    expect(hedefYasAlanlari(['25_34'], undefined, 'dusuk')).toEqual({});
  });
  test('emin olunmayan tahmin değiştirilince yeni değer yuksek', () => {
    expect(hedefYasAlanlari(['25_34'], ['35_44'], 'dusuk')).toEqual({
      hedefYaslar: ['35_44'],
      yasGuven: 'yuksek',
    });
  });
});
