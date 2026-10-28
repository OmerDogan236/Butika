const IKI_PARCALI_SONEKLER = new Set([
  'com.tr',
  'net.tr',
  'org.tr',
  'gen.tr',
  'co.uk',
  'com.au',
  'co.nz',
  'com.br',
  'web.tr',
  'k12.tr',
  'bel.tr',
  'co.za',
  'com.cy',
  'com.mx',
  'co.jp',
]);

/** Adresin kök alan adı: www atılır, küçük harf, alt alan adları (tr., shop.) sayılmaz. */
export function kokAlanAdi(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  if (host.endsWith('.myshopify.com')) return host;
  const parcalar = host.split('.').filter(Boolean);
  if (parcalar.length < 2) return null;
  const sonIki = parcalar.slice(-2).join('.');
  if (IKI_PARCALI_SONEKLER.has(sonIki) && parcalar.length >= 3) {
    return parcalar.slice(-3).join('.');
  }
  return sonIki;
}
