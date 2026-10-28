/**
 * Butik sitesinde kullanıcının nerede olduğunu anlamaya yarayan küçük yardımcılar.
 *
 * Neden var: uygulama içi tarayıcıda "Kaydet" her sayfada görünüyor. Kullanıcı
 * butiğin ANA SAYFASINDAYKEN kaydedince ortaya fiyatı olmayan bir kayıt çıkıyor;
 * "fiyatı düşerse haber veririz" sözü o kayıt için asla gerçekleşemiyor.
 * (21-22 Eylül 2026 canlı veri: kaydedilen 11 şeyin 9'u butiğin ana sayfasıydı.)
 *
 * Bilerek YALNIZ ana sayfayı tespit ediyoruz. "Bu bir ürün sayfası mı" sorusunun
 * genel cevabı sitelere göre çok değişken; yanlış alarm verip kullanıcının meşru
 * kaydını engellemektense, yalnız kesin olan durumu yakalıyoruz.
 */

/** Adres butiğin kök sayfası mı? ("/", "" ya da yalnız dil öneki) */
export function anaSayfaMi(adres: string): boolean {
  let yol: string;

  try {
    yol = new URL(adres).pathname;
  } catch {
    return false; // Adres çözümlenemiyorsa karışma, normal akış devam etsin.
  }

  const temiz = yol.replace(/\/+$/, '');

  if (temiz === '') return true;

  // Çok dilli mağazalarda kök sayfa /tr, /en-tr, /tr-TR gibi görünebilir.
  return /^\/[a-z]{2}(-[a-z]{2})?$/i.test(temiz);
}
