// textTransform:'uppercase' dil bilmiyor ("KATEGORILER"). Türkçe metin bununla büyütülür.
export function buyukHarf(metin: string, dil: string): string {
  return metin.toLocaleUpperCase(dil.toLowerCase().startsWith('tr') ? 'tr-TR' : dil);
}
