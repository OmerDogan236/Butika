import { type MailIcerigi, htmlKacis } from '../outreach/template';

/** Bağlantı kurulunca butiğe giden tek seferlik mail (aylık özetle aynı sade düzen). */
export function hosGeldinMaili(
  butikAdi: string,
  platform: 'ikas' | 'shopify' = 'ikas',
): MailIcerigi {
  const shopify = platform === 'shopify';
  const satirlar = [
    `Merhaba ${butikAdi} ekibi,`,
    `${shopify ? 'Shopify' : 'ikas'} mağazanız Butika’ya bağlandı, teşekkür ederiz.`,
    'Ürünleriniz birkaç saat içinde Butika’da görünmeye başlayacak. Fiyat ve stok bilgisi mağazanızdan kendiliğinden güncellenir; sizin ayrıca bir şey yapmanız gerekmez.',
    'Butika’dan gelen kullanıcılar alışverişi her zaman sizin sitenizde tamamlar; siparişler panelinizde her zamanki gibi görünür.',
    'Şu an deneme dönemindesiniz: Butika’dan gelen satışlar için komisyon hesaplanır ama tahsil edilmez. Her ayın başında size kısa bir özet göndereceğiz.',
    shopify
      ? "Ayrılmak isterseniz Shopify'da Butika uygulamasını kaldırmanız yeterli; bağlantı hemen kapanır."
      : 'Ayrılmak isterseniz ikas panelinizde Butika uygulamasını kaldırmanız yeterli; bağlantı hemen kapanır.',
    'Sorunuz olursa bu e-postayı yanıtlamanız yeterli.',
    'Sevgiler,\n\n[Kurucu Adı]\nKurucu, Butika\nhttps://butika.ai',
  ];
  const text = satirlar.join('\n\n');
  const subject = 'Butika bağlantınız hazır';
  const paragraflar = satirlar
    .map((p) => `<p style="margin:0 0 16px;">${htmlKacis(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n      ');
  const html = `<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${htmlKacis(subject)}</title>
  </head>
  <body style="margin:0; padding:0; background:#ffffff;">
    <div style="max-width:600px; margin:0 auto; padding:24px 20px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#1c1c1c;">
      ${paragraflar}
    </div>
  </body>
</html>`;
  return { subject, text, html };
}
