import { describe, expect, test } from 'bun:test';
import {
  type AramaKaydi,
  GECMIS_SINIRI,
  gecmisAnahtari,
  gecmiseEkle,
  gecmisiOku,
  gecmistenSil,
} from './arama-gecmisi';

const T = '2026-09-30T00:00:00.000Z';
const butik = (id: string, ad = id): AramaKaydi => ({
  tur: 'butik',
  id,
  ad,
  kapak: null,
  tarih: T,
});
const metin = (m: string): AramaKaydi => ({ tur: 'metin', metin: m, tarih: T });

describe('gecmiseEkle', () => {
  test('yeni arama en başa gelir', () => {
    const g = gecmiseEkle([butik('vayu')], butik('jimmy'));
    expect(g.map((k) => (k.tur === 'butik' ? k.id : k.metin))).toEqual(['jimmy', 'vayu']);
  });

  test('aynı butik tekrar aranınca çoğalmaz, yukarı taşınır', () => {
    const g = gecmiseEkle([butik('jimmy'), butik('vayu')], butik('vayu'));
    expect(g.map((k) => (k.tur === 'butik' ? k.id : ''))).toEqual(['vayu', 'jimmy']);
  });

  test('metinler büyük-küçük harf ve boşluk farkıyla aynı sayılır', () => {
    const g = gecmiseEkle([metin('Jimmy  Key')], metin(' jimmy key '));
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ tur: 'metin', metin: 'jimmy key' });
  });

  test('Türkçe İ/i farkı aynı arama sayılır', () => {
    expect(gecmiseEkle([metin('İPEK')], metin('ipek'))).toHaveLength(1);
  });

  test('bir butik ile aynı adlı metin ayrı kayıttır', () => {
    expect(gecmiseEkle([butik('vayu', 'VAYU')], metin('VAYU'))).toHaveLength(2);
  });

  test('tek harflik arama kaydedilmez', () => {
    expect(gecmiseEkle([], metin(' a '))).toHaveLength(0);
  });

  test(`en çok ${GECMIS_SINIRI} kayıt tutulur`, () => {
    let g: AramaKaydi[] = [];
    for (let i = 0; i < GECMIS_SINIRI + 5; i++) g = gecmiseEkle(g, butik(`b${i}`));
    expect(g).toHaveLength(GECMIS_SINIRI);
    expect(g[0]).toMatchObject({ id: `b${GECMIS_SINIRI + 4}` });
  });
});

describe('gecmistenSil', () => {
  test('yalnız o aramayı siler', () => {
    const g = gecmistenSil([butik('a'), metin('elbise'), butik('b')], metin('ELBİSE'));
    expect(g).toHaveLength(2);
  });
});

describe('gecmisiOku', () => {
  test('boş ya da bozuk veri boş liste verir', () => {
    expect(gecmisiOku(null)).toEqual([]);
    expect(gecmisiOku('bozuk{')).toEqual([]);
    expect(gecmisiOku('{"a":1}')).toEqual([]);
  });

  test('geçersiz kayıtları atlar', () => {
    const ham = JSON.stringify([
      butik('a'),
      { tur: 'butik' },
      metin(''),
      { tur: 'x', tarih: T },
      metin('ok'),
    ]);
    expect(gecmisiOku(ham)).toEqual([butik('a'), metin('ok')]);
  });
});

test('her kullanıcının geçmişi ayrı anahtarda', () => {
  expect(gecmisAnahtari('u1')).not.toBe(gecmisAnahtari('u2'));
  expect(gecmisAnahtari(undefined)).toBe('butika.arama.gecmis.misafir');
});
