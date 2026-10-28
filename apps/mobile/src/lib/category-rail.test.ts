import { describe, expect, test } from 'bun:test';
// Saf TypeScript — `bun test` çalıştırabilir. Rafın gruplama/sıralama kuralı
// arayüzden bağımsız olarak burada doğrulanır.
import { ilkAktifKategori, rafGruplari } from './category-rail';

const kategoriler = [
  { id: 'elbise' },
  { id: 'ayakkabi' },
  { id: 'canta' },
  { id: 'taki' },
  { id: 'hamile' },
];

describe('rafGruplari', () => {
  test('onboardingde seçilenler en üstte ve seçim sırasıyla durur', () => {
    const gruplar = rafGruplari(kategoriler, ['taki', 'elbise'], []);
    expect(gruplar[0]).toEqual({ anahtar: 'secilen', idler: ['taki', 'elbise'] });
  });

  test('popüler grubu seçilenleri tekrarlamaz, kalanlar API sırasını korur', () => {
    const gruplar = rafGruplari(kategoriler, ['taki'], ['elbise', 'taki', 'canta']);
    expect(gruplar).toEqual([
      { anahtar: 'secilen', idler: ['taki'] },
      { anahtar: 'populer', idler: ['elbise', 'canta'] },
      { anahtar: 'tumu', idler: ['ayakkabi', 'hamile'] },
    ]);
  });

  test('seçim yoksa ilk grup hiç render edilmez', () => {
    const gruplar = rafGruplari(kategoriler, [], ['canta']);
    expect(gruplar.map((g) => g.anahtar)).toEqual(['populer', 'tumu']);
  });

  test('popüler liste boşsa yalnız seçilenler ve tümü kalır', () => {
    const gruplar = rafGruplari(kategoriler, ['canta'], []);
    expect(gruplar.map((g) => g.anahtar)).toEqual(['secilen', 'tumu']);
  });

  test('silinmiş kategori id0si ve tekrarlar yok sayılır', () => {
    const gruplar = rafGruplari(kategoriler, ['yok-artik', 'taki', 'taki'], ['yok-artik']);
    expect(gruplar[0]).toEqual({ anahtar: 'secilen', idler: ['taki'] });
    expect(gruplar.map((g) => g.anahtar)).toEqual(['secilen', 'tumu']);
  });

  test('kategori listesi boşken boş dizi döner', () => {
    expect(rafGruplari([], ['taki'], ['canta'])).toEqual([]);
  });
});

describe('ilkAktifKategori', () => {
  test('varsa ilk seçilen kategoriyi açar', () => {
    expect(ilkAktifKategori(kategoriler, ['canta', 'elbise'])).toBe('canta');
  });

  test('seçim yoksa bugünkü davranış: listenin ilki', () => {
    expect(ilkAktifKategori(kategoriler, [])).toBe('elbise');
  });

  test('seçilen kategori artık yoksa listenin ilkine döner', () => {
    expect(ilkAktifKategori(kategoriler, ['yok-artik'])).toBe('elbise');
  });

  test('hiç kategori yoksa null döner', () => {
    expect(ilkAktifKategori([], ['taki'])).toBeNull();
  });
});
