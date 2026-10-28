import { GONDEREN_EPOSTA, htmlKacis } from '../outreach/template';

// ikas panelinin iframe içinde (Shopify'da uygulama adresinde) açtığı küçük sayfalar. Dış kaynak (font, görsel,
// betik) yok; renkler Butika tasarım token'larından (bordo, krem).
const BORDO = '#561C2A';
const KREM = '#F8F5F0';
const MUREKKEP = '#1A1A1A';

function sayfa(baslik: string, paragraflar: string[]): string {
  const govde = paragraflar.map((p) => `<p>${htmlKacis(p)}</p>`).join('\n    ');
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Butika</title>
  <style>
    body { margin: 0; background: ${KREM}; color: ${MUREKKEP};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 16px; line-height: 1.6; }
    main { max-width: 560px; margin: 0 auto; padding: 32px 20px; }
    .marka { color: ${BORDO}; font-family: Georgia, serif; font-style: italic; font-size: 28px; margin: 0 0 16px; }
    h1 { color: ${BORDO}; font-size: 20px; margin: 0 0 12px; }
    p { margin: 0 0 12px; }
    a { color: ${BORDO}; }
  </style>
</head>
<body>
  <main>
    <p class="marka">Butika</p>
    <h1>${htmlKacis(baslik)}</h1>
    ${govde}
    <p>Sorunuz için: <a href="mailto:${GONDEREN_EPOSTA}">${GONDEREN_EPOSTA}</a></p>
  </main>
</body>
</html>`;
}

export type KurulumDurumu = 'bagli' | 'bagli_degil' | 'gecersiz' | 'kullanilamiyor';

/** ikas paneli › Uygulamalar › Butika (ya da Shopify uygulama adresi) açılınca gösterilen sayfa. */
export function kurulumSayfasi(
  durum: KurulumDurumu,
  platform: 'ikas' | 'shopify' = 'ikas',
): string {
  const shopify = platform === 'shopify';
  if (durum === 'bagli') {
    return sayfa('Butika bağlantınız açık.', [
      'Bağlantınız kurulu. Ürünleriniz Butika’ya düzenli olarak aktarılıyor.',
      ...(shopify
        ? ["Ayrılmak isterseniz Shopify'da Butika uygulamasını kaldırmanız yeterli."]
        : []),
    ]);
  }
  if (durum === 'bagli_degil') {
    return sayfa('Bağlantı henüz tamamlanmadı', [
      'Bağlantıyı tamamlamak için size gönderdiğimiz davet linkini açın.',
      'Davet linkiniz yoksa bize yazın, hemen gönderelim.',
    ]);
  }
  if (durum === 'kullanilamiyor') {
    return sayfa('Butika bağlantısı şu an kullanılamıyor', ['Kısa süre içinde yeniden deneyin.']);
  }
  return sayfa('Bu sayfa doğrulanamadı', [
    shopify
      ? 'Shopify panelinizden Butika uygulamasını yeniden açmayı deneyin.'
      : 'ikas panelinizden Butika uygulamasını kapatıp yeniden açmayı deneyin.',
  ]);
}
