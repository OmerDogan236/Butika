const GENERIC_TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  '_ga',
  '_gl',
]);

export type CanonicalProductUrl = {
  sourceUrl: string;
  canonicalUrl: string;
  domain: string;
  sourceProductId: string | null;
};

export function canonicalizeProductUrl(input: string): CanonicalProductUrl {
  const sourceUrl = input.trim();

  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error(`Invalid product URL: ${input}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported product URL protocol: ${url.protocol}`);
  }

  // Ürün sayfaları için standart protokol.
  url.protocol = 'https:';

  // Hostname URL API tarafından zaten lowercase normalize edilir.
  url.hostname = url.hostname.toLowerCase();

  // Fragment ürün kimliğinin parçası değildir.
  url.hash = '';

  removeGenericTrackingParams(url);

  const sourceProductId = applyDomainRules(url);

  // Query parametre sırası aynı URL'nin farklı görünmesine yol açmasın.
  url.searchParams.sort();

  return {
    sourceUrl,
    canonicalUrl: url.toString(),
    domain: normalizeDomain(url.hostname),
    sourceProductId,
  };
}

function removeGenericTrackingParams(url: URL): void {
  for (const key of [...url.searchParams.keys()]) {
    const normalizedKey = key.toLowerCase();

    if (
      normalizedKey.startsWith('utm_') ||
      GENERIC_TRACKING_PARAMS.has(normalizedKey)
    ) {
      url.searchParams.delete(key);
    }
  }
}

function applyDomainRules(url: URL): string | null {
  const domain = normalizeDomain(url.hostname);

  if (domain === 'zara.com') {
    return applyZaraRules(url);
  }

  return null;
}

function applyZaraRules(url: URL): string | null {
  // Zara'nın v1/v2 parametreleri kalıcı ürün kimliğinin parçası değildir.
  url.searchParams.delete('v1');
  url.searchParams.delete('v2');

  // Örnek:
  // ...-p03411001.html
  const match = url.pathname.match(/-p(\d+)\.html$/i);

  return match?.[1] ?? null;
}

function normalizeDomain(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase();
}