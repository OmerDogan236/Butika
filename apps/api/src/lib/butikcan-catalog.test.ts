import { describe, expect, test } from 'bun:test';
import {
  type BoutiqueRow,
  PROFIL_ONCELIK_ADEDI,
  adaylariSec,
  detectIntent,
  enAzTamamla,
  line,
  mevsimGenislet,
  onElemeSorusu,
  oneCikaniBasaAl,
  profiliUygula,
  profilliAdaylariSec,
  scoreRow,
} from './butikcan-catalog';

const row = (over: Partial<BoutiqueRow>): BoutiqueRow => ({
  id: 'id',
  name: 'Butik',
  description: '',
  categoryNames: 'Giyim',
  sortOrder: 0,
  tarz1: null,
  tarz2: null,
  fiyatSegmenti: null,
  ...over,
});

describe('Butikcan tarz ve fiyat eşleştirmesi', () => {
  test('mesajdan tarz ve bütçe niyeti çıkarılır', () => {
    const i = detectIntent('Bohem, salaş ve uygun fiyatlı bir elbise arıyorum');
    expect([...i.tarzlar]).toEqual(['bohem']);
    expect([...i.segmentler]).toEqual(['uygun']);
    expect([...detectIntent('lüks bir abiye').segmentler].sort()).toEqual(['luks', 'yuksek']);
    expect(detectIntent('bana uygun bir beden').segmentler.size).toBe(0); // "uygun" tek başına fiyat değil
  });

  test('tarzı ve fiyatı uyan butik öne geçer', () => {
    const intent = detectIntent('romantik ve uygun fiyatlı');
    const uyan = row({ tarz1: 'romantik', fiyatSegmenti: 'uygun' });
    const ikincil = row({ tarz1: 'günlük', tarz2: 'romantik', fiyatSegmenti: 'luks' });
    const alakasiz = row({ tarz1: 'sokak', fiyatSegmenti: 'orta' });
    expect(scoreRow(uyan, [], intent)).toBe(7);
    expect(scoreRow(ikincil, [], intent)).toBe(2);
    expect(scoreRow(alakasiz, [], intent)).toBe(0);
  });

  test('eşanlam köprüsü: kullanıcının kelimesi doğru kategoriye bağlanır', () => {
    expect([...detectIntent('doğal kozmetik önerir misin').kategoriler]).toEqual(['güzellik']);
    expect([...detectIntent('cilt bakımı için bir şeyler').kategoriler]).toEqual(['güzellik']);
    expect([...detectIntent('niş parfüm arıyorum').kategoriler]).toEqual(['parfüm & koku']);
    expect([...detectIntent('bir çanta lazım').kategoriler]).toEqual(['çanta']);
  });

  test('kategorisi eşleşen butik elemeyi geçer (eskiden geçemiyordu)', () => {
    const intent = detectIntent('doğal kozmetik önerir misin');
    const guzellik = row({ name: 'Rosece', categoryNames: 'Güzellik' });
    const giyim = row({ name: 'Bir Butik', categoryNames: 'Giyim' });
    expect(scoreRow(guzellik, [], intent)).toBeGreaterThan(0);
    expect(scoreRow(guzellik, [], intent)).toBeGreaterThan(scoreRow(giyim, [], intent));
  });

  test('Türkçe ekler eşleşir ama benzeyen kelimeler tetiklemez', () => {
    expect(detectIntent('çantalar').kategoriler.has('çanta')).toBe(true);
    expect(detectIntent('elbiseyi beğendim').kategoriler.has('giyim')).toBe(true);
    // "derin" kelimesi "deri" kategorisini açmamalı
    expect(detectIntent('derin bir dekolte').kategoriler.has('deri')).toBe(false);
  });

  test('kategori adının sonundaki boşluk eşleşmeyi bozmaz', () => {
    const intent = detectIntent('hamile kıyafeti');
    expect(scoreRow(row({ categoryNames: 'Hamile Giyim ' }), [], intent)).toBeGreaterThan(0);
  });

  test('Gemini satırı tarz ve fiyatı içerir, eksikse tire', () => {
    expect(line(row({ tarz1: 'sade şık', tarz2: 'minimal', fiyatSegmenti: 'luks' }))).toBe(
      'id | Butik | Giyim | tarz: sade şık, minimal | fiyat: lüks | ',
    );
    expect(line(row({}))).toBe('id | Butik | Giyim | tarz: - | fiyat: - | ');
  });
});

describe('grup etiketleri (tarzdan ayrı)', () => {
  test('kullanıcının kelimesi etikete bağlanır', () => {
    expect([...detectIntent('doğal içerikli bir krem').etiketler]).toEqual(['doğal içerik']);
    expect([...detectIntent('leke için etkili bir serum').etiketler]).toEqual(['etkin bakım']);
    expect([...detectIntent('niş parfüm sever misin').etiketler]).toEqual(['niş parfüm']);
  });

  test('etiketi uyan butik öne geçer', () => {
    const intent = detectIntent('doğal içerikli bir şey arıyorum');
    const dogal = row({ categoryNames: 'Güzellik', etiketler: ['doğal içerik'] });
    const etkin = row({ categoryNames: 'Güzellik', etiketler: ['etkin bakım'] });
    expect(scoreRow(dogal, [], intent)).toBeGreaterThan(scoreRow(etkin, [], intent));
  });

  test('etiket satırda yalnız varsa yazılır', () => {
    expect(line(row({ etiketler: ['niş parfüm'] }))).toContain('etiket: niş parfüm');
    expect(line(row({ etiketler: [] }))).not.toContain('etiket:');
    expect(line(row({}))).not.toContain('etiket:');
  });

  test('etiket tarz alanına karışmaz', () => {
    const r = row({ etiketler: ['doğal içerik'] });
    expect(line(r)).toContain('tarz: -');
    expect(detectIntent('doğal içerikli').tarzlar.size).toBe(0);
  });
});

describe('kullanıcının tarz testi Butikcan önerisinde', () => {
  const profilli = (tarz1: string, segment?: string) =>
    profiliUygula(detectIntent('bir şeyler öner'), {
      tarz1,
      tarz2: null,
      fiyatSegmentleri: segment ? [segment] : [],
    });

  test('kullanıcının tarzındaki butik öne geçer', () => {
    const i = profilli('bohem');
    expect(scoreRow(row({ tarz1: 'bohem' }), [], i)).toBeGreaterThan(
      scoreRow(row({ tarz1: 'sokak' }), [], i),
    );
  });

  test('profil ağırlığı, mesajda açıkça istenen tarzın YARISI kadardır', () => {
    const acik = detectIntent('bohem bir şey');
    const profil = profilli('bohem');
    expect(scoreRow(row({ tarz1: 'bohem' }), [], acik)).toBe(4);
    expect(scoreRow(row({ tarz1: 'bohem' }), [], profil)).toBe(2);
  });

  test('mesajda tarz belirtilmişse profil tarzı devreye GİRMEZ — istek profilin önünde', () => {
    const i = profiliUygula(detectIntent('sokak tarzı bir şey'), {
      tarz1: 'bohem',
      tarz2: null,
      fiyatSegmentleri: [],
    });
    expect(i.profilTarzlar).toBeUndefined();
    expect([...i.tarzlar]).toEqual(['sokak']);
  });

  test('mesajda bütçe belirtilmişse profil bütçesi devreye girmez', () => {
    const i = profiliUygula(detectIntent('lüks bir şey'), {
      tarz1: null,
      tarz2: null,
      fiyatSegmentleri: ['uygun'],
    });
    expect(i.profilSegmentler).toBeUndefined();
  });

  test('profil yoksa (onay verilmemişse) hiçbir şey değişmez', () => {
    const i = profiliUygula(detectIntent('bir şeyler öner'), undefined);
    expect(i.profilTarzlar).toBeUndefined();
    expect(i.profilSegmentler).toBeUndefined();
  });

  test('profil bütçesi de yarım puanla sayılır', () => {
    const i = profilli('bohem', 'uygun');
    expect(scoreRow(row({ fiyatSegmenti: 'uygun' }), [], i)).toBe(1);
  });
});

// Yapay zekâ cevap veremediğinde kullanıcıya bu sıranın ilk birkaçı gösteriliyor,
// yani sıralamanın doğruluğu artık sohbetin dışında da görünür bir şey.
describe('adaylariSec', () => {
  const havuz: BoutiqueRow[] = [
    row({ id: 'populer', name: 'Populer Butik', sortOrder: 0 }),
    row({ id: 'abiye', name: 'Abiye Evi', categoryNames: 'Gece Elbisesi-Abiye', sortOrder: 1 }),
    row({ id: 'mayo', name: 'Mayo Dunyasi', categoryNames: 'Plaj', sortOrder: 2 }),
  ];

  test('soruya uyan butik başa gelir', () => {
    const sonuc = adaylariSec(havuz, ['abiye'], detectIntent('abiye arıyorum'));
    expect(sonuc[0]?.id).toBe('abiye');
  });

  test('hiç sinyal yoksa popülerlik sırası korunur', () => {
    const sonuc = adaylariSec(havuz, [], detectIntent(''));
    expect(sonuc.map((r) => r.id)).toEqual(['populer', 'abiye', 'mayo']);
  });

  test('sinyal var ama hiçbiri eşleşmiyorsa eli boş dönmez', () => {
    const sonuc = adaylariSec(havuz, ['kayakmalzemesi'], detectIntent('kayak malzemesi'));
    expect(sonuc.length).toBeGreaterThan(0);
  });

  test('az eşleşme varsa eşleşen başta, liste popülerle tamamlanır', () => {
    const sonuc = adaylariSec(havuz, ['plaj'], detectIntent('bana yazlık bir şeyler öner'));
    expect(sonuc[0]?.id).toBe('mayo');
    expect(sonuc.map((r) => r.id).sort()).toEqual(['abiye', 'mayo', 'populer']);
  });

  test('ürün açıkça istendiyse ve o kategoride yeterli butik varsa başka butik konmaz', () => {
    const cantalar = [1, 2, 3, 4, 5].map((i) =>
      row({ id: `canta${i}`, name: `Canta ${i}`, categoryNames: 'Deri, Çanta', sortOrder: 10 + i }),
    );
    const uygunGiyim = row({ id: 'giyim', name: 'Giyim', fiyatSegmenti: 'uygun', sortOrder: 0 });
    const q = 'daha uygun fiyatlı olanlar var mı\nbana çanta önerir misin';
    const sonuc = adaylariSec(
      [uygunGiyim, ...havuz, ...cantalar],
      ['uygun', 'çanta'],
      detectIntent(q),
    );
    expect(sonuc.map((r) => r.id).sort()).toEqual([
      'canta1',
      'canta2',
      'canta3',
      'canta4',
      'canta5',
    ]);
  });

  test('istenen kategoride çok az butik varsa liste yine tamamlanır', () => {
    const sonuc = adaylariSec(havuz, ['mayo'], detectIntent('mayo arıyorum'));
    expect(sonuc[0]?.id).toBe('mayo');
    expect(sonuc.length).toBe(3);
  });

  test('tarz profili tek başına da sıralamayı yönlendirir', () => {
    const tarzli = [...havuz, row({ id: 'bohem', name: 'Bohem Ev', tarz1: 'bohem', sortOrder: 9 })];
    const intent = profiliUygula(detectIntent(''), {
      tarz1: 'bohem',
      tarz2: null,
      fiyatSegmentleri: [],
    });
    expect(adaylariSec(tarzli, [], intent)[0]?.id).toBe('bohem');
  });
});

describe('mevsimGenislet', () => {
  test('yaz soruları plaj ve yaz kelimeleri ekler', () => {
    const m = mevsimGenislet('Bana yazlık bir şeyler öner');
    expect(m.kategoriler).toEqual(['plaj']);
    expect(m.kelimeler).toContain('pareo');
    expect(mevsimGenislet('tatilde ne giysem').kategoriler).toEqual(['plaj']);
  });
  test('kış soruları kışlık kelimeleri ekler', () => {
    expect(mevsimGenislet('kışlık bir şeyler').kelimeler).toContain('mont');
  });
  test('benzer kelimeler tetiklemez', () => {
    expect(mevsimGenislet('yazar bir arkadaşa hediye').kategoriler).toEqual([]);
    expect(mevsimGenislet('karlı bir elbise').kategoriler).toEqual([]);
  });
  test('yaz sorusunda plaj butiği öne gelir', () => {
    const havuz = [
      row({ id: 'abiye', name: 'Abiye Evi', categoryNames: 'Abiye', sortOrder: 0 }),
      row({
        id: 'pareo',
        name: 'Deniz Kızı',
        categoryNames: 'Giyim',
        description: 'Pareo ve kaftanlar',
        sortOrder: 1,
      }),
      row({ id: 'plaj', name: 'Kum', categoryNames: 'Plaj', sortOrder: 2 }),
    ];
    const q = 'bana yazlık bir şeyler öner';
    const kws = mevsimGenislet(q).kelimeler;
    const ids = adaylariSec(havuz, kws, detectIntent(q)).map((r) => r.id);
    expect(ids.slice(0, 2).sort()).toEqual(['pareo', 'plaj']);
  });
});

describe('onElemeSorusu', () => {
  const u = (text: string) => ({ role: 'user' as const, text });
  const m = (text: string) => ({ role: 'model' as const, text });

  test('tek mesajda yalnız o mesaj', () => {
    expect(onElemeSorusu([u('bana çanta önerir misin')])).toBe('bana çanta önerir misin');
  });

  test('devam mesajında ürün belirtilmemişse önceki isteğin kategorisi korunur', () => {
    const q = onElemeSorusu([
      u('bana çanta önerir misin'),
      m('İşte çanta butikleri'),
      u('daha uygun fiyatlı olanlar var mı'),
    ]);
    expect(detectIntent(q).kategoriler.has('çanta')).toBe(true);
    expect(detectIntent(q).segmentler.has('uygun')).toBe(true);
  });

  test('kullanıcı konuyu değiştirirse eski kategori taşınmaz', () => {
    const q = onElemeSorusu([u('bana çanta önerir misin'), m('…'), u('peki elbise?')]);
    expect(detectIntent(q).kategoriler.has('giyim')).toBe(true);
    expect(detectIntent(q).kategoriler.has('çanta')).toBe(false);
  });

  test('model mesajlarındaki kelimeler kullanılmaz', () => {
    const q = onElemeSorusu([u('merhaba'), m('Çanta mı bakalım?'), u('bilmiyorum')]);
    expect(detectIntent(q).kategoriler.size).toBe(0);
  });

  test('mevsim sözü ürünü unutturmaz', () => {
    const q = onElemeSorusu([u('çanta önerir misin'), m('…'), u('peki kışlık olanlar?')]);
    expect(detectIntent(q).kategoriler.has('çanta')).toBe(true);
  });

  test('kategori olan en yakın önceki mesajda durur', () => {
    const q = onElemeSorusu([
      u('ayakkabı lazım'),
      m('…'),
      u('çanta da bakayım'),
      m('…'),
      u('siyah olsun'),
    ]);
    expect(detectIntent(q).kategoriler.has('çanta')).toBe(true);
    expect(detectIntent(q).kategoriler.has('ayakkabı')).toBe(false);
  });
});

describe('enAzTamamla / oneCikaniBasaAl', () => {
  const row = (id: string, name: string, cats: string) =>
    ({
      id,
      name,
      categoryNames: cats,
      description: '',
      sortOrder: 0,
      tarz1: null,
      tarz2: null,
      fiyatSegmenti: null,
    }) as const;
  const pool = [
    row('b', 'Breeze', 'kids corner'),
    row('k1', 'Minik', 'kids corner'),
    row('a1', 'Abiye', 'abiye'),
  ];

  test('3 seçimi sıralı adaylarla 5e tamamlar', () => {
    expect(enAzTamamla(['x', 'y', 'z'], ['y', 'p', 'q', 'r'])).toEqual(['x', 'y', 'z', 'p', 'q']);
  });

  test('çocuk sorusunda Breeze en başa gelir', () => {
    expect(oneCikaniBasaAl(['a1', 'k1'], pool, 'bebeğime uyku tulumu')[0]).toBe('b');
  });

  test('aynı kategoride öneri varsa Breeze başa alınır, tekrar etmez', () => {
    expect(oneCikaniBasaAl(['k1', 'b'], pool, 'şunlar')).toEqual(['b', 'k1']);
  });

  test('alakasız soruda dokunulmaz', () => {
    expect(oneCikaniBasaAl(['a1'], pool, 'düğün için abiye')).toEqual(['a1']);
  });
});

describe('profilin ürün etiketleri arama ipucu olarak (PROFIL_VITRIN_ENABLED)', () => {
  const ipuclu = (mesaj: string, aramaIpuclari: string[]) =>
    profiliUygula(detectIntent(mesaj), {
      tarz1: null,
      tarz2: null,
      fiyatSegmentleri: [],
      aramaIpuclari,
    });

  test('ipucu niyete eklenir; ipucu yoksa alan hiç oluşmaz', () => {
    expect([...(ipuclu('bir şeyler öner', ['gömlek', 'keten']).profilIpuclari ?? [])]).toEqual([
      'gömlek',
      'keten',
    ]);
    expect(ipuclu('bir şeyler öner', []).profilIpuclari).toBeUndefined();
    expect(
      profiliUygula(detectIntent('bir şeyler öner'), {
        tarz1: 'bohem',
        tarz2: null,
        fiyatSegmentleri: [],
      }).profilIpuclari,
    ).toBeUndefined();
  });

  test('ad, açıklama ya da kategoride geçen ipucu +1 (profil tarzından düşük)', () => {
    const i = ipuclu('bir şeyler öner', ['keten']);
    expect(scoreRow(row({ description: 'Keten gömlekler ve elbiseler' }), [], i)).toBe(1);
    expect(scoreRow(row({ name: 'Keten Ev' }), [], i)).toBe(1);
    expect(scoreRow(row({ description: 'Pamuklu tişörtler' }), [], i)).toBe(0);
  });

  test('ipucu kelime başında aranır ("ev" "sevimli"yi tetiklemez)', () => {
    const i = ipuclu('bir şeyler öner', ['ev']);
    expect(scoreRow(row({ description: 'Sevimli parçalar' }), [], i)).toBe(0);
    expect(scoreRow(row({ description: 'Ev tekstili' }), [], i)).toBe(1);
  });

  test('mesajdaki açık tarz ipucunun önündedir', () => {
    const i = ipuclu('bohem bir şey', ['keten']);
    expect(scoreRow(row({ tarz1: 'bohem' }), [], i)).toBeGreaterThan(
      scoreRow(row({ description: 'keten' }), [], i),
    );
  });

  test('ipucu tek başına da ön elemeyi yönlendirir', () => {
    const havuz = [
      row({ id: 'pop', name: 'Popüler', sortOrder: 0 }),
      row({ id: 'keten', name: 'Ada', description: 'keten elbiseler', sortOrder: 5 }),
    ];
    expect(adaylariSec(havuz, [], ipuclu('', ['keten']))[0]?.id).toBe('keten');
  });
});

describe('profil öneri sayısını azaltmaz (sahip kuralı, 22 Eki)', () => {
  // Çanta kategorisi + başka kategoriler. Bugünkü (profilsiz) sıra: popülerlik (sortOrder).
  const canta = (i: number, ek: Partial<BoutiqueRow> = {}) =>
    row({ id: `canta${i}`, name: `C${i}`, categoryNames: 'Çanta', sortOrder: 10 + i, ...ek });
  const giyim = (i: number, ek: Partial<BoutiqueRow> = {}) =>
    row({ id: `giyim${i}`, name: `G${i}`, categoryNames: 'Giyim', sortOrder: i, ...ek });
  const soru = 'bana çanta önerir misin';
  const kws = ['çanta'];
  const profil = (tarz1: string | null, ek: Partial<Parameters<typeof profiliUygula>[1]> = {}) => ({
    tarz1,
    tarz2: null,
    fiyatSegmentleri: [],
    ...ek,
  });
  const bugunku = (havuz: BoutiqueRow[]) => adaylariSec(havuz, kws, detectIntent(soru));
  const idler = (r: BoutiqueRow[]) => r.map((x) => x.id);

  test('profilden hiç eşleşme yoksa liste bugünküyle aynı', () => {
    const havuz = [giyim(1), giyim(2), canta(1), canta(2), canta(3), canta(4)];
    const sonuc = profilliAdaylariSec(havuz, kws, soru, profil('vintage'));
    expect(idler(sonuc)).toEqual(idler(bugunku(havuz)));
  });

  test('1 eşleşme: o başa, ardından aynı kategoriden en az 2 butik bugünkü sırayla', () => {
    const havuz = [giyim(1), canta(1), canta(2), canta(3, { tarz1: 'bohem' })];
    const sonuc = profilliAdaylariSec(havuz, kws, soru, profil('bohem'));
    expect(sonuc[0]?.id).toBe('canta3');
    expect(idler(sonuc).slice(1, 3)).toEqual(['canta1', 'canta2']);
    expect(sonuc.length).toBeGreaterThanOrEqual(bugunku(havuz).length);
  });

  test('2 eşleşme: ikisi başta, sonra aynı kategoriden en az 2 butik', () => {
    const havuz = [
      canta(1),
      canta(2),
      canta(3),
      canta(4, { tarz1: 'bohem' }),
      canta(5, { description: 'keten çantalar' }),
    ];
    const sonuc = profilliAdaylariSec(
      havuz,
      kws,
      soru,
      profil('bohem', { aramaIpuclari: ['keten'] }),
    );
    expect(idler(sonuc).slice(0, 2)).toEqual(['canta4', 'canta5']);
    expect(idler(sonuc).slice(2, 4)).toEqual(['canta1', 'canta2']);
  });

  test('çok eşleşme olsa da en çok 2 butik öne alınır, kalanı bugünkü sıra', () => {
    const havuz = [1, 2, 3, 4, 5, 6].map((i) => canta(i, { tarz1: i > 2 ? 'bohem' : null }));
    const sonuc = profilliAdaylariSec(havuz, kws, soru, profil('bohem'));
    expect(PROFIL_ONCELIK_ADEDI).toBe(2);
    expect(idler(sonuc)).toEqual(['canta3', 'canta4', 'canta1', 'canta2', 'canta5', 'canta6']);
  });

  test('istenen kategori dışındaki profil eşleşmesi öne alınmaz', () => {
    const havuz = [giyim(1, { tarz1: 'bohem' }), canta(1), canta(2), canta(3), canta(4)];
    const sonuc = profilliAdaylariSec(havuz, kws, soru, profil('bohem'));
    expect(idler(sonuc)).toEqual(idler(bugunku(havuz)));
  });

  test('bugünkü sıra test profiliyle geliyorsa taban o olur', () => {
    const havuz = [canta(1), canta(2, { tarz1: 'sokak' }), canta(3), canta(4, { tarz1: 'bohem' })];
    const taban = profil('sokak');
    const sonuc = profilliAdaylariSec(havuz, kws, soru, profil('bohem'), taban);
    const tabanSira = idler(adaylariSec(havuz, kws, profiliUygula(detectIntent(soru), taban)));
    expect(sonuc[0]?.id).toBe('canta4');
    expect(idler(sonuc).slice(1)).toEqual(tabanSira.filter((id) => id !== 'canta4'));
  });

  test('toplam aday sayısı hiçbir durumda bugünkünden az değildir', () => {
    const havuzlar = [
      [canta(1), canta(2, { tarz1: 'bohem' })],
      [giyim(1, { tarz1: 'bohem' }), canta(1)],
      Array.from({ length: 60 }, (_, i) => canta(i, { tarz1: i % 3 === 0 ? 'bohem' : null })),
      Array.from({ length: 60 }, (_, i) => giyim(i, { tarz1: 'bohem' })),
    ];
    const sorular = [soru, 'bir şeyler öner', ''];
    for (const havuz of havuzlar) {
      for (const q of sorular) {
        const k = q ? ['çanta'] : [];
        const once = adaylariSec(havuz, k, detectIntent(q));
        const sonra = profilliAdaylariSec(
          havuz,
          k,
          q,
          profil('bohem', { aramaIpuclari: ['keten'] }),
        );
        expect(sonra.length).toBeGreaterThanOrEqual(once.length);
        expect(new Set(idler(sonra)).size).toBe(sonra.length);
      }
    }
  });
});
