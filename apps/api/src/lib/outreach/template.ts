// Tanitim maili sablonu.
//
// Ana metin SABIT. AI her marka icin metin yazmaz; yalnizca {{brand_name}}
// degistirilir. Tasarim bilincli olarak sade: newsletter degil, kisisel mail
// gorunumunde. Buyuk banner, reklam gorseli, agir HTML yok.

export const KAMPANYA_KIMLIGI = 'tanitim-v1';
export const VARSAYILAN_KONU = 'Butika’da yerinizi aldınız ✨';
export const GONDEREN_ADI = 'Butika';
export const GONDEREN_EPOSTA = 'hello@butika.ai';

// Duz metin gövde. HTML e-postayi engelleyen istemciler icin de bu kullanilir.
const GOVDE_DUZ = `Merhaba {{brand_name}} ekibi,

Ben [Kurucu Adı], Butika'nın kurucusuyum.

Butika, Türkiye'deki bağımsız butik ve markaları kullanıcılarla buluşturan, yapay zekâ destekli bir mobil keşif platformu.

Kendi web sitesi üzerinden satış yapan bağımsız markaları kategorize ederek kullanıcıların yeni markalar keşfetmesini sağlıyoruz. Kullanıcı, ilgisini çeken bir markayı Butika üzerinden keşfettikten sonra doğrudan markanın kendi web sitesine yönlendiriliyor ve ürünleri burada inceliyor.

Beğendiği ürünleri farklı markalardan olsa bile Butika'da tek bir yerde favorilerine kaydedebiliyor. Favorilediği bir ürün indirime girdiğinde veya yeniden stoğa geldiğinde bildirim alıyor ve ürünü incelemek için tekrar markanın kendi sitesine yönlendiriliyor.

Böylece Butika kullanıcı için farklı markaları keşfetmeyi ve takip etmeyi kolaylaştırırken, markalar için de yeni kullanıcıların keşfi, ilgili trafik ve yeniden ziyaret fırsatı yaratıyor. Alışveriş ise her zaman doğrudan markanın kendi sitesinde tamamlanıyor.

Şu anda App Store'da yayınlanma aşamasındayız ve Türkiye'deki bağımsız markalardan oluşturduğumuz seçkimizi hazırlıyoruz. Markanız da bu seçkiye dahil edildi.

Bu aşamada sizden herhangi bir ücret veya teknik entegrasyon talep etmiyoruz.

Butika'yı https://butika.ai üzerinden inceleyebilirsiniz.

Uygulamamız yayına alındığında sizi ayrıca bilgilendireceğiz. Butika'da yer almak istememeniz halinde ise bu e-postayı yanıtlamanız yeterli; talebiniz doğrultusunda markanızı en geç 48 saat içerisinde platformdan kaldırabiliriz.

Butika'ya hoş geldiniz. 🤍

Sevgiler,

[Kurucu Adı]
Kurucu, Butika
https://butika.ai`;

// Metinde gecen adres HTML'de gercek baglantiya cevrilir. Brevo YALNIZ gercek
// <a href> baglantilarinin tiklanmasini sayabiliyor; duz yazi adresi mail
// istemcisi kendi tiklanabilir yapiyor ve tiklama Brevo'dan gecmiyor.
// Duz metin surumunde adres oldugu gibi (https://butika.ai) kalir.
const SITE_ADRESI = 'https://butika.ai';

// Baglanti rengi. Acik temada #1a73e8, koyu temada #8ab4f8 (asagidaki medya
// sorgusu). Ikisi de mail istemcilerinin alisilmis "tiklanabilir mavi"si;
// buton/banner degil, yalnizca renk + alti cizgi.
const BAGLANTI_RENGI = '#1a73e8';
const BAGLANTI_RENGI_KOYU = '#8ab4f8';

/** Kacirilmis HTML metnindeki site adresini metin baglantisina cevirir. */
export function baglantiEkle(kacirilmisMetin: string): string {
  return kacirilmisMetin.replaceAll(
    SITE_ADRESI,
    // font-size/font-family YOK: cevresindeki metinle ayni kalsin diye
    // bilincli olarak devralinir.
    `<a href="${SITE_ADRESI}" class="site-baglantisi" style="color:${BAGLANTI_RENGI}; text-decoration:underline;">butika.ai</a>`,
  );
}

/** HTML'e gomulecek metinde etiket kacisi olmasin. */
export function htmlKacis(metin: string): string {
  return metin
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Marka adini yerlestirir. Bilinmiyorsa notr bir ifade kullanilir. */
export function markaAdiniYerlestir(metin: string, markaAdi: string): string {
  const temiz = markaAdi.trim() || 'Değerli marka';
  return metin.replaceAll('{{brand_name}}', temiz);
}

export type MailIcerigi = {
  subject: string;
  text: string;
  html: string;
};

/**
 * Gonderilecek mailin son halini uretir.
 * @param markaAdi {{brand_name}} yerine gececek ad
 * @param govdeOverride Sahip onizleme ekraninda metni duzenlediyse (yalniz o
 *        gonderim icin; ana sablon degismez)
 */
export function tanitimMailiOlustur(
  markaAdi: string,
  govdeOverride?: string | null,
  konuOverride?: string | null,
): MailIcerigi {
  const govde = markaAdiniYerlestir(govdeOverride?.trim() || GOVDE_DUZ, markaAdi);
  const subject = markaAdiniYerlestir(konuOverride?.trim() || VARSAYILAN_KONU, markaAdi);

  // Paragraflari <p> ile sar; tek satir sonlarini <br> yap.
  const paragraflar = govde
    .split(/\n{2,}/)
    .map(
      (p) => `<p style="margin:0 0 16px;">${baglantiEkle(htmlKacis(p)).replace(/\n/g, '<br>')}</p>`,
    )
    .join('\n      ');

  const html = `<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${htmlKacis(subject)}</title>
    <style>
      /* Koyu temada baglanti okunur kalsin; istemci renkleri ters cevirirse
         koyu mavi zeminde kaybolmasin diye acik maviye geciyor. */
      @media (prefers-color-scheme: dark) {
        .site-baglantisi { color: ${BAGLANTI_RENGI_KOYU} !important; }
      }
    </style>
  </head>
  <body style="margin:0; padding:0; background:#ffffff;">
    <div style="max-width:600px; margin:0 auto; padding:24px 20px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#1c1c1c;">
      ${paragraflar}
    </div>
  </body>
</html>`;

  return { subject, text: govde, html };
}

/** Ana sablonun ham hali — onizleme ekraninda duzenlemeye acilir. */
export function sablonGovdesi(): string {
  return GOVDE_DUZ;
}
