import { describe, expect, test } from 'bun:test';
import {
  VARSAYILAN_KONU,
  htmlKacis,
  markaAdiniYerlestir,
  sablonGovdesi,
  tanitimMailiOlustur,
} from './template';

describe('marka adi yerlestirme', () => {
  test('{{brand_name}} gercek adla degisir', () => {
    expect(markaAdiniYerlestir('Merhaba {{brand_name}} ekibi', 'Sand Mother')).toBe(
      'Merhaba Sand Mother ekibi',
    );
  });

  test('bos ad verilirse notr ifade kullanilir — sablon etiketi mailde GORUNMEZ', () => {
    const sonuc = markaAdiniYerlestir('Merhaba {{brand_name}} ekibi', '  ');
    expect(sonuc).not.toContain('{{brand_name}}');
    expect(sonuc).toContain('Değerli marka');
  });
});

describe('tanitimMailiOlustur', () => {
  test('konu varsayilan olarak sahibin verdigi metindir', () => {
    expect(tanitimMailiOlustur('Test Marka').subject).toBe(VARSAYILAN_KONU);
  });

  test('duz metin ve html ayni marka adini tasir', () => {
    const mail = tanitimMailiOlustur('Sand Mother');
    expect(mail.text).toContain('Merhaba Sand Mother ekibi');
    expect(mail.html).toContain('Merhaba Sand Mother ekibi');
  });

  test('hicbir yerde islenmemis sablon etiketi kalmaz', () => {
    const mail = tanitimMailiOlustur('Test Marka');
    expect(mail.text).not.toContain('{{');
    expect(mail.html).not.toContain('{{');
    expect(mail.subject).not.toContain('{{');
  });

  test('Turkce karakterler bozulmaz', () => {
    const mail = tanitimMailiOlustur('Çiçek Butik');
    expect(mail.text).toContain('Çiçek Butik');
    expect(mail.html).toContain('Çiçek Butik');
    expect(mail.text).toContain('Sevgiler');
    expect(mail.text).toContain('[Kurucu Adı]');
  });

  test('marka adindaki HTML etiketi kacirilir — mail bozulmaz', () => {
    const mail = tanitimMailiOlustur('<script>alert(1)</script>');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  test('html sade: banner, img, tablo yok', () => {
    const mail = tanitimMailiOlustur('Test Marka');
    expect(mail.html).not.toContain('<img');
    expect(mail.html).not.toContain('<table');
  });

  test('mobil icin viewport etiketi var', () => {
    expect(tanitimMailiOlustur('Test Marka').html).toContain('viewport');
  });

  test('duz metin karsiligi doludur (fallback)', () => {
    const mail = tanitimMailiOlustur('Test Marka');
    expect(mail.text.length).toBeGreaterThan(500);
    expect(mail.text).not.toContain('<p>');
  });

  test('sahip metni duzenlerse o metin kullanilir, ana sablon degismez', () => {
    const mail = tanitimMailiOlustur('Test Marka', 'Merhaba {{brand_name}}, kısa not.');
    expect(mail.text).toBe('Merhaba Test Marka, kısa not.');
    expect(sablonGovdesi()).toContain('Ben [Kurucu Adı]');
  });

  test('konu da gonderime ozel degistirilebilir', () => {
    expect(tanitimMailiOlustur('Test Marka', null, 'Yeni konu').subject).toBe('Yeni konu');
  });

  test('metindeki butun paragraflar html gövdesine gecer', () => {
    const mail = tanitimMailiOlustur('Test Marka');
    const paragrafSayisi = (mail.html.match(/<p /g) ?? []).length;
    expect(paragrafSayisi).toBeGreaterThan(8);
  });
});

describe('site baglantisi', () => {
  test('html surumunde butika.ai gercek bir metin baglantisidir', () => {
    const mail = tanitimMailiOlustur('Test Marka');
    expect(mail.html).toContain('<a href="https://butika.ai"');
    expect(mail.html).toContain('>butika.ai</a>');
  });

  test('duz metin surumunde adres oldugu gibi kalir', () => {
    const mail = tanitimMailiOlustur('Test Marka');
    expect(mail.text).toContain('https://butika.ai');
    expect(mail.text).not.toContain('<a ');
  });

  test('metinde gecen her adres baglantiya cevrilir (govde + imza)', () => {
    const mail = tanitimMailiOlustur('Test Marka');
    expect((mail.html.match(/<a href="https:\/\/butika\.ai"/g) ?? []).length).toBeGreaterThan(1);
  });

  test('sahip metni duzenlerse oradaki adres de baglanti olur', () => {
    const mail = tanitimMailiOlustur('Test Marka', 'Kısa not: https://butika.ai');
    expect(mail.html).toContain('<a href="https://butika.ai"');
    expect(mail.text).toBe('Kısa not: https://butika.ai');
  });

  test('baglanti disinda html sade kalir: buton, banner, gorsel yok', () => {
    const mail = tanitimMailiOlustur('Test Marka');
    expect(mail.html).not.toContain('<img');
    expect(mail.html).not.toContain('<table');
    expect(mail.html).not.toContain('<button');
    expect(mail.html).not.toContain('border-radius');
  });

  test('baglanti mavi ve alti cizili — tiklanabilir oldugu anlasilsin', () => {
    const mail = tanitimMailiOlustur('Test Marka');
    expect(mail.html).toContain('color:#1a73e8');
    expect(mail.html).toContain('text-decoration:underline');
  });

  test('baglanti cevresindeki metinle ayni yazi tipi ve boyutta kalir', () => {
    const mail = tanitimMailiOlustur('Test Marka');
    const etiket = mail.html.match(/<a href="https:\/\/butika\.ai"[^>]*>/)?.[0] ?? '';
    expect(etiket).not.toContain('font-size');
    expect(etiket).not.toContain('font-family');
    expect(etiket).not.toContain('font-weight');
  });

  test('koyu temada baglanti okunur kalir', () => {
    const mail = tanitimMailiOlustur('Test Marka');
    expect(mail.html).toContain('prefers-color-scheme: dark');
    expect(mail.html).toContain('#8ab4f8');
    expect(mail.html).toContain('name="color-scheme"');
  });
});

describe('htmlKacis', () => {
  test('tehlikeli karakterler kacirilir', () => {
    expect(htmlKacis('<b>"x"&</b>')).toBe('&lt;b&gt;&quot;x&quot;&amp;&lt;/b&gt;');
  });
});
