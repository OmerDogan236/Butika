// Kapak görseli logo/banner mı (sığdır → contain) yoksa ürün fotoğrafı mı (kırp → cover)?
// Geniş (banner/logo) ya da küçük (ikon/logo) → logo say; portre/büyük kare → foto.
export function isLogoLike(width: number, height: number): boolean {
  if (!width || !height) return false;
  return width / height >= 1.25 || Math.max(width, height) < 400;
}
