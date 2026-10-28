import { describe, expect, test } from 'bun:test';
import {
  ayniAlanMi,
  epostaTuru,
  guvenPuani,
  onerilenEposta,
  serbestPostaMi,
} from './classify-email';

describe('epostaTuru', () => {
  test('genel iletisim adresleri', () => {
    expect(epostaTuru('info@marka.com')).toBe('genel');
    expect(epostaTuru('iletisim@marka.com')).toBe('genel');
    expect(epostaTuru('hello@marka.com')).toBe('genel');
  });

  test('is birligi adresleri', () => {
    expect(epostaTuru('isbirligi@marka.com')).toBe('isbirligi');
    expect(epostaTuru('partnership@marka.com')).toBe('isbirligi');
  });

  test('basin adresleri', () => {
    expect(epostaTuru('basin@marka.com')).toBe('basin');
    expect(epostaTuru('pr@marka.com')).toBe('basin');
  });

  test('destek ve siparis adresleri', () => {
    expect(epostaTuru('destek@marka.com')).toBe('destek');
    expect(epostaTuru('siparis@marka.com')).toBe('destek');
    expect(epostaTuru('musteri.hizmetleri@marka.com')).toBe('destek');
  });

  test('kurumsal adresler', () => {
    expect(epostaTuru('muhasebe@marka.com')).toBe('kurumsal');
    expect(epostaTuru('kariyer@marka.com')).toBe('kurumsal');
  });

  test('kisi adi diger sayilir', () => {
    expect(epostaTuru('ayse@marka.com')).toBe('diger');
  });

  test('nokta ve tireli yazim da taninir', () => {
    expect(epostaTuru('is-birligi@marka.com')).toBe('isbirligi');
  });
});

describe('ayniAlanMi ve serbestPostaMi', () => {
  test('ayni alan adi', () => {
    expect(ayniAlanMi('info@marka.com', 'marka.com')).toBe(true);
  });

  test('alt alan adi da ayni sayilir', () => {
    expect(ayniAlanMi('info@mail.marka.com', 'marka.com')).toBe(true);
  });

  test('baska alan adi', () => {
    expect(ayniAlanMi('info@ajans.com', 'marka.com')).toBe(false);
  });

  test('gmail serbest posta', () => {
    expect(serbestPostaMi('marka@gmail.com')).toBe(true);
    expect(serbestPostaMi('info@marka.com')).toBe(false);
  });
});

describe('guvenPuani', () => {
  test('kendi alan adindan mailto linki en yuksek guven', () => {
    expect(
      guvenPuani({ email: 'info@marka.com', foundIn: 'mailto' }, 'marka.com', 'anasayfa'),
    ).toBe('yuksek');
  });

  test('iletisim sayfasinda kendi alan adi yuksek guven', () => {
    expect(guvenPuani({ email: 'info@marka.com', foundIn: 'metin' }, 'marka.com', 'iletisim')).toBe(
      'yuksek',
    );
  });

  test('gmail adresi dusuk guven ama elenmez', () => {
    expect(
      guvenPuani({ email: 'marka@gmail.com', foundIn: 'metin' }, 'marka.com', 'iletisim'),
    ).toBe('dusuk');
  });

  test('baska sirketin alan adi dusuk guven', () => {
    expect(guvenPuani({ email: 'info@ajans.com', foundIn: 'metin' }, 'marka.com', 'anasayfa')).toBe(
      'dusuk',
    );
  });
});

describe('onerilenEposta', () => {
  test('aday yoksa null — asla adres uydurmaz', () => {
    expect(onerilenEposta([])).toBeNull();
  });

  test('yuksek guvenli adres once gelir', () => {
    const secim = onerilenEposta([
      { email: 'marka@gmail.com', emailType: 'genel', confidence: 'dusuk' },
      { email: 'destek@marka.com', emailType: 'destek', confidence: 'yuksek' },
    ]);
    expect(secim?.email).toBe('destek@marka.com');
  });

  test('esit guvende genel iletisim adresi tercih edilir', () => {
    const secim = onerilenEposta([
      { email: 'basin@marka.com', emailType: 'basin', confidence: 'yuksek' },
      { email: 'info@marka.com', emailType: 'genel', confidence: 'yuksek' },
    ]);
    expect(secim?.email).toBe('info@marka.com');
  });
});
