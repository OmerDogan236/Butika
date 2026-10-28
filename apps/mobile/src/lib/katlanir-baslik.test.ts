import { describe, expect, test } from 'bun:test';
import { blokuKapatmaKaydirmasi, listeEnAzYukseklik, ustBlokKaymasi } from './katlanir-baslik';

describe('ustBlokKaymasi', () => {
  test('en üstte ve yenile çekişinde (eksi kaydırma) blok yerinde', () => {
    expect(ustBlokKaymasi(0, 300)).toBe(0);
    expect(ustBlokKaymasi(-80, 300)).toBe(0);
  });
  test('kaydırma kadar kayar', () => expect(ustBlokKaymasi(120, 300)).toBe(120));
  test('blok yüksekliğinde durur', () => {
    expect(ustBlokKaymasi(300, 300)).toBe(300);
    expect(ustBlokKaymasi(2000, 300)).toBe(300);
  });
  test('blok yoksa hiç kaymaz', () => {
    expect(ustBlokKaymasi(500, 0)).toBe(0);
    expect(ustBlokKaymasi(500, -1)).toBe(0);
  });
});

describe('listeEnAzYukseklik', () => {
  test('ölçülmeden önce sınır yok', () => expect(listeEnAzYukseklik(0, 300)).toBeUndefined());
  test('görünür liste + blok', () => expect(listeEnAzYukseklik(500, 300)).toBe(800));
  test('blok yoksa görünür liste', () => expect(listeEnAzYukseklik(500, 0)).toBe(500));
});

describe('blokuKapatmaKaydirmasi', () => {
  test('blok açıksa blok yüksekliğine', () => {
    expect(blokuKapatmaKaydirmasi(0, 300)).toBe(300);
    expect(blokuKapatmaKaydirmasi(120, 300)).toBe(300);
  });
  test('zaten kapalıysa ya da blok yoksa dokunma', () => {
    expect(blokuKapatmaKaydirmasi(300, 300)).toBeNull();
    expect(blokuKapatmaKaydirmasi(900, 300)).toBeNull();
    expect(blokuKapatmaKaydirmasi(0, 0)).toBeNull();
  });
});
