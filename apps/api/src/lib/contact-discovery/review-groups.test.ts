import { describe, expect, test } from 'bun:test';
import {
  type IncelenecekSatir,
  gecerliEpostaMi,
  genelAdresMi,
  incelemeGrubu,
  kisiselOlabilirMi,
  operasyonelAdresMi,
} from './review-groups';

// Bu testlerin agirligi "toplu onaya GIRMEMELI" diyenlerde. Yanlis bir adresi
// toplu onaya sokmak, fazladan elle kontrolden cok daha pahalidir.

const satir = (uzerine: Partial<IncelenecekSatir> = {}): IncelenecekSatir => ({
  domain: 'marka.com',
  email: 'info@marka.com',
  status: 'onay_bekliyor',
  doNotContact: false,
  taramaHatasi: false,
  adaylar: [
    { email: 'info@marka.com', confidence: 'yuksek', sourceUrl: 'https://marka.com/iletisim' },
  ],
  ...uzerine,
});

describe('onek siniflandirmasi', () => {
  test('genel adresler', () => {
    for (const e of [
      'hello@m.com',
      'info@m.com',
      'iletisim@m.com',
      'contact@m.com',
      'isbirligi@m.com',
      'pr@m.com',
    ]) {
      expect(genelAdresMi(e)).toBe(true);
    }
  });

  test('operasyonel adresler', () => {
    for (const e of [
      'support@m.com',
      'destek@m.com',
      'siparis@m.com',
      'iade@m.com',
      'muhasebe@m.com',
      'kargo@m.com',
    ]) {
      expect(operasyonelAdresMi(e)).toBe(true);
    }
  });

  test('nokta ve tire yazimi da taninir', () => {
    expect(operasyonelAdresMi('musteri.hizmetleri@m.com')).toBe(true);
    expect(genelAdresMi('is-birligi@m.com')).toBe(true);
  });

  test('kisi adi ne genel ne operasyonel', () => {
    expect(kisiselOlabilirMi('gizem@marka.com')).toBe(true);
    expect(kisiselOlabilirMi('info@marka.com')).toBe(false);
  });

  test('eposta bicim dogrulamasi', () => {
    expect(gecerliEpostaMi('info@marka.com')).toBe(true);
    expect(gecerliEpostaMi('info@marka')).toBe(false);
    expect(gecerliEpostaMi('adres-degil')).toBe(false);
  });
});

describe('incelemeGrubu — YUKSEK GUVEN (toplu onaya uygun)', () => {
  test('kendi domaininde, iletisim sayfasinda, genel adres', () => {
    expect(incelemeGrubu(satir()).grup).toBe('yuksek_guven');
  });

  test('hello@ da uygundur', () => {
    const s = satir({
      email: 'hello@marka.com',
      adaylar: [{ email: 'hello@marka.com', confidence: 'yuksek', sourceUrl: 'https://marka.com' }],
    });
    expect(incelemeGrubu(s).grup).toBe('yuksek_guven');
  });

  test('ikinci aday operasyonelse secim yine net — yuksek guven', () => {
    const s = satir({
      adaylar: [
        { email: 'info@marka.com', confidence: 'yuksek', sourceUrl: 'https://marka.com/iletisim' },
        {
          email: 'siparis@marka.com',
          confidence: 'yuksek',
          sourceUrl: 'https://marka.com/iletisim',
        },
      ],
    });
    expect(incelemeGrubu(s).grup).toBe('yuksek_guven');
  });

  test('yuksek guvende gerekce yazilmaz', () => {
    expect(incelemeGrubu(satir()).gerekce).toBeNull();
  });
});

describe('incelemeGrubu — MANUEL KONTROL', () => {
  test('farkli domain', () => {
    const s = satir({
      email: 'hello@baskasite.com',
      adaylar: [
        {
          email: 'hello@baskasite.com',
          confidence: 'dusuk',
          sourceUrl: 'https://marka.com/iletisim',
        },
      ],
    });
    const sonuc = incelemeGrubu(s);
    expect(sonuc.grup).toBe('manuel_kontrol');
    expect(sonuc.gerekce).toContain('domaininden farklı');
  });

  test('dusuk guven', () => {
    const s = satir({
      adaylar: [{ email: 'info@marka.com', confidence: 'dusuk', sourceUrl: 'https://marka.com' }],
    });
    expect(incelemeGrubu(s).grup).toBe('manuel_kontrol');
  });

  test('destek adresi toplu onaya GIRMEZ', () => {
    const s = satir({
      email: 'destek@marka.com',
      adaylar: [
        {
          email: 'destek@marka.com',
          confidence: 'yuksek',
          sourceUrl: 'https://marka.com/iletisim',
        },
      ],
    });
    const sonuc = incelemeGrubu(s);
    expect(sonuc.grup).toBe('manuel_kontrol');
    expect(sonuc.gerekce).toContain('operasyonel');
  });

  test('siparis adresi toplu onaya girmez', () => {
    const s = satir({
      email: 'siparis@marka.com',
      adaylar: [
        { email: 'siparis@marka.com', confidence: 'yuksek', sourceUrl: 'https://marka.com' },
      ],
    });
    expect(incelemeGrubu(s).grup).toBe('manuel_kontrol');
  });

  test('kisi adi iceren adres toplu onaya girmez', () => {
    const s = satir({
      email: 'gizem@marka.com',
      adaylar: [{ email: 'gizem@marka.com', confidence: 'yuksek', sourceUrl: 'https://marka.com' }],
    });
    const sonuc = incelemeGrubu(s);
    expect(sonuc.grup).toBe('manuel_kontrol');
    expect(sonuc.gerekce).toContain('kişi');
  });

  test('iki makul aday varsa karar sahibin', () => {
    const s = satir({
      adaylar: [
        { email: 'info@marka.com', confidence: 'yuksek', sourceUrl: 'https://marka.com' },
        { email: 'iletisim@marka.com', confidence: 'yuksek', sourceUrl: 'https://marka.com' },
      ],
    });
    const sonuc = incelemeGrubu(s);
    expect(sonuc.grup).toBe('manuel_kontrol');
    expect(sonuc.gerekce).toContain('2 uygun aday');
  });

  test('kaynak URL yoksa toplu onaya girmez', () => {
    const s = satir({
      adaylar: [{ email: 'info@marka.com', confidence: 'yuksek', sourceUrl: null }],
    });
    expect(incelemeGrubu(s).grup).toBe('manuel_kontrol');
  });

  test('iletisim istemeyen marka', () => {
    expect(incelemeGrubu(satir({ doNotContact: true })).grup).toBe('manuel_kontrol');
  });

  test('zaten onaylanmis kayit tekrar toplu onaya girmez', () => {
    expect(incelemeGrubu(satir({ status: 'onaylandi' })).grup).toBe('manuel_kontrol');
  });

  test('gecersiz isaretli kayit girmez', () => {
    expect(incelemeGrubu(satir({ status: 'gecersiz' })).grup).toBe('manuel_kontrol');
  });

  test('bozuk bicimli adres girmez', () => {
    const s = satir({
      email: 'bozuk@adres',
      adaylar: [{ email: 'bozuk@adres', confidence: 'yuksek', sourceUrl: 'https://marka.com' }],
    });
    expect(incelemeGrubu(s).grup).toBe('manuel_kontrol');
  });
});

describe('incelemeGrubu — BULUNAMADI / HATA', () => {
  test('aday yoksa', () => {
    expect(incelemeGrubu(satir({ email: null, status: 'bulunamadi', adaylar: [] })).grup).toBe(
      'bulunamadi',
    );
  });

  test('tarama hatasi', () => {
    expect(incelemeGrubu(satir({ taramaHatasi: true })).grup).toBe('bulunamadi');
  });

  test('tarama hatasi, adres bulunmus olsa bile onaya girmez', () => {
    expect(incelemeGrubu(satir({ taramaHatasi: true })).gerekce).toContain('hata');
  });
});
