import { describe, expect, test } from 'bun:test';
import {
  ayniCevapMi,
  dahaSonraSiniriyaCek,
  davetKartiGorunsunMu,
  ertelemeSayilirMi,
  kisiselVarMi,
  sonrakiAdim,
  varsayilanSiralama,
  videoGosterilsinMi,
  yenidenDenenebilirMi,
} from './kisisel-akis';

const d = {
  testVar: false,
  videoGoruldu: false,
  dahaSonraSayisi: 0,
  dil: 'tr',
  yeniKurulum: false,
};

describe('sonrakiAdim', () => {
  test('testi olmayan mevcut kullanıcı önce test', () => expect(sonrakiAdim(d)).toBe('test'));
  test('bir "Daha sonra" sonrası test bir kez daha sorulur', () =>
    expect(sonrakiAdim({ ...d, dahaSonraSayisi: 1 })).toBe('test'));
  test('iki kez "Daha sonra" sonrası test sorulmaz, video gelir', () =>
    expect(sonrakiAdim({ ...d, dahaSonraSayisi: 2 })).toBe('video'));
  test('testi olan video görmediyse video', () =>
    expect(sonrakiAdim({ ...d, testVar: true })).toBe('video'));
  test('İngilizcede video yok', () =>
    expect(sonrakiAdim({ ...d, testVar: true, dil: 'en' })).toBeNull());
  test('İngilizce, iki "Daha sonra" sonrası hiçbir şey', () =>
    expect(sonrakiAdim({ ...d, dil: 'en', dahaSonraSayisi: 2 })).toBeNull());
  test('İngilizce testi olmayan kullanıcıya test sorulur', () =>
    expect(sonrakiAdim({ ...d, dil: 'en' })).toBe('test'));
  test('hepsi tamam → hiçbir şey', () =>
    expect(sonrakiAdim({ ...d, testVar: true, videoGoruldu: true })).toBeNull());
  test('test durumu bilinmiyorsa bekle', () =>
    expect(sonrakiAdim({ ...d, testVar: undefined })).toBeNull());
  test("onboarding'i bu oturumda bitiren için yok", () =>
    expect(sonrakiAdim({ ...d, yeniKurulum: true })).toBeNull());
});

test('videoGosterilsinMi', () => {
  expect(videoGosterilsinMi('tr')).toBe(true);
  expect(videoGosterilsinMi('tr-TR')).toBe(true);
  expect(videoGosterilsinMi('en')).toBe(false);
  expect(videoGosterilsinMi('')).toBe(false);
});

test('davet kartı', () => {
  expect(davetKartiGorunsunMu({ testVar: false, kartKapatildi: false })).toBe(true);
  expect(davetKartiGorunsunMu({ testVar: true, kartKapatildi: false })).toBe(false);
  expect(davetKartiGorunsunMu({ testVar: undefined, kartKapatildi: false })).toBe(false);
  expect(davetKartiGorunsunMu({ testVar: false, kartKapatildi: true })).toBe(false);
});

test('bekleyen cevap: yalnız ağ/sunucu hatasında saklanır', () => {
  expect(yenidenDenenebilirMi(undefined)).toBe(true); // ağ hatası
  expect(yenidenDenenebilirMi(500)).toBe(true);
  expect(yenidenDenenebilirMi(503)).toBe(true);
  expect(yenidenDenenebilirMi(408)).toBe(true);
  expect(yenidenDenenebilirMi(429)).toBe(true);
  expect(yenidenDenenebilirMi(400)).toBe(false); // geçersiz cevap: tekrar gönderilse de reddedilir
  expect(yenidenDenenebilirMi(401)).toBe(true); // oturum düştü: yeniden girişte gönderilir
  expect(yenidenDenenebilirMi(403)).toBe(false);
  expect(yenidenDenenebilirMi(422)).toBe(false);
});

describe('ayniCevapMi (yeniden gönderilen cevap silinsin mi)', () => {
  const g = { testSurumu: 2, senaryo: { kahvalti: ['a'] }, acikTarzlar: ['minimal'], renkler: [] };
  test('saklanan hâlâ gönderilenle aynıysa sil', () =>
    expect(ayniCevapMi(g, JSON.parse(JSON.stringify(g)))).toBe(true));
  test('anahtar sırası farkı önemsiz', () =>
    expect(
      ayniCevapMi(g, {
        renkler: [],
        acikTarzlar: ['minimal'],
        senaryo: { kahvalti: ['a'] },
        testSurumu: 2,
      }),
    ).toBe(true));
  test('bu arada daha yeni cevap saklandıysa silme', () =>
    expect(ayniCevapMi({ ...g, acikTarzlar: ['klasik'] }, g)).toBe(false));
  test('dizi sırası farklıysa farklı cevap', () =>
    expect(ayniCevapMi({ ...g, acikTarzlar: ['b', 'a'] }, { ...g, acikTarzlar: ['a', 'b'] })).toBe(
      false,
    ));
  test('saklanan yoksa silinecek bir şey yok', () => expect(ayniCevapMi(null, g)).toBe(false));
});

describe('dahaSonraSiniriyaCek', () => {
  test('0 sınıra çıkar ve test artık sorulmaz', () => {
    const n = dahaSonraSiniriyaCek(0);
    expect(n).toBe(2);
    expect(sonrakiAdim({ ...d, dahaSonraSayisi: n, videoGoruldu: true })).toBeNull();
  });
  test('sınırın üstündeki değer düşmez', () => expect(dahaSonraSiniriyaCek(5)).toBe(5));
  test('davet kartı testin kapatılmasından etkilenmez', () =>
    expect(davetKartiGorunsunMu({ testVar: false, kartKapatildi: false })).toBe(true));
});

describe('varsayilanSiralama', () => {
  test('test var, önerilen → sana özel', () =>
    expect(varsayilanSiralama(true, 'onerilen')).toBe('kisisel'));
  test('test yok, sana özel → önerilen', () =>
    expect(varsayilanSiralama(false, 'kisisel')).toBe('onerilen'));
  test('bilinçli seçim korunur', () => {
    expect(varsayilanSiralama(true, 'alfabetik')).toBe('alfabetik');
    expect(varsayilanSiralama(false, 'uygun_once')).toBe('uygun_once');
    expect(varsayilanSiralama(true, 'kisisel')).toBe('kisisel');
    expect(varsayilanSiralama(false, 'onerilen')).toBe('onerilen');
  });
});

describe('ertelemeSayilirMi', () => {
  test('her adım atlanıp sonuçsuz biten test "Daha sonra" sayılır', () =>
    expect(ertelemeSayilirMi(null)).toBe(true));
  test('kaydedilen sonuç ertelemesi sayılmaz', () =>
    expect(ertelemeSayilirMi({ testSurumu: 2 })).toBe(false));
  test('iki sonuçsuz bitişten sonra test bir daha sorulmaz', () => {
    let dahaSonraSayisi = 0;
    for (let i = 0; i < 2; i++) {
      expect(sonrakiAdim({ ...d, dahaSonraSayisi })).toBe('test');
      if (ertelemeSayilirMi(null)) dahaSonraSayisi++;
    }
    expect(sonrakiAdim({ ...d, dahaSonraSayisi })).toBe('video');
  });
});

describe('kisiselVarMi ("Sana özel" seçeneği)', () => {
  test('tarz testi varsa görünür', () => {
    expect(kisiselVarMi(true, undefined)).toBe(true);
    expect(kisiselVarMi(true, false)).toBe(true);
  });
  test('test yok ama sunucuda profil doluysa görünür (aşama 3)', () => {
    expect(kisiselVarMi(false, true)).toBe(true);
    expect(kisiselVarMi(undefined, true)).toBe(true);
  });
  test('ikisi de yoksa ya da henüz bilinmiyorsa görünmez', () => {
    expect(kisiselVarMi(false, false)).toBe(false);
    expect(kisiselVarMi(undefined, undefined)).toBe(false);
    expect(kisiselVarMi(false, undefined)).toBe(false);
  });
  test('profil doluysa "Sana özel" varsayılan olur', () => {
    expect(varsayilanSiralama(kisiselVarMi(false, true), 'onerilen')).toBe('kisisel');
    expect(varsayilanSiralama(kisiselVarMi(false, false), 'kisisel')).toBe('onerilen');
  });
});
