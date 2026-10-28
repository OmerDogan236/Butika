import { describe, expect, test } from 'bun:test';
import { icerikUygunMu, metniNormalize } from './icerik-filtresi';

// Bu testlerin YARISI "engellenmeli", yarisi "engellenMEmeli" diyor.
// Ikincisi daha onemli: masum bir yorumu engelleyen filtre, hic filtre
// olmamasindan daha zararlidir.

describe('metniNormalize', () => {
  test('ı ve i AYRI kalir — sıkıntı ile siktir karismasin', () => {
    expect(metniNormalize('sıkıntı')).toBe('sıkıntı');
    expect(metniNormalize('siktir')).toBe('siktir');
    expect(metniNormalize('sıkıntı')).not.toBe(metniNormalize('sikinti'));
  });

  test('aksanli harfler sadelesir (ı haric)', () => {
    expect(metniNormalize('ÇĞÖŞÜ')).toBe('cgosu');
  });

  test('Turkce kucultme dogru: İ→i, I→ı', () => {
    expect(metniNormalize('İSTANBUL')).toBe('ıstanbul'.replace('ı', 'i'));
    expect(metniNormalize('ILIK')).toBe('ılık');
  });

  test('rakam ve simgeyle gizleme cozulur', () => {
    expect(metniNormalize('s1kt1r')).toBe('siktir');
    expect(metniNormalize('$1kt1r')).toBe('siktir');
  });

  test('tekrar eden harfler tekile iner', () => {
    expect(metniNormalize('siiiiktiiir')).toBe('siktir');
  });

  test('noktalama bosluga doner', () => {
    // "!" bilerek "i"ye cevriliyor (s!ktir kacamagi icin), o yuzden "dunya!" → "dunyai".
    expect(metniNormalize('merhaba, dunya!')).toBe('merhaba dunyai');
  });

  test('guvenli kelime listesi normalize edilmis haliyle karsilastirilir', () => {
    // "sikke" normalize edilince "sike" olur; liste ham haliyle tutulsaydi eslesmezdi.
    expect(metniNormalize('sikke')).toBe('sike');
  });
});

describe('icerikUygunMu — ENGELLENMELI', () => {
  const kotu = [
    'siktir git',
    'orospu cocugu',
    'amcık',
    'seni gerizekali kahpe',
    'pezevenk',
    'ne ibne adamsin',
    'yavşak herif',
    'this is shit',
    'fuck you',
    'you bitch',
  ];
  for (const metin of kotu) {
    test(`"${metin}"`, () => {
      expect(icerikUygunMu(metin).uygun).toBe(false);
    });
  }

  test('harf aralayarak kacamak: "s i k t i r"', () => {
    expect(icerikUygunMu('s i k t i r').uygun).toBe(false);
  });

  test('kisaltma kacamagi: "a m k"', () => {
    expect(icerikUygunMu('bu ne a m k').uygun).toBe(false);
  });

  test('rakamla kacamak: "s1kt1r"', () => {
    expect(icerikUygunMu('s1kt1r lan').uygun).toBe(false);
  });

  test('cekim ekiyle: "orospuluk"', () => {
    expect(icerikUygunMu('orospuluk yapma').uygun).toBe(false);
  });
});

describe('icerikUygunMu — ENGELLENMEMELI (yanlis pozitif korumasi)', () => {
  const iyi = [
    'sıkıntı yok, cok begendim',
    'canımı sıktı ama urun guzel',
    'bu elbiseyi çok sıkı buldum',
    'kargoyu goturmek zor oldu',
    'goturdugum hediye cok begenildi',
    'boks eldiveni ariyorum',
    'boksör icin uygun mu',
    'sikke koleksiyonu yapiyorum',
    'ama bu renk bana olmadi',
    'aman ne guzel',
    'amacım kaliteli urun bulmak',
    'ambalajı cok sıktı ama icindekiler guzel',
    'amirim begendi',
    'bu takım şık duruyor',
    'fiyat performans olarak iyi',
    'kumaşı kalın, kışlık icin ideal',
    'bedenim tam oldu, tavsiye ederim',
  ];
  for (const metin of iyi) {
    test(`"${metin}"`, () => {
      const s = icerikUygunMu(metin);
      expect(s.uygun).toBe(true);
    });
  }

  test('bos metin uygun sayilir', () => {
    expect(icerikUygunMu('').uygun).toBe(true);
    expect(icerikUygunMu('   ').uygun).toBe(true);
  });

  test('yalniz noktalama uygun sayilir', () => {
    expect(icerikUygunMu('!!! ???').uygun).toBe(true);
  });
});

describe('eslesen kok teshis icin donuyor', () => {
  test('engellenen metin hangi kokle eslesti soyluyor', () => {
    const s = icerikUygunMu('siktir git');
    expect(s.uygun).toBe(false);
    expect(s.eslesen).toBe('siktir');
  });

  test('temiz metinde eslesen yok', () => {
    expect(icerikUygunMu('cok guzel bir butik').eslesen).toBeUndefined();
  });
});
