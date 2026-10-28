import { describe, expect, test } from 'bun:test';
import {
  SQL_HARF_HEDEF,
  SQL_HARF_KAYNAK,
  butikAra,
  harfSadelestir,
  sadelestir,
  sartlaraBol,
} from './butik-arama';
import type { BoutiqueRow } from './butikcan-catalog';

function butik(p: Partial<BoutiqueRow> & { id: string; name: string }): BoutiqueRow {
  return {
    description: null,
    categoryNames: 'Giyim',
    categoryIds: ['c-giyim'],
    sortOrder: 0,
    tarz1: null,
    tarz2: null,
    fiyatSegmenti: null,
    etiketler: [],
    ...p,
  };
}

const HAVUZ: BoutiqueRow[] = [
  butik({
    id: 'keten',
    name: 'Keten Ev',
    description: 'Doğal keten elbiseler ve gömlekler',
    tarz1: 'bohem',
    sortOrder: 5,
  }),
  butik({ id: 'lujo', name: 'Lujo Studio', categoryNames: 'Hediyelik', sortOrder: 3 }),
  butik({
    id: 'gece',
    name: 'Nocturne',
    categoryNames: 'Abiye',
    categoryIds: ['c-abiye'],
    sortOrder: 2,
  }),
  butik({
    id: 'canta',
    name: 'Deri Atölye',
    categoryNames: 'Çanta, Deri',
    categoryIds: ['c-canta'],
    sortOrder: 1,
  }),
  butik({
    id: 'mayo',
    name: 'Mavi Kıyı',
    categoryNames: 'Plaj',
    categoryIds: ['c-plaj'],
    sortOrder: 4,
  }),
  butik({ id: 'ic', name: 'Gece Kuşu', categoryNames: 'İç Giyim', categoryIds: ['c-ic'] }),
  butik({ id: 'minimal', name: 'Sade', tarz1: 'günlük', tarz2: 'minimal', sortOrder: 6 }),
  butik({
    id: 'cilt',
    name: 'Flora Lab',
    categoryNames: 'Güzellik',
    categoryIds: ['c-guzellik'],
    etiketler: ['etkin bakım'],
  }),
];

const idler = (sorgu: string, secenek = {}) => butikAra(HAVUZ, sorgu, secenek).map((r) => r.id);

describe('sadelestir', () => {
  test('Türkçe harfleri ve büyük harfi sadeleştirir', () => {
    expect(sadelestir('Çanta İPEK Şal')).toBe('canta ipek sal');
  });
  test('aksanlı harfleri sadeleştirir (Molène → molene)', () => {
    expect(sadelestir('Molène')).toBe('molene');
    expect(sadelestir('Café Crème')).toBe('cafe creme');
  });
});

describe('harfSadelestir', () => {
  test('noktalamayı korur, harfleri sadeleştirir', () => {
    expect(harfSadelestir("Ece'nin Butiği")).toBe("ece'nin butigi");
    expect(harfSadelestir('Nişantaşı Shoes')).toBe('nisantasi shoes');
    expect(harfSadelestir('IŞIK')).toBe('isik');
  });
  test('SQL karşılık tablosu harf harf eşleşir', () => {
    expect([...SQL_HARF_KAYNAK].length).toBe([...SQL_HARF_HEDEF].length + 1); // son: U+0307 silinir
    // Tablodaki her harf (U+0307 hariç), JS sadeleştirmesiyle aynı sonuca gider.
    const kaynak = [...SQL_HARF_KAYNAK].slice(0, -1);
    const hedef = [...SQL_HARF_HEDEF];
    kaynak.forEach((h, i) => {
      expect(harfSadelestir(h)).toBe(hedef[i]!.toLowerCase());
    });
  });
});

describe('butikAra harf farkı', () => {
  test('aksansız yazınca aksanlı adı bulur', () => {
    const havuz = [
      butik({ id: 'molene', name: 'Molène' }),
      butik({ id: 'nis', name: 'Nişantaşı Shoes' }),
    ];
    expect(butikAra(havuz, 'molene', {}).map((r) => r.id)).toEqual(['molene']);
    expect(butikAra(havuz, 'nisantasi', {}).map((r) => r.id)).toEqual(['nis']);
  });
});

describe('sartlaraBol', () => {
  test('çok kelimeli sözlük ifadesi tek şart olur', () => {
    const s = sartlaraBol('gece elbisesi');
    expect(s).toHaveLength(1);
    expect(s[0]?.kavramlar.some((k) => k.deger === 'abiye')).toBe(true);
  });
  test('durak kelimeleri ve tek harfleri atar', () => {
    expect(sartlaraBol('ve a için').length).toBe(0);
  });
});

describe('butikAra', () => {
  test('butik adıyla bulur, Türkçe harf farkı önemsiz', () => {
    expect(idler('deri atolye')[0]).toBe('canta');
    expect(idler('LUJO')).toEqual(['lujo']);
  });
  test('ad boşluksuz yazılsa da bulur', () => {
    expect(idler('lujostudio')).toEqual(['lujo']);
  });
  test('ürün kelimesi kategori eş anlamıyla eşleşir', () => {
    expect(idler('bikini')).toEqual(['mayo']);
    expect(idler('canta')).toContain('canta');
  });
  test('çok kelimeli ifade: gece elbisesi abiye butiğini getirir, iç giyimi değil', () => {
    expect(idler('gece elbisesi')).toEqual(['gece']);
  });
  test('elbise "Giyim" kategorisine uyar, "İç Giyim"e uymaz', () => {
    const s = idler('elbise');
    expect(s).toContain('keten');
    expect(s).not.toContain('ic');
  });
  test('tarzla bulur; tarz1 tarz2den önce gelir', () => {
    expect(idler('bohem')).toEqual(['keten']);
    expect(idler('minimal')).toEqual(['minimal']);
  });
  test('her kelime karşılık bulmalı', () => {
    expect(idler('bohem elbise')).toEqual(['keten']);
  });
  test('karşılığı olmayan kelime (renk) yok sayılır', () => {
    expect(idler('kahverengi çanta')).toEqual(['canta']);
    expect(idler('kahverengi')).toEqual([]);
  });
  test('kelimeler bir arada yoksa boş kalmaz: en az birine uyanlar döner', () => {
    expect(idler('bohem çanta').sort()).toEqual(['canta', 'keten']);
  });
  test('etiketle bulur', () => {
    expect(idler('serum')).toEqual(['cilt']);
  });
  test('açıklamadaki kelimeyle bulur ama ad eşleşmesi önde', () => {
    expect(idler('keten')[0]).toBe('keten');
  });
  test('kategori süzgeci', () => {
    expect(idler('deri', { kategoriId: 'c-giyim' })).toEqual([]);
    expect(idler('deri', { kategoriId: 'c-canta' })).toEqual(['canta']);
  });
  test('kelime ortasında eşleşmez', () => {
    expect(idler('eri')).toEqual([]);
  });
  test('boş sorgu boş döner', () => {
    expect(idler('  ')).toEqual([]);
  });
});
