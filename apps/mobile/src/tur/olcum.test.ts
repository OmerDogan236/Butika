import { describe, expect, test } from 'bun:test';
import { olcumuDuzelt } from './olcum';

// Android'de `measureInWindow` y degerinden durum cubugu yuksekligini DAIMA
// cikarir (React Native #19497, #50509). Uygulama edge-to-edge oldugu icin
// pencere tum ekrani kaplar ve tur katmani da tam ekrana cizer — yani olculen
// y, gercek konumdan durum cubugu kadar EKSIK gelir ve her vurgu o kadar
// yukari kayar. iOS'ta boyle bir cikarma yoktur.
//
// 7 Eylul 2026 Android testinde olculen: durum cubugu 136px, vurgular tam o
// kadar yukarida cikti (dort ayri hedefte).

const OLCULEN = { x: 40, y: 22, genislik: 300, yukseklik: 138 };

describe('olcumuDuzelt', () => {
  test('Android: durum cubugu yuksekligi y-ye GERI eklenir', () => {
    expect(olcumuDuzelt(OLCULEN, 'android', 136).y).toBe(158);
  });

  test('iOS: olcum dogru gelir, dokunulmaz', () => {
    expect(olcumuDuzelt(OLCULEN, 'ios', 47)).toEqual(OLCULEN);
  });

  test('ust inset 0 iken Android de degismez (tam ekran/gizli durum cubugu)', () => {
    expect(olcumuDuzelt(OLCULEN, 'android', 0)).toEqual(OLCULEN);
  });

  test('x, genislik ve yukseklik ASLA degismez — kayma yalniz dikey', () => {
    const d = olcumuDuzelt(OLCULEN, 'android', 136);
    expect(d.x).toBe(OLCULEN.x);
    expect(d.genislik).toBe(OLCULEN.genislik);
    expect(d.yukseklik).toBe(OLCULEN.yukseklik);
  });

  test('girdi nesnesi mutasyona ugramaz', () => {
    const girdi = { ...OLCULEN };
    olcumuDuzelt(girdi, 'android', 136);
    expect(girdi).toEqual(OLCULEN);
  });

  test('web gibi bilinmeyen platformda dokunulmaz', () => {
    expect(olcumuDuzelt(OLCULEN, 'web', 136)).toEqual(OLCULEN);
  });
});
