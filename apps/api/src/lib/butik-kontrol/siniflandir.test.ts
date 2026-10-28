import { describe, expect, test } from 'bun:test';
import { siniflandir } from './siniflandir';
const b = (url: string, ad = 'Butik', ulke = 'TR') => ({ id: '1', ad, url, ulke });
const g = (
  p: Partial<{
    hata: string | null;
    status: number | null;
    sonUrl: string | null;
    html: string;
    shopifyParaBirimi: string | null;
  }>,
) => ({ hata: null, status: 200, sonUrl: null, html: '', shopifyParaBirimi: null, ...p });
const turler = (r: { bulgular: { tur: string }[] }) => r.bulgular.map((x) => x.tur).sort();

describe('siniflandir', () => {
  test('DNS hatası açılmıyor', () =>
    expect(
      turler(siniflandir(b('https://vegabutik.com'), g({ hata: 'ENOTFOUND', status: null }))),
    ).toEqual(['acilmiyor']));
  test('park alan adı', () =>
    expect(
      turler(
        siniflandir(
          b('https://www.lamu.co'),
          g({ sonUrl: 'https://www.lamu.co/lander', html: '<script>window.parking=1</script>' }),
        ),
      ),
    ).toEqual(['park_satilik']));
  test('Shopify kapalı', () =>
    expect(
      turler(
        siniflandir(
          b('https://rentony.com'),
          g({ status: 404, html: '<h1>This store is unavailable</h1>' }),
        ),
      ),
    ).toEqual(['magaza_kapali']));
  test('geçici kapalı mesajı', () =>
    expect(
      turler(
        siniflandir(
          b('https://www.modaebva.com'),
          g({ html: 'E-ticaret sitemiz geçici olarak kullanıma kapatılmıştır.' }),
        ),
      ),
    ).toEqual(['magaza_kapali']));
  test('başka alan adı', () => {
    const r = siniflandir(
      b('https://tr.newarrivals.co', 'The New Arrivals'),
      g({ sonUrl: 'https://tr.ilkyazozel.com/', html: '<title>İlkyaz Özel</title> ₺1.299' }),
    );
    expect(turler(r)).toContain('baska_alan_adi');
    expect(r.bulgular.find((x) => x.tur === 'baska_alan_adi')?.deger).toBe('ilkyazozel.com');
  });
  test('www/dil yolu farkı değişim değil', () =>
    expect(
      turler(
        siniflandir(
          b('https://www.minetanbutik.com.tr', 'Mine Tan Butik'),
          g({
            sonUrl: 'https://minetanbutik.com.tr/tr/',
            html: '<title>Mine Tan Butik</title> 999,90 TL',
          }),
        ),
      ),
    ).toEqual([]));
  test('TR pazarında euro (Shopify, pazar çereziyle): para_birimi', () => {
    const r = siniflandir(
      b('https://matmazel.com', 'Matmazel'),
      g({ html: '<title>Matmazel</title>', shopifyParaBirimi: 'EUR' }),
    );
    expect(r.bulgular.find((x) => x.tur === 'para_birimi')?.deger).toBe('EUR');
  });
  test('TR pazarında euro (Shopify değil): konuma bağlı olabilir, elle_bak', () => {
    const r = siniflandir(
      b('https://matmazel.com', 'Matmazel'),
      g({ html: '<title>Matmazel</title><meta property="og:price:currency" content="EUR">' }),
    );
    expect(turler(r)).toEqual(['elle_bak']);
    expect(r.bulgular[0]?.deger).toBe('EUR');
    expect(r.bulgular[0]?.kanit).toContain('Almanya');
  });
  test('aynı marka başka uzantıya yönlenirse sorun yok', () =>
    expect(
      turler(
        siniflandir(
          b('https://organicera.com', 'OrganicEra'),
          g({ sonUrl: 'https://www.organicera.eu/', html: '<title>OrganicEra</title> ₺' }),
        ),
      ),
    ).toEqual([]));
  test('Avrupa uzantısına yönlenme: bölgesel olabilir, yalnız elle_bak', () => {
    const r = siniflandir(
      b('https://zenpirlanta.com', 'ZEN Pırlanta'),
      g({ sonUrl: 'https://www.zen-diamond.de/', html: '<title>Zen Diamond</title> 99 €' }),
    );
    expect(turler(r)).toEqual(['elle_bak']);
    expect(r.bulgular[0]?.deger).toBe('zen-diamond.de');
  });
  test('Shopify meta para birimi önceliklidir', () => {
    const r = siniflandir(
      b('https://x.com', 'X'),
      g({ html: '<title>X</title> ₺', shopifyParaBirimi: 'GBP' }),
    );
    expect(r.ozet.paraBirimi).toBe('GBP');
  });
  test('ABD pazarında TL', () =>
    expect(
      turler(
        siniflandir(
          b('https://saintones.com', 'Saint Ones', 'US'),
          g({ html: '<title>Saint Ones</title>', shopifyParaBirimi: 'TRY' }),
        ),
      ),
    ).toContain('para_birimi'));
  test('marka uyuşmuyor', () =>
    expect(
      turler(
        siniflandir(
          b('https://aysegulkalelio.com', 'violet'),
          g({
            html: '<title>Ayşegül Kalelio</title><meta property="og:site_name" content="Ayşegül Kalelio"> ₺',
          }),
        ),
      ),
    ).toContain('marka_uyusmuyor'));
  test('Türkçe sadeleştirmeyle marka uyar', () =>
    expect(
      turler(
        siniflandir(
          b('https://ilkyazozel.com', 'İlkyaz Özel'),
          g({ html: '<title>ILKYAZ OZEL | Kadın</title> ₺' }),
        ),
      ),
    ).toEqual([]));
  test('moda dışı', () =>
    expect(
      turler(
        siniflandir(
          b('https://www.patrol.com.tr', 'Patrol'),
          g({ html: '<title>Patrol Matbaa | Baskı ve Ambalaj</title>' }),
        ),
      ),
    ).toContain('moda_disi'));
  test('bakım sayfası içerik ve TL gösteriyorsa sorun yok', () =>
    expect(
      turler(
        siniflandir(
          b('https://www.modaala.com', 'Moda Alâ'),
          g({
            sonUrl: 'https://www.modaala.com/Bakim.aspx',
            html: '<title>Tesettür Giyim | Modaala.com</title> Sepete ekle 1.299 TL bakım',
          }),
        ),
      ),
    ).toEqual([]));
  test('Cloudflare korumalı: elle bak, kapalı değil', () => {
    const r = siniflandir(
      b('https://no33butik.com', 'No33'),
      g({ status: 403, html: '<title>Just a moment...</title> cf-challenge' }),
    );
    expect(turler(r)).toEqual(['elle_bak']);
    expect(r.ozet.acildi).toBe(true);
  });
  test('zaman aşımı: elle bak', () =>
    expect(turler(siniflandir(b('https://x.com'), g({ hata: 'timeout', status: null })))).toEqual([
      'elle_bak',
    ]));
});

describe('düzeltme turu 1', () => {
  const urunler = '<button>Sepete ekle</button> 100 TL 200 TL 300 TL '.repeat(3);
  test('bakım kelimesi gövdede geçince sorun maskelenmez (başlık/h1/yol yok)', () => {
    const r = siniflandir(
      b('https://x.com', 'Xenia'),
      g({ status: 404, html: '<title>Xenia</title> Sepete ekle 100 TL bakım' }),
    );
    expect(turler(r)).toEqual(['acilmiyor']);
  });
  test('bakım sayfası fiyat rakama bitişik değilse maskelemez', () => {
    const r = siniflandir(
      b('https://x.com', 'Xenia'),
      g({
        status: 404,
        sonUrl: 'https://x.com/maintenance',
        html: '<title>Xenia</title> Sepete ekle TL bakım',
      }),
    );
    expect(turler(r)).toEqual(['acilmiyor']);
  });
  test('bakım sayfası park bulgusunu maskelemez', () => {
    const r = siniflandir(
      b('https://x.com', 'Xenia'),
      g({
        sonUrl: 'https://x.com/maintenance',
        html: '<title>Bakım</title> Sepete ekle 100 TL domain is for sale',
      }),
    );
    expect(turler(r)).toEqual(['park_satilik']);
  });
  test('bakım sayfası başka alan adını maskelemez', () => {
    const r = siniflandir(
      b('https://x.com', 'Xenia'),
      g({
        sonUrl: 'https://y.com/Bakim.aspx',
        html: '<title>Xenia bakım</title> Sepete ekle 100 TL',
      }),
    );
    expect(turler(r)).toContain('baska_alan_adi');
  });
  test('para birimi: script/yorum/tek sembol sayılmaz', () => {
    const html = `<title>Kadın Moda</title><script>var a="€1 €2 €3 €4";</script><!-- £1 £2 £3 --> ₺ menü € ${'100 TL '.repeat(1)}`;
    const r = siniflandir(b('https://x.com', 'Kadın Moda'), g({ html }));
    expect(turler(r)).toEqual([]);
  });
  test('para birimi: sayı entity çözülür ve 3 adet şart', () => {
    const tl = '&#8378;100 &#x20BA;200 300 TL';
    expect(
      siniflandir(b('https://x.com', 'Xenia'), g({ html: `<title>Xenia</title> ${tl}` })).ozet
        .paraBirimi,
    ).toBe('TRY');
    const eur = '€100 €200 €300';
    expect(
      turler(siniflandir(b('https://x.com', 'Xenia'), g({ html: `<title>Xenia</title> ${eur}` }))),
    ).toEqual(['elle_bak']);
    expect(
      turler(
        siniflandir(b('https://x.com', 'Xenia'), g({ html: '<title>Xenia</title> €100 €200' })),
      ),
    ).toEqual([]);
  });
  test('marka: entity, genel kelime ve alan adı etiketi', () => {
    expect(
      turler(
        siniflandir(
          b('https://ilkyaz.com.tr', 'İlkyaz Butik'),
          g({ html: '<title>Ana Sayfa</title> ₺' }),
        ),
      ),
    ).toEqual([]);
    expect(
      turler(
        siniflandir(
          b('https://x.com', 'Ay&#351;e Moda'),
          g({ html: '<title>Ay&#351;e | Kadın</title>' }),
        ),
      ),
    ).toEqual([]);
    expect(
      turler(siniflandir(b('https://x.com', 'Butik'), g({ html: '<title>Başka Bir Şey</title>' }))),
    ).toEqual([]);
    expect(
      turler(
        siniflandir(
          b('https://x.com', 'Zeynep Sönmez'),
          g({ html: '<title>Başka Marka</title> © Başka Marka' }),
        ),
      ),
    ).toContain('marka_uyusmuyor');
  });
  test('marka: görünür metin/altbilgide geçiyorsa uyar', () => {
    expect(
      turler(
        siniflandir(
          b('https://x.com', 'Zeynep Sönmez'),
          g({ html: '<title>Anasayfa</title><body>© 2026 Zeynep Sönmez</body>' }),
        ),
      ),
    ).toEqual([]);
  });
  test('dan.com yalnız başına park değil, ürünlü sayfada hiç değil', () => {
    expect(
      turler(
        siniflandir(
          b('https://x.com', 'Xenia'),
          g({
            html: '<title>Xenia</title> Sepete ekle <a href="https://dan.com/x">dan.com</a> 1 TL',
          }),
        ),
      ),
    ).toEqual([]);
    expect(
      turler(
        siniflandir(
          b('https://x.com', 'Xenia'),
          g({
            html: '<title>Xenia</title> <a href="https://soydan.com/">soydan.com</a> yazı yazı yazı',
          }),
        ),
      ),
    ).toEqual([]);
    expect(
      turler(
        siniflandir(
          b('https://x.com', 'Xenia'),
          g({ html: '<title>x</title> Visit https://dan.com/buy' }),
        ),
      ),
    ).toEqual(['park_satilik']);
  });
  test('"parking" kelimesi tek başına park değil', () => {
    expect(
      turler(
        siniflandir(
          b('https://x.com', 'Xenia'),
          g({ html: '<title>Xenia</title> Ücretsiz car parking' }),
        ),
      ),
    ).toEqual([]);
  });
  test('Yapım aşamasında: ürünlü büyük sayfada sayılmaz, başlıkta sayılır', () => {
    const buyuk = `<title>Xenia</title> Sepete ekle Yapım aşamasında ${'x'.repeat(31000)}`;
    expect(turler(siniflandir(b('https://x.com', 'Xenia'), g({ html: buyuk })))).toEqual([]);
    expect(
      turler(
        siniflandir(
          b('https://x.com', 'Xenia'),
          g({ html: `<title>Yapım aşamasında</title>${'x'.repeat(31000)} Sepete ekle` }),
        ),
      ),
    ).toEqual(['magaza_kapali']);
  });
  test('401/403/429 koruma izi olmadan elle bak', () => {
    for (const status of [401, 403, 429]) {
      const r = siniflandir(b('https://x.com', 'Xenia'), g({ status, html: 'Access denied' }));
      expect(turler(r)).toEqual(['elle_bak']);
      expect(r.ozet.acildi).toBe(true);
    }
    expect(
      turler(
        siniflandir(b('https://x.com'), g({ status: 403, html: 'This store is unavailable' })),
      ),
    ).toEqual(['magaza_kapali']);
  });
  test('Shopify şifre sayfası yalnız yolla yeter', () => {
    expect(
      turler(
        siniflandir(
          b('https://x.com'),
          g({ sonUrl: 'https://x.com/password', html: '<title>Xenia</title> kapalı' }),
        ),
      ),
    ).toEqual(['magaza_kapali']);
    expect(
      turler(
        siniflandir(
          b('https://x.com'),
          g({ html: '<title>Butik</title> Enter store using password' }),
        ),
      ),
    ).toEqual(['magaza_kapali']);
    expect(
      turler(
        siniflandir(
          b('https://x.com', 'Xenia'),
          g({ sonUrl: 'https://x.com/passwords-tips', html: '<title>Xenia</title> x' }),
        ),
      ),
    ).toEqual([]);
  });
  test('moda_disi: tişört/pantolon bağlamı ve baskı', () => {
    expect(
      turler(
        siniflandir(
          b('https://x.com', 'Xenia'),
          g({ html: '<title>Xenia | Baskılı Tişört</title>' }),
        ),
      ),
    ).toEqual([]);
    expect(
      turler(siniflandir(b('https://x.com', 'Xenia'), g({ html: '<title>Xenia | Baskı</title>' }))),
    ).toEqual([]);
    expect(
      turler(
        siniflandir(
          b('https://x.com', 'Xenia'),
          g({ html: '<title>Xenia | Baskı & Ambalaj</title>' }),
        ),
      ),
    ).toContain('moda_disi');
  });
  test('ETIMEDOUT zaman aşımı', () =>
    expect(turler(siniflandir(b('https://x.com'), g({ hata: 'ETIMEDOUT', status: null })))).toEqual(
      ['elle_bak'],
    ));
  test('og:site_name tek tırnak ve tırnak içinde karşı tırnak', () => {
    const r = siniflandir(
      b('https://x.com', 'Zeynep Sönmez'),
      g({ html: `<title>t</title><meta content='D"Or Store' property='og:site_name'>` }),
    );
    expect(r.bulgular.find((x) => x.tur === 'marka_uyusmuyor')?.deger).toBe('D"Or Store');
  });
  test('bağlantı hatasında sayfa yok: acildi=false (önceki değerler korunur)', () => {
    for (const hata of [
      'timeout',
      'ETIMEDOUT',
      'unable to verify the first certificate',
      'ENOTFOUND: x',
      'garip hata',
      'butika_yonlendirme: https://butika.ai/',
    ]) {
      const r = siniflandir(b('https://x.com'), g({ hata, status: null }));
      expect(r.ozet.acildi).toBe(false);
    }
    expect(
      turler(
        siniflandir(
          b('https://x.com'),
          g({ hata: 'butika_yonlendirme: https://butika.ai/', status: null }),
        ),
      ),
    ).toEqual(['elle_bak']);
  });
  test('eksik sertifika zinciri elle bak, süresi dolmuş sertifika açılmıyor', () => {
    expect(
      turler(
        siniflandir(
          b('https://x.com'),
          g({ hata: 'unable to verify the first certificate', status: null }),
        ),
      ),
    ).toEqual(['elle_bak']);
    expect(
      turler(siniflandir(b('https://x.com'), g({ hata: 'CERT_HAS_EXPIRED', status: null }))),
    ).toEqual(['acilmiyor']);
  });
});

describe('yerel curl hatası', () => {
  test('sitenin açılmadığı sayılmaz, elle_bak', () => {
    const r = siniflandir(
      { id: '1', ad: 'X', url: 'https://x.com', ulke: 'TR' },
      {
        hata: 'yerel curl hatası (kod 77)',
        status: null,
        sonUrl: null,
        html: '',
        shopifyParaBirimi: null,
      },
    );
    expect(r.bulgular.map((b) => b.tur)).toEqual(['elle_bak']);
  });
});
