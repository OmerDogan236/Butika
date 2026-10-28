export const colors = {
  cream: '#F8F5F0',
  ink: '#0A0A0A',
  mist: '#E5E2DD',
  gold: '#9B7E5C',
  sage: '#7A8B6F',
  clay: '#B23A48',
  // Butika bordosu: dikkat isteyen her şey (uyarılar, fiyat düşüşü, okunmamış).
  // 26 Eki: uygulamada tek ton — "Sizin için seçtiklerimiz"deki bordo (#7A2E40); eski koyu
  // ton #561C2A idi.
  bordo: '#7A2E40',
  // Seçili durumlar (kategori, sekme, bölüm). Kadında bordoyla aynı ton; erkekte ayrışır
  // (bordo → siyah, bordoAcik → koyu mavi).
  bordoAcik: '#7A2E40',
  // Bordoya çalan çok açık sıcak zemin (arama kutusu gibi yüzeyler); kremden ayrışır.
  bordoZemin: '#F3E9E6',
  // Bordo zemin üstündeki yazı.
  blush: '#EBCFC6',

  inkSoft: '#1A1A1A',
  inkMute: '#5C5C5C',
  inkFaint: '#9A9A9A',

  goldSoft: '#B89B7A',
  creamSoft: '#FBF9F5',
} as const;

export type ColorToken = keyof typeof colors;

// Girişteki KADIN / ERKEK kartları: her biri kendi tarafının zemin ve yazı rengi (açılışta
// `colors` erkeğe göre değişse de sabit kalsın diye ayrı).
export const tarafKartRenkleri = {
  kadin: { zemin: '#F3E9E6', yazi: '#7A2E40' },
  erkek: { zemin: '#E7EAEF', yazi: '#0A0A0A' },
} as const;

// Erkek vitrini (uygulamada KADIN | ERKEK): bordonun yerine siyah, açık bordonun yerine
// soluk koyu mavi, pembe zeminin yerine açık mavi-gri, altının yerine gri. Uygulama açılışta bunları
// `colors` üzerine yazar (apps/mobile/index.js).
export const erkekRenkleri: Partial<Record<ColorToken, string>> = {
  bordo: '#0A0A0A',
  bordoAcik: '#3B4A5F',
  bordoZemin: '#E7EAEF',
  blush: '#E7EAEF',
  // Altın yazı/çizgi/düğme erkekte gri.
  gold: '#6B6F76',
  goldSoft: '#A3A7AE',
};
