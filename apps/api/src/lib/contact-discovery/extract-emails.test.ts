import { describe, expect, test } from 'bun:test';
import { epostalariCikar } from './extract-emails';

// Bu testlerin en onemli yarisi "bulMAmali" diyenler: uydurma ya da alakasiz
// bir adresi butik sahibine mail olarak gondermek, hic adres bulamamaktan
// cok daha zararli.

const adresler = (html: string) =>
  epostalariCikar(html)
    .map((x) => x.email)
    .sort();

describe('epostalariCikar — bulmasi gerekenler', () => {
  test('mailto linki', () => {
    expect(adresler('<a href="mailto:info@marka.com">Bize yazın</a>')).toEqual(['info@marka.com']);
  });

  test('mailto linkindeki konu parametresi adrese karismaz', () => {
    expect(adresler('<a href="mailto:info@marka.com?subject=Merhaba">yaz</a>')).toEqual([
      'info@marka.com',
    ]);
  });

  test('duz metinde yazan adres', () => {
    expect(adresler('<p>İletişim: siparis@butik.com.tr</p>')).toEqual(['siparis@butik.com.tr']);
  });

  test('cumle sonundaki nokta adrese yapismaz', () => {
    expect(adresler('<p>Bize info@marka.com adresinden ulaşın.</p>')).toEqual(['info@marka.com']);
  });

  test('gizlenmis yazim: [at] ve [dot]', () => {
    expect(adresler('<p>info [at] marka [dot] com</p>')).toEqual(['info@marka.com']);
  });

  test('gizlenmis yazim: (at) ile', () => {
    expect(adresler('<p>destek(at)marka.com</p>')).toEqual(['destek@marka.com']);
  });

  test('HTML varligiyla gizlenmis adres cozulur', () => {
    expect(adresler('<p>info&#64;marka.com</p>')).toEqual(['info@marka.com']);
  });

  test('ayni adres birden cok yerde gecse tek satir doner', () => {
    const html = '<a href="mailto:info@marka.com">yaz</a><p>info@marka.com</p>';
    expect(epostalariCikar(html)).toHaveLength(1);
  });

  test('mailto kaynagi metin kaynagini ezer', () => {
    const html = '<p>info@marka.com</p><a href="mailto:info@marka.com">yaz</a>';
    expect(epostalariCikar(html)[0]?.foundIn).toBe('mailto');
  });

  test('birden cok farkli adres bulunur', () => {
    const html = '<a href="mailto:info@marka.com">a</a><p>basin@marka.com</p>';
    expect(adresler(html)).toEqual(['basin@marka.com', 'info@marka.com']);
  });

  test('buyuk harfli adres kucultulur', () => {
    expect(adresler('<p>INFO@MARKA.COM</p>')).toEqual(['info@marka.com']);
  });

  // Gercek ornek: desen.com.tr iletisim sayfasinda adres yalniz JSON-LD icinde.
  // Script bloklarini komple atarsak bu adresi kaciriyoruz.
  test('JSON-LD icindeki email alani okunur', () => {
    const html = `<script type="application/ld+json">
      {"@type":"Organization","name":"Desen","contactPoint":[{"@type":"ContactPoint","email":"eticaret@desen.com.tr","telephone":"0850"}]}
    </script>`;
    expect(adresler(html)).toEqual(['eticaret@desen.com.tr']);
  });

  test('JSON-LD kaynagi yapisal olarak isaretlenir', () => {
    const html = '<script type="application/ld+json">{"email":"info@marka.com"}</script>';
    expect(epostalariCikar(html)[0]?.foundIn).toBe('yapisal');
  });

  test('JSON-LD bozuksa cokmeden devam eder', () => {
    const html = '<script type="application/ld+json">{bozuk json</script><p>info@marka.com</p>';
    expect(adresler(html)).toEqual(['info@marka.com']);
  });

  // Gercek ornek: desen.com.tr'nin JSON-LD blogu gecersiz JSON ("Unterminated
  // string"), ama email alani duzgun yazilmis. Sirf site hatali diye adresi
  // kacirmayalim; yine de YALNIZ email alanini okuyoruz.
  test('bozuk JSON-LD icindeki email alani yine de okunur', () => {
    const html = `<script type="application/ld+json">
      {"@type":"Organization","email": "eticaret@desen.com.tr","address":"yarim kalmis
    </script>`;
    expect(adresler(html)).toEqual(['eticaret@desen.com.tr']);
  });
});

describe('epostalariCikar — bulMAmasi gerekenler', () => {
  test('adres yoksa bos dizi — alan adindan adres UYDURULMAZ', () => {
    expect(epostalariCikar('<html><body><h1>Marka</h1></body></html>')).toEqual([]);
  });

  test('gorsel dosya adi adres sanilmaz', () => {
    expect(adresler('<img src="logo@2x.png">')).toEqual([]);
  });

  test('script icindeki ornek/analitik adres alinmaz', () => {
    const html = '<script>var user="test@example.com";</script><p>Marka</p>';
    expect(adresler(html)).toEqual([]);
  });

  test('JSON-LD icinde email ALANI yoksa metinden adres devsirilmez', () => {
    // Sentry dsn gibi degerler "email" alani olmadigi icin alinmamali
    const html =
      '<script type="application/ld+json">{"dsn":"abc123@o1.ingest.de.sentry.io"}</script>';
    expect(adresler(html)).toEqual([]);
  });

  test('platform saglayicisinin adresi alinmaz', () => {
    expect(adresler('<p>destek@ticimax.com</p>')).toEqual([]);
  });

  test('form yer tutucusu adres sanilmaz', () => {
    expect(adresler('<input placeholder="email@domain.com">')).toEqual([]);
  });

  test('noreply adresi alinmaz — oraya yazilan mail kimseye ulasmaz', () => {
    expect(adresler('<p>noreply@marka.com</p>')).toEqual([]);
  });

  test('etiketle bolunmus metin yanlis birlestirilmez', () => {
    expect(adresler('<p>info@</p><span>marka.com</span>')).toEqual([]);
  });

  test('stil blogundaki metin adres sanilmaz', () => {
    expect(adresler('<style>.a{background:url(x@2x.png)}</style>')).toEqual([]);
  });
});
