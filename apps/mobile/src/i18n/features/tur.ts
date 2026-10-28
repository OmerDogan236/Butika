// Onboarding turunun baloncuk metinleri.
// Dil kurali: varsayim yapma, somut ornek ver, "zaten belli" diye atlama.
export const turTr = {
  ileri: 'İleri',
  atla: 'Atla',

  vitrinTanitimBaslik: 'Keşfet',
  vitrinTanitimMetin: "Butika'daki bütün markalar burada, kategorilere ayrılmış olarak duruyor.",

  kategorilerBaslik: 'Kategoriler',
  // 1.2.4: kategoriler yeniden üstte, yana kayan şeritte.
  kategorilerMetin:
    'Bütün kategoriler üstteki şeritte. Yana kaydır, birine dokun; o kategorinin butikleri aşağıda görünsün.',

  siralaBaslik: 'Fiyata göre sırala',
  // "ucuz" kelimesi bilerek kullanilmiyor — listelenen markalari rahatsiz eder.
  // Butonun kendi etiketleriyle ayni dil: "Artan fiyat" / "Azalan fiyat".
  siralaMetin: 'Butikleri artan veya azalan fiyata göre sıralayabilirsin.',

  butikOnerBaslik: 'Aradığın butik yoksa',
  butikOnerMetin: "Butika'da olmayan bir markayı buradan bize yaz. İnceleyip ekliyoruz.",

  kalpBaslik: 'Fiyatını takip edelim',
  kalpMetin:
    'Beğendiğin ürünü gördüğünde buraya dokun. Fiyatı düşerse ya da stoğa dönerse sana haber veririz.',

  yorumBaslik: 'Yorumlar',
  yorumMetin: 'Bu ürün için başkalarının yazdıklarını okursun. Sen de yazabilirsin.',

  koleksiyonEkleBaslik: 'Koleksiyona ekle',
  koleksiyonEkleMetin:
    'Önce ürünü kaydetmen gerekir. Sonra ürünü bir koleksiyona koyarsın; yeni koleksiyonu da buradan yaratabilirsin.',

  geriBaslik: 'Sitede geri git',
  geriMetin: "Butiğin sitesinde bir önceki sayfaya döner. Butika'dan çıkmazsın.",

  paylasBaslik: 'Paylaş',
  paylasMetin: 'Bu ürünün bağlantısını arkadaşına gönderirsin — WhatsApp, Instagram, mesaj.',

  kayitliBaslik: 'Kaydettiklerin',
  kayitliMetin: 'Kalbe bastığın ürünler ve butikler burada, Senin Butika’n’da toplanır.',

  yeniKoleksiyonBaslik: 'Yeni koleksiyon',
  yeniKoleksiyonMetin:
    'Profil\'deki ürünleri gruplara ayırabilirsin — "Kışlık", "Düğün" gibi. Yeni grup açmak için buraya bas.',

  butikcanBaslik: 'Ne aradığını yaz',
  butikcanMetin:
    'Normal cümlelerle yaz — "düğüne uygun uzun elbise" gibi. Butikcan sana uygun butikleri bulur.',
} as const;

export const turEn = {
  ileri: 'Next',
  atla: 'Skip',

  vitrinTanitimBaslik: 'Discover',
  vitrinTanitimMetin: 'Every brand on Butika is here, sorted into categories.',

  kategorilerBaslik: 'Categories',
  kategorilerMetin:
    'Every category is in the strip at the top. Swipe, tap one and its boutiques appear below.',

  siralaBaslik: 'Sort by price',
  siralaMetin: 'You can sort boutiques by ascending or descending price.',

  butikOnerBaslik: "Can't find a boutique?",
  butikOnerMetin: "Tell us about a brand that isn't on Butika yet. We'll review it and add it.",

  kalpBaslik: 'We’ll track the price',
  kalpMetin:
    'Tap here when you see something you like. We’ll tell you if the price drops or it’s back in stock.',

  yorumBaslik: 'Comments',
  yorumMetin: 'Read what other people wrote about this product. You can write too.',

  koleksiyonEkleBaslik: 'Add to a collection',
  koleksiyonEkleMetin:
    'Tap the heart first. Then you can put the product into a collection — and create a new one right here.',

  geriBaslik: 'Go back on the site',
  geriMetin: "Takes you to the previous page on the boutique's site. You don't leave Butika.",

  paylasBaslik: 'Share',
  paylasMetin: "Send this product's link to a friend — WhatsApp, Instagram, message.",

  kayitliBaslik: 'Everything you saved',
  kayitliMetin: 'Every product you hearted at a boutique collects here.',

  yeniKoleksiyonBaslik: 'New collection',
  yeniKoleksiyonMetin:
    'You can group your saved products — like "Winter" or "Wedding". Tap here to start a new group.',

  butikcanBaslik: 'Say what you want',
  butikcanMetin:
    'Write it in plain words — like "a long dress for a wedding". Butikcan finds the right boutiques.',
} as const;
