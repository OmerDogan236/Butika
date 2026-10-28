import { describe, expect, test } from 'bun:test';
import { type OneriAdayi, type OneriGirdisi, onerileriSec } from './oneriler';

let sayac = 0;
const aday = (p: Partial<OneriAdayi> & { id: string }): OneriAdayi => ({
  name: p.id,
  coverImageUrl: `https://img/${p.id}.jpg`,
  tarz1: null,
  tarz2: null,
  fiyatSegmenti: null,
  kategoriSiralari: {},
  createdAt: new Date(2026, 0, 1, 0, 0, sayac++),
  ...p,
});

const girdi = (p: Partial<OneriGirdisi> = {}): OneriGirdisi => ({
  testPuanlari: null,
  favoriPuanlari: {},
  fiyatSegmentleri: [],
  ilgiKategorileri: new Set(),
  onboardingKategorileri: [],
  esnek: false,
  haricButikler: new Set(),
  ...p,
});

const idler = (o: { id: string }[]) => o.map((x) => x.id);

describe('öneri seçimi', () => {
  test('test tarzıyla eşleşen öne çıkar, ana tarz ikinciden ağır basar', () => {
    const sonuc = onerileriSec(
      [
        aday({ id: 'ikinci', tarz1: 'minimal', tarz2: 'bohem' }),
        aday({ id: 'ana', tarz1: 'bohem' }),
        aday({ id: 'alakasiz', tarz1: 'sokak' }),
      ],
      girdi({ testPuanlari: { bohem: 8, romantik: 3 } }),
    );
    expect(idler(sonuc)).toEqual(['ana', 'ikinci']);
    expect(sonuc[0]?.eslesme).toBe('test');
    expect(sonuc[0]?.puan).toBeCloseTo(3);
  });

  test('favori butikler önerilmez', () => {
    const sonuc = onerileriSec(
      [aday({ id: 'favori', tarz1: 'bohem' }), aday({ id: 'yeni', tarz1: 'bohem' })],
      girdi({ testPuanlari: { bohem: 1 }, haricButikler: new Set(['favori']) }),
    );
    expect(idler(sonuc)).toEqual(['yeni']);
  });

  test('fiyat: seçilen aralık 2, komşu aralık 0.5, uzak aralık 0', () => {
    const sonuc = onerileriSec(
      [
        aday({ id: 'uzak', tarz1: 'bohem', fiyatSegmenti: 'luks' }),
        aday({ id: 'komsu', tarz1: 'bohem', fiyatSegmenti: 'yuksek' }),
        aday({ id: 'tam', tarz1: 'bohem', fiyatSegmenti: 'orta' }),
      ],
      girdi({ testPuanlari: { bohem: 1 }, fiyatSegmentleri: ['orta'] }),
    );
    expect(idler(sonuc)).toEqual(['tam', 'komsu', 'uzak']);
    expect(sonuc.map((o) => o.puan)).toEqual([5, 3.5, 3]);
  });

  test('favori tarzı ve ortak kategori puan verir', () => {
    const sonuc = onerileriSec(
      [
        aday({ id: 'kategori', kategoriSiralari: { k1: 0 } }),
        aday({ id: 'favori', tarz1: 'günlük' }),
        aday({ id: 'hic' }),
      ],
      girdi({ favoriPuanlari: { günlük: 4 }, ilgiKategorileri: new Set(['k1']) }),
    );
    expect(idler(sonuc)).toEqual(['favori', 'kategori']);
    expect(sonuc.map((o) => o.eslesme)).toEqual(['favori', 'kategori']);
  });

  test('esnek kullanıcıda aynı ana tarzdan en fazla 3 butik', () => {
    const adaylar = [
      ...['b1', 'b2', 'b3', 'b4', 'b5'].map((id) => aday({ id, tarz1: 'bohem' })),
      aday({ id: 'r1', tarz1: 'romantik' }),
    ];
    const g = { testPuanlari: { bohem: 8, romantik: 2 } };
    expect(idler(onerileriSec(adaylar, girdi({ ...g, esnek: true })))).toEqual([
      'b1',
      'b2',
      'b3',
      'r1',
    ]);
    expect(onerileriSec(adaylar, girdi(g))).toHaveLength(6);
  });

  test('beraberlikte admin sırası, sonra eklenme tarihi', () => {
    const sonuc = onerileriSec(
      [
        aday({ id: 'eski-sira5', tarz1: 'bohem', kategoriSiralari: { k1: 5 } }),
        aday({ id: 'yeni-sira1', tarz1: 'bohem', kategoriSiralari: { k1: 9, k2: 1 } }),
      ],
      girdi({ testPuanlari: { bohem: 1 } }),
    );
    expect(idler(sonuc)).toEqual(['yeni-sira1', 'eski-sira5']);
  });

  test('en fazla adet kadar döner', () => {
    const adaylar = Array.from({ length: 15 }, (_, i) => aday({ id: `b${i}`, tarz1: 'bohem' }));
    expect(onerileriSec(adaylar, girdi({ testPuanlari: { bohem: 1 } }))).toHaveLength(10);
  });

  test('test ve favori yoksa onboarding kategorilerinden sırayla birer tane', () => {
    const sonuc = onerileriSec(
      [
        aday({ id: 'a2', kategoriSiralari: { a: 2 } }),
        aday({ id: 'a1', kategoriSiralari: { a: 1 } }),
        aday({ id: 'b1', kategoriSiralari: { b: 1 } }),
        aday({ id: 'ab', kategoriSiralari: { a: 3, b: 0 } }),
        aday({ id: 'c1', kategoriSiralari: { c: 0 } }),
      ],
      girdi({ onboardingKategorileri: ['a', 'b'], ilgiKategorileri: new Set(['a', 'b']) }),
    );
    expect(idler(sonuc)).toEqual(['a1', 'ab', 'a2', 'b1']);
    expect(sonuc.every((o) => o.eslesme === 'onboarding')).toBe(true);
  });

  test('hiçbir sinyal yoksa boş liste', () => {
    expect(onerileriSec([aday({ id: 'x', tarz1: 'bohem' })], girdi())).toEqual([]);
  });

  test('test var ama hiç eşleşme yoksa onboarding yedeğine düşer', () => {
    const sonuc = onerileriSec(
      [aday({ id: 'k', tarz1: 'sokak', kategoriSiralari: { a: 0 } })],
      girdi({ testPuanlari: { bohem: 1 }, onboardingKategorileri: ['a'] }),
    );
    expect(idler(sonuc)).toEqual(['k']);
    expect(sonuc[0]?.eslesme).toBe('onboarding');
  });
});
