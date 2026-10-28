import { describe, expect, test } from 'bun:test';
import {
  type RaporCevabi,
  type RaporOlayi,
  dagilim,
  fiyatRenkRaporu,
  katilimRaporu,
  kisiBasinaSon,
  oneriRaporu,
  oran,
  senaryoRaporu,
  tarzRaporu,
  yasRaporu,
} from './tarz-testi-rapor';

const gun = (d: number, saat = 12) => new Date(Date.UTC(2026, 8, d, saat));
const cevap = (userId: string, p: Partial<RaporCevabi> = {}): RaporCevabi => ({
  userId,
  testSurumu: 1,
  senaryo: { kahvalti: ['keten_elbise'], davet: ['ucusan_cicekli'], ayakkabi: ['babet'] },
  acikTarzlar: ['bohem'],
  fiyatSegmentleri: ['orta'],
  renkler: [],
  yasAraligi: null,
  tarz1: 'bohem',
  senaryoTarz1: 'bohem',
  favoriTarz1: null,
  esnek: false,
  createdAt: gun(10),
  ...p,
});
const olay = (
  userId: string | null,
  type: string,
  payload: Record<string, unknown> = {},
  d = 10,
): RaporOlayi => ({
  userId,
  type,
  payload,
  createdAt: gun(d),
});

describe('oran ve dağılım', () => {
  test('5 kişiden küçük grupta oran verilmez', () => {
    expect(oran(2, 4)).toBeNull();
    expect(oran(1, 3 + 3)).toBe(16.7);
  });
  test('dağılım adede göre azalan, null değerler sayılmaz', () => {
    expect(dagilim(['bohem', 'sokak', 'bohem', null, 'bohem', 'sokak'], 6)).toEqual([
      { anahtar: 'bohem', adet: 3, oran: 50 },
      { anahtar: 'sokak', adet: 2, oran: 33.3 },
    ]);
  });
});

test('kişi başına en son cevap', () => {
  const son = kisiBasinaSon([
    cevap('a', { tarz1: 'sokak', createdAt: gun(9) }),
    cevap('a', { tarz1: 'bohem', createdAt: gun(11) }),
    cevap('b', { tarz1: 'minimal' }),
  ]);
  expect(son.map((s) => [s.userId, s.tarz1])).toEqual([
    ['a', 'bohem'],
    ['b', 'minimal'],
  ]);
});

test('katılım: başlatan, bitiren, yarıda bırakılan adım (sürüm 1)', () => {
  const r = katilimRaporu(
    [cevap('a'), cevap('a', { createdAt: gun(11) })],
    [
      olay('a', 'tarz_testi_basladi', { testSurumu: 1 }),
      olay('b', 'tarz_testi_basladi', { testSurumu: 1 }),
      olay('b', 'tarz_testi_adim', { testSurumu: 1, adim: 1 }),
      olay('b', 'tarz_testi_adim', { testSurumu: 1, adim: 3 }),
      // testSurumu'suz eski olay sürüm 1 sayılır
      olay('c', 'tarz_testi_basladi', {}, 11),
    ],
  );
  expect([r.baslatan, r.bitiren]).toEqual([3, 1]);
  expect(r.surumler).toHaveLength(1);
  const v1 = r.surumler[0]!;
  expect([v1.testSurumu, v1.baslatan, v1.bitiren, v1.hepsiniAtlayan, v1.yarida]).toEqual([
    1, 3, 1, 0, 2,
  ]);
  expect(v1.birakilanAdim.map((o) => [o.anahtar, o.adet])).toEqual([
    ['0', 1],
    ['3', 1],
  ]);
  expect(v1.kaynaga).toEqual([]);
  expect(r.gunluk).toEqual([
    { gun: '2026-09-10', baslatan: 2, bitiren: 1 },
    { gun: '2026-09-11', baslatan: 1, bitiren: 1 },
  ]);
});

test('katılım: sürüm 1 ve 2 ayrı; hepsini atlayan yarıda sayılmaz; kaynağa göre', () => {
  const v2 = (u: string, adim: number, atlandi = false) =>
    olay(u, 'tarz_testi_adim', { testSurumu: 2, kaynak: 'guncelleme', adim, atlandi });
  const r = katilimRaporu(
    [cevap('eski'), cevap('k1', { testSurumu: 2 }), cevap('k2', { testSurumu: 2 })],
    [
      olay('eski', 'tarz_testi_basladi', { testSurumu: 1 }),
      olay('eski2', 'tarz_testi_basladi', { testSurumu: 1 }),
      olay('eski2', 'tarz_testi_adim', { testSurumu: 1, adim: 4 }),
      olay('k1', 'tarz_testi_basladi', { testSurumu: 2, kaynak: 'onboarding' }),
      olay('k2', 'tarz_testi_basladi', { testSurumu: 2, kaynak: 'guncelleme' }),
      // her adımı atlayıp cevapsız bitiren
      olay('atla', 'tarz_testi_basladi', { testSurumu: 2, kaynak: 'guncelleme' }),
      ...[1, 2, 3, 4].map((a) => v2('atla', a, true)),
      // 2. adımdan sonra çıkan (ör. "Daha sonra")
      olay('cik', 'tarz_testi_basladi', { testSurumu: 2, kaynak: 'guncelleme' }),
      v2('cik', 1),
      v2('cik', 2, true),
      // bilinmeyen kaynak ve sürüm rapora girmez
      olay('x', 'tarz_testi_basladi', { testSurumu: 2, kaynak: '<script>' }),
      olay('y', 'tarz_testi_basladi', { testSurumu: 99 }),
    ],
  );
  expect(r.surumler.map((s) => s.testSurumu)).toEqual([2, 1]);
  const [kisa, uzun] = r.surumler;
  expect([kisa!.baslatan, kisa!.bitiren, kisa!.hepsiniAtlayan, kisa!.yarida]).toEqual([5, 2, 1, 2]);
  expect(kisa!.birakilanAdim.map((o) => [o.anahtar, o.adet])).toEqual([
    ['0', 1],
    ['2', 1],
  ]);
  expect(kisa!.kaynaga).toEqual([
    { kaynak: 'guncelleme', baslatan: 3, bitiren: 1, hepsiniAtlayan: 1, yarida: 1 },
    { kaynak: 'onboarding', baslatan: 1, bitiren: 1, hepsiniAtlayan: 0, yarida: 0 },
  ]);
  // Uzun testte 4. adımda kalan hepsini atlamış sayılmaz.
  expect([uzun!.baslatan, uzun!.bitiren, uzun!.hepsiniAtlayan, uzun!.yarida]).toEqual([2, 1, 0, 1]);
  expect(uzun!.birakilanAdim.map((o) => o.anahtar)).toEqual(['4']);
});

test('katılım: olay ve cevap yoksa sürüm satırı yok', () => {
  expect(katilimRaporu([], [])).toEqual({ baslatan: 0, bitiren: 0, surumler: [], gunluk: [] });
});

test('yaş: yalnız kısa test, boş cevap sayılmaz ama paydada kalır', () => {
  const son: RaporCevabi[] = [
    cevap('a', { testSurumu: 2, yasAraligi: '25_34' }),
    cevap('b', { testSurumu: 2, yasAraligi: '25_34' }),
    cevap('c', { testSurumu: 2, yasAraligi: '35_44' }),
    cevap('d', { testSurumu: 2, yasAraligi: null }),
    cevap('e', { testSurumu: 2, yasAraligi: '18_24' }),
    cevap('f', { testSurumu: 1 }),
  ];
  expect(yasRaporu(son)).toEqual({
    kisi: 5,
    dagilim: [
      { anahtar: '25_34', adet: 2, oran: 40 },
      { anahtar: '18_24', adet: 1, oran: 20 },
      { anahtar: '35_44', adet: 1, oran: 20 },
    ],
  });
});

test('tarz: söylenen ile senaryodan çıkan, favori örtüşmesi', () => {
  const son = [
    cevap('a', {
      acikTarzlar: ['minimal'],
      tarz1: 'minimal',
      senaryoTarz1: 'bohem',
      favoriTarz1: 'minimal',
    }),
    cevap('b', {
      acikTarzlar: ['minimal'],
      tarz1: 'minimal',
      senaryoTarz1: 'minimal',
      favoriTarz1: 'günlük',
    }),
    cevap('c', { esnek: true }),
  ];
  const r = tarzRaporu(son);
  expect(r.kisi).toBe(3);
  const minimal = r.soylenenSecilen.find((s) => s.tarz === 'minimal');
  expect(minimal?.kisi).toBe(2);
  expect(minimal?.senaryo.map((o) => o.anahtar).sort()).toEqual(['bohem', 'minimal']);
  expect(r.favoriOrtusme).toEqual({ kisi: 2, oran: null });
  expect(r.esnekOrani).toBeNull();
});

test('öneri: tıklama oranı, eşleşme türüne göre başarı, öneriden kaydetme', () => {
  const items = (eslesme: string) =>
    ['x', 'y'].map((butikId, i) => ({
      butikId,
      sira: i + 1,
      puan: 1,
      eslesme: i === 0 ? eslesme : 'kategori',
    }));
  const olaylar: RaporOlayi[] = [
    ...['o1', 'o2', 'o3', 'o4', 'o5'].map((oneriId) =>
      olay('u', 'oneri_gosterildi', { oneriId, items: items('test') }),
    ),
    olay('u', 'oneri_tiklandi', { oneriId: 'o1', butikId: 'x', sira: 1 }),
    olay('u', 'oneri_tiklandi', { oneriId: 'o2', butikId: 'y', sira: 2 }),
    olay('u', 'product_saved', { url: 'https://x', kaynak: 'oneri', oneriId: 'o1' }),
    olay('u', 'product_saved', { url: 'https://z' }),
  ];
  const r = oneriRaporu(olaylar);
  expect([r.gosterim, r.tiklama, r.kaydetme]).toEqual([5, 2, 1]);
  expect(r.tiklamaOrani).toBe(40);
  // kaydetmeOrani gösterim başına: 1 kaydetme / 5 gösterim = %20 (tıklama başına değil).
  expect(r.kaydetmeOrani).toBe(20);
  expect(r.eslesmeyeGore).toEqual([
    { eslesme: 'kategori', gosterilen: 5, tiklanan: 1, oran: 20 },
    { eslesme: 'test', gosterilen: 5, tiklanan: 1, oran: 20 },
  ]);
  // 2 tıklama < RAPOR_KUCUK_GRUP(5) → sirayaGore oranı null, sıra dizgeye çevrilip alfabetik sıralanır.
  expect(r.sirayaGore).toEqual([
    { anahtar: '1', adet: 1, oran: null },
    { anahtar: '2', adet: 1, oran: null },
  ]);
  expect(r.enCokTiklanan).toEqual([
    { butikId: 'x', adet: 1 },
    { butikId: 'y', adet: 1 },
  ]);
});

test('öneri: sirayaGore, tıklama sayısı ≥5 ise oran hesaplanır', () => {
  // sira artık oneri_gosterildi öğesindeki sunucu değerinden gelir (istemcinin
  // oneri_tiklandi payload'ındaki sira yoksayılır); bu yüzden dağılım burada
  // items listesindeki sira alanına taşındı.
  const gosterildi = (oneriId: string, sira: number) =>
    olay('u', 'oneri_gosterildi', { oneriId, items: [{ butikId: 'x', sira, eslesme: 'test' }] });
  const olaylar: RaporOlayi[] = [
    gosterildi('o1', 1),
    gosterildi('o2', 1),
    gosterildi('o3', 1),
    gosterildi('o4', 2),
    gosterildi('o5', 2),
    gosterildi('o6', 3),
    olay('u', 'oneri_tiklandi', { oneriId: 'o1', butikId: 'x' }),
    olay('u', 'oneri_tiklandi', { oneriId: 'o2', butikId: 'x' }),
    olay('u', 'oneri_tiklandi', { oneriId: 'o3', butikId: 'x' }),
    olay('u', 'oneri_tiklandi', { oneriId: 'o4', butikId: 'x' }),
    olay('u', 'oneri_tiklandi', { oneriId: 'o5', butikId: 'x' }),
    olay('u', 'oneri_tiklandi', { oneriId: 'o6', butikId: 'x' }),
  ];
  const r = oneriRaporu(olaylar);
  expect(r.tiklama).toBe(6);
  expect(r.sirayaGore).toEqual([
    { anahtar: '1', adet: 3, oran: 50 },
    { anahtar: '2', adet: 2, oran: 33.3 },
    { anahtar: '3', adet: 1, oran: 16.7 },
  ]);
});

test('öneri: eşleşmeyen ve sahte tıklamalar sayılmaz, sira/eşleşme sunucudan gelir', () => {
  const olaylar: RaporOlayi[] = [
    olay('u', 'oneri_gosterildi', {
      oneriId: 'o1',
      items: [{ butikId: 'gercek-butik', sira: 1, eslesme: 'test' }],
    }),
    // 1) bilinmeyen oneriId'ye tıklama (o1 dışında hiçbir liste yok)
    olay('u', 'oneri_tiklandi', { oneriId: 'bilinmeyen', butikId: 'gercek-butik', sira: 1 }),
    // 2) oneriId bilinen ama butikId o listede yok
    olay('u', 'oneri_tiklandi', { oneriId: 'o1', butikId: 'baska-butik', sira: 1 }),
    // 3) butikId eksik → String(undefined) listede eşleşmez
    olay('u', 'oneri_tiklandi', { oneriId: 'o1', sira: 1 }),
    // 4) gerçekten eşleşen tıklama ama istemci sahte sira=5 gönderiyor;
    //    sunucudaki sira=1 kullanılmalı, istemcinin değeri yoksayılmalı.
    olay('u', 'oneri_tiklandi', { oneriId: 'o1', butikId: 'gercek-butik', sira: 5 }),
  ];
  const r = oneriRaporu(olaylar);
  // Yalnız 4. tıklama sayılır; 1-3 yoksayılır.
  expect(r.tiklama).toBe(1);
  expect(r.enCokTiklanan).toEqual([{ butikId: 'gercek-butik', adet: 1 }]);
  // sira sunucudaki oge.sira(=1)'den gelir, istemcinin gönderdiği 5 değil.
  expect(r.sirayaGore).toEqual([{ anahtar: '1', adet: 1, oran: null }]);
  expect(r.eslesmeyeGore).toEqual([{ eslesme: 'test', gosterilen: 1, tiklanan: 1, oran: null }]);
  expect(r.tiklamaOrani).toBeNull();
  expect(r.kaydetmeOrani).toBeNull();
});

test('fiyatRenk: çoklu seçim kişi başına, tarza göre gruplama (tarz1 null hariç), renk dağılımı', () => {
  const son: RaporCevabi[] = [
    cevap('a', { fiyatSegmentleri: ['orta', 'yuksek'], tarz1: 'bohem', renkler: ['pastel'] }),
    cevap('b', { fiyatSegmentleri: ['orta'], tarz1: 'bohem', renkler: ['pastel', 'canli'] }),
    cevap('c', { fiyatSegmentleri: ['uygun'], tarz1: 'minimal', renkler: ['canli'] }),
    cevap('d', { fiyatSegmentleri: ['orta'], tarz1: null, renkler: [] }),
    cevap('e', { fiyatSegmentleri: ['luks'], tarz1: 'minimal', renkler: ['koyu'] }),
  ];
  const r = fiyatRenkRaporu(son);
  // Kısa test renk sormaz: renk oranının paydasına girmez.
  const kisaEkli = [...son, cevap('k', { testSurumu: 2, fiyatSegmentleri: [], tarz1: null })];
  expect(fiyatRenkRaporu(kisaEkli).renk).toEqual(r.renk);
  // Fiyat çoklu seçim: oran kişi sayısına (5) göre, seçim sayısına göre değil.
  expect(r.fiyat).toEqual([
    { anahtar: 'orta', adet: 3, oran: 60 },
    { anahtar: 'luks', adet: 1, oran: 20 },
    { anahtar: 'uygun', adet: 1, oran: 20 },
    { anahtar: 'yuksek', adet: 1, oran: 20 },
  ]);
  // Her tarz grubu 5 kişiden küçük → oran null; tarz1 null olan (d) hiçbir grupta yok.
  expect(r.fiyatTarza).toEqual([
    {
      tarz: 'bohem',
      kisi: 2,
      fiyat: [
        { anahtar: 'orta', adet: 2, oran: null },
        { anahtar: 'yuksek', adet: 1, oran: null },
      ],
    },
    {
      tarz: 'minimal',
      kisi: 2,
      fiyat: [
        { anahtar: 'luks', adet: 1, oran: null },
        { anahtar: 'uygun', adet: 1, oran: null },
      ],
    },
  ]);
  expect(r.renk).toEqual([
    { anahtar: 'canli', adet: 2, oran: 40 },
    { anahtar: 'pastel', adet: 2, oran: 40 },
    { anahtar: 'koyu', adet: 1, oran: 20 },
  ]);
});

test('senaryo: sürüme göre ayrı satır (en yeni önce), soru başına şık sayımı, cevapsız soru elenir', () => {
  const son: RaporCevabi[] = [
    cevap('p1', { testSurumu: 2, senaryo: { kahvalti: ['a'], davet: ['x'] } }),
    cevap('p2', { testSurumu: 2, senaryo: { kahvalti: ['a'] } }),
    cevap('p3', { testSurumu: 2, senaryo: { kahvalti: ['a'] } }),
    cevap('p4', { testSurumu: 2, senaryo: { kahvalti: ['b'] } }),
    cevap('p5', { testSurumu: 2, senaryo: { kahvalti: ['b'] } }),
    cevap('p6', { testSurumu: 1, senaryo: { ayakkabi: ['c'] } }),
  ];
  const r = senaryoRaporu(son);
  expect(r).toEqual([
    {
      testSurumu: 2,
      soru: 'kahvalti',
      kisi: 5,
      siklar: [
        { anahtar: 'a', adet: 3, oran: 60 },
        { anahtar: 'b', adet: 2, oran: 40 },
      ],
    },
    {
      testSurumu: 2,
      soru: 'davet',
      kisi: 1,
      siklar: [{ anahtar: 'x', adet: 1, oran: null }],
    },
    {
      testSurumu: 1,
      soru: 'ayakkabi',
      kisi: 1,
      siklar: [{ anahtar: 'c', adet: 1, oran: null }],
    },
  ]);
});
