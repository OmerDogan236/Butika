// apps/api/src/lib/kayit/urun-adi.test.ts
import { expect, test } from 'bun:test';
import { urunAdiAyir, urunAdiTemizle } from './urun-adi';

const t = (title: string, butikAdi: string, alanAdi = 'www.ornek.com') =>
  urunAdiTemizle(title, { butikAdi, alanAdi });

test('varyant eki ayrılır ve temizlikten sonra geri eklenir', () => {
  expect(urunAdiAyir('Gri Yumoş Patlı İkili Takım · Beden: S')).toEqual({
    ad: 'Gri Yumoş Patlı İkili Takım',
    varyant: 'Beden: S',
  });
  expect(urunAdiAyir('Düz Ad')).toEqual({ ad: 'Düz Ad', varyant: null });
  expect(t('Kırmızı Alden Yıkamalı Ceket | Suud Collection · Renk: Kırmızı / Beden: M', 'Suud Collection')).toBe(
    'Kırmızı Alden Yıkamalı Ceket · Renk: Kırmızı / Beden: M',
  );
});

test('butik adı ve kategori ekleri atılır', () => {
  expect(t('PİLELİ KEMERLİ EKOSE ETEK CAMEL | Manuka', 'Manuka')).toBe('PİLELİ KEMERLİ EKOSE ETEK CAMEL');
  expect(t('91685 Desenli Straplez Elbise-Mavi | ELBİSE | Dilvin', 'Dilvin')).toBe(
    '91685 Desenli Straplez Elbise-Mavi',
  );
  expect(t('Toka Detaylı Modal Örme Elbise - Siyah | Uzun Elbise', 'Gusto')).toBe(
    'Toka Detaylı Modal Örme Elbise - Siyah',
  );
  expect(t('0,30 Karat Pırlanta Su Yolu Bileklik - 3001141505 / ZEN Pırlanta', 'Zen Pırlanta')).toBe(
    '0,30 Karat Pırlanta Su Yolu Bileklik - 3001141505',
  );
  expect(t('LİNDA Bağlama Detaylı Takım 4341 - Acı Kahve ALT - ÜST TAKIM Mooi Butik', 'Mooi Butik')).toBe(
    'LİNDA Bağlama Detaylı Takım 4341 - Acı Kahve ALT - ÜST TAKIM',
  );
});

test('fiyat addan çıkarılır, varyant kalır', () => {
  expect(t('Siyah Kayık Yaka Transparan Bluz 459,00  TL · Beden: S', 'Havoş')).toBe(
    'Siyah Kayık Yaka Transparan Bluz · Beden: S',
  );
  expect(t('Kahverengi Kadife Takım 2.499,00 TL', 'Havoş')).toBe('Kahverengi Kadife Takım');
  expect(t('Mavi Kazak ₺899', 'Havoş')).toBe('Mavi Kazak');
  expect(t('Haki Nora Çizgili Polo Yaka Kazak 1199,00  TL', 'Havoş')).toBe('Haki Nora Çizgili Polo Yaka Kazak');
  expect(t('Triko Kazak 1199 TL', 'Havoş')).toBe('Triko Kazak');
});

test('addaki meşru tire ve virgüllü sayı korunur', () => {
  expect(t('Exclusive Şal 3073-8 Bakır - Siyah | Eşarppark', 'Eşarppark')).toBe(
    'Exclusive Şal 3073-8 Bakır - Siyah',
  );
  expect(t('0,30 Karat Tektaş Yüzük', 'Zen Pırlanta')).toBe('0,30 Karat Tektaş Yüzük');
  expect(t('Guidance 46 Extrait 100ML | Amouage Lüks Parfüm', 'Miskanber')).toBe('Guidance 46 Extrait 100ML');
});

test('geriye anlamlı bir şey kalmazsa özgün başlık döner', () => {
  expect(t('Manuka', 'Manuka')).toBe('Manuka');
  expect(t('www.bebebutigiim.com', 'Bebe Butiğim', 'www.bebebutigiim.com')).toBe('www.bebebutigiim.com');
  expect(t('  ', 'Manuka')).toBe('');
  expect(t('459,00 TL', 'Havoş')).toBe('459,00 TL');
});

test('boşluklar toparlanır', () => {
  expect(t('Mavi   V Yaka  Kazak  ', 'Havoş')).toBe('Mavi V Yaka Kazak');
});

test('adın parçası olan tutar korunur; butik adı başta ise ürün adı ikinci parçadır', () => {
  expect(t('100 TL Hediye Çeki', 'Havoş')).toBe('100 TL Hediye Çeki');
  expect(t('Manuka | Kırmızı Elbise', 'Manuka')).toBe('Kırmızı Elbise');
});
