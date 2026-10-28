import { describe, expect, test } from 'bun:test';
import type { ProfilKaynagi } from '@butika/db';
import {
  type RaporProfili,
  davranisTarzi,
  enSikSegment,
  profilListeSatiri,
  profilOzeti,
  testDavranisFarki,
  vitrinAcmaRaporu,
} from './profil-rapor';

const p = (kaynak: ProfilKaynagi, ek: Partial<RaporProfili> = {}): RaporProfili => ({
  userId: '0123456789abcdef-0000-0000-0000-000000000000',
  kaynak,
  tarz: { minimal: 1, bohem: 0.5 },
  butce: { segmentler: { orta: 1, luks: 0.2 }, ortanca: { TRY: 120_000 } },
  kategoriler: { k1: 1, k2: 0.6, k3: 0.2 },
  yasAraligi: '25_34',
  kayitSayisi: 4,
  guncellendi: new Date('2026-10-20T10:00:00Z'),
  ...ek,
});

describe('profilOzeti', () => {
  const profiller = [
    ...Array.from({ length: 4 }, () => p('karisik')),
    p('test', { tarz: { bohem: 1 }, butce: { segmentler: { uygun: 1 }, ortanca: {} } }),
    p('davranis', { yasAraligi: null, kategoriler: { k2: 1 } }),
    p('bos', { tarz: {}, butce: { segmentler: {}, ortanca: {} }, kategoriler: {} }),
  ];
  const o = profilOzeti(profiller);

  test('profil sayısı ve kaynak kırılımı (tüm profiller)', () => {
    expect(o.profil).toBe(7);
    expect(o.dolu).toBe(6);
    expect(o.kaynak).toEqual([
      { anahtar: 'karisik', adet: 4, oran: 57.1 },
      { anahtar: 'bos', adet: 1, oran: 14.3 },
      { anahtar: 'davranis', adet: 1, oran: 14.3 },
      { anahtar: 'test', adet: 1, oran: 14.3 },
    ]);
  });
  test('tarz (birinci tarz) ve bütçe (en yüksek segment) bos dışındakilerden', () => {
    expect(o.tarz).toEqual([
      { anahtar: 'minimal', adet: 5, oran: 83.3 },
      { anahtar: 'bohem', adet: 1, oran: 16.7 },
    ]);
    expect(o.butce.map((x) => [x.anahtar, x.adet])).toEqual([
      ['orta', 5],
      ['uygun', 1],
    ]);
  });
  test('yaş ve en çok ilgi gören kategoriler (puanı ≥ 0.5)', () => {
    expect(o.yas).toEqual([{ anahtar: '25_34', adet: 5, oran: 83.3 }]);
    expect(o.kategoriler.map((x) => [x.anahtar, x.adet])).toEqual([
      ['k2', 6],
      ['k1', 5],
    ]);
  });
  test('5 kişiden küçük grupta oran gizlenir', () => {
    const az = profilOzeti([p('test'), p('karisik')]);
    expect(az.tarz).toEqual([{ anahtar: 'minimal', adet: 2, oran: null }]);
  });
  test('hiç profil yoksa boş', () => {
    expect(profilOzeti([])).toEqual({
      profil: 0,
      dolu: 0,
      kaynak: [],
      tarz: [],
      butce: [],
      yas: [],
      kategoriler: [],
    });
  });
});

describe('davranisTarzi ve enSikSegment', () => {
  test('tarz1 tam, tarz2 yarım; eşitlikte ad sırası', () => {
    expect(
      davranisTarzi([
        { tarz1: 'bohem', tarz2: 'minimal', fiyatSegmenti: null },
        { tarz1: 'sokak', tarz2: null, fiyatSegmenti: null },
        { tarz1: null, tarz2: 'minimal', fiyatSegmenti: null },
        { tarz1: null, tarz2: 'minimal', fiyatSegmenti: null },
      ]),
    ).toBe('minimal'); // 3 × 0.5 = 1.5 > bohem 1
    expect(
      davranisTarzi([
        { tarz1: 'sokak', tarz2: null, fiyatSegmenti: null },
        { tarz1: 'bohem', tarz2: null, fiyatSegmenti: null },
      ]),
    ).toBe('bohem');
    expect(davranisTarzi([{ tarz1: null, tarz2: null, fiyatSegmenti: 'orta' }])).toBeNull();
  });
  test('en sık segment; yoksa null', () => {
    expect(
      enSikSegment([
        { tarz1: null, tarz2: null, fiyatSegmenti: 'orta' },
        { tarz1: null, tarz2: null, fiyatSegmenti: 'luks' },
        { tarz1: null, tarz2: null, fiyatSegmenti: 'orta' },
      ]),
    ).toBe('orta');
    expect(enSikSegment([{ tarz1: 'x', tarz2: null, fiyatSegmenti: null }])).toBeNull();
  });
});

describe('testDavranisFarki', () => {
  const kayit = (tarz1: string | null, fiyatSegmenti: string | null) => ({
    tarz1,
    tarz2: null,
    fiyatSegmenti,
  });
  const kisi = (
    test: { tarz1: string | null; tarz2: string | null; fiyatSegmentleri: string[] } | null,
    kayitlar: ReturnType<typeof kayit>[],
  ) => ({ test, kayitlar });

  test('yalnız testi ve en az 3 kaydı olanlar karşılaştırılır', () => {
    const f = testDavranisFarki([
      kisi(null, [kayit('bohem', 'orta'), kayit('bohem', 'orta'), kayit('bohem', 'orta')]),
      kisi({ tarz1: 'bohem', tarz2: null, fiyatSegmentleri: ['orta'] }, [kayit('bohem', 'orta')]),
    ]);
    expect(f.tarz.kisi).toBe(0);
    expect(f.butce.kisi).toBe(0);
  });

  test('davranışın birinci tarzı testin tarz1/tarz2sindeyse uyuşur; bütçe seçilenlerdeyse', () => {
    const uc = (t: string, s: string | null) => [kayit(t, s), kayit(t, s), kayit(t, s)];
    const f = testDavranisFarki([
      kisi({ tarz1: 'bohem', tarz2: null, fiyatSegmentleri: ['orta'] }, uc('bohem', 'orta')),
      kisi({ tarz1: 'sokak', tarz2: 'bohem', fiyatSegmentleri: ['uygun'] }, uc('bohem', 'luks')),
      kisi({ tarz1: 'minimal', tarz2: null, fiyatSegmentleri: ['orta'] }, uc('bohem', 'orta')),
      kisi({ tarz1: 'minimal', tarz2: null, fiyatSegmentleri: [] }, uc('minimal', 'orta')),
      kisi({ tarz1: 'minimal', tarz2: null, fiyatSegmentleri: ['orta'] }, uc('minimal', null)),
    ]);
    expect(f.tarz).toEqual({ kisi: 5, uyusan: 4, oran: 80 });
    // Bütçe: testte segment seçmeyen ve kayıtlarında segment olmayan sayılmaz
    expect(f.butce).toEqual({ kisi: 3, uyusan: 2, oran: null });
  });
});

describe('profilListeSatiri', () => {
  const ad = new Map([
    ['k1', 'Giyim'],
    ['k2', 'Çanta'],
  ]);
  test('isimsiz: kısa kimlik, ilk iki tarz, bütçe ≥ 0.5, ilk üç ilgi (adla)', () => {
    expect(profilListeSatiri(p('karisik'), ad)).toEqual({
      kisaKimlik: '01234567',
      kaynak: 'karisik',
      tarzlar: ['minimal', 'bohem'],
      butce: ['orta'],
      ortanca: { TRY: 120_000 },
      ilgiAlanlari: ['Giyim', 'Çanta', 'k3'],
      kayitSayisi: 4,
      guncellendi: '2026-10-20T10:00:00.000Z',
    });
  });
  test('isim/e-posta yalnız kimlik verilirse eklenir', () => {
    const s = profilListeSatiri(p('test'), ad, { ad: 'Ayşe', eposta: 'a@example.com' });
    expect(s.ad).toBe('Ayşe');
    expect(s.eposta).toBe('a@example.com');
    expect('ad' in profilListeSatiri(p('test'), ad)).toBe(false);
    expect('eposta' in profilListeSatiri(p('test'), ad)).toBe(false);
  });
});

describe('vitrinAcmaRaporu', () => {
  const olay = (userId: string | null, payload: Record<string, unknown>) => ({
    userId,
    type: 'boutique_view',
    payload,
    createdAt: new Date(),
  });
  test('vitrinden açmalar sıralamaya göre; diğer kaynak ve sıralamalar atlanır', () => {
    const olaylar = [
      ...['u1', 'u2', 'u3', 'u4', 'u5'].map((u) =>
        olay(u, { kaynak: 'vitrin', siralama: 'kisisel' }),
      ),
      olay('u1', { kaynak: 'vitrin', siralama: 'kisisel' }),
      olay('u6', { kaynak: 'vitrin', siralama: 'onerilen' }),
      olay('u6', { kaynak: 'vitrin', siralama: 'onerilen' }),
      olay('u7', { kaynak: 'vitrin', siralama: 'uygun_once' }),
      olay('u8', { kaynak: 'arama', siralama: 'kisisel' }),
      olay('u9', { kaynak: 'vitrin' }),
      olay(null, { kaynak: 'vitrin', siralama: 'kisisel' }),
      { ...olay('u1', { kaynak: 'vitrin', siralama: 'kisisel' }), type: 'webview_open' },
    ];
    expect(vitrinAcmaRaporu(olaylar)).toEqual([
      { siralama: 'kisisel', kisi: 5, acma: 6, kisiBasina: 1.2 },
      { siralama: 'onerilen', kisi: 1, acma: 2, kisiBasina: null },
    ]);
  });
});
