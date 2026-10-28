import { assertOutboundUrl } from './outbound-guard';

const siteHost = (value: string) =>
  new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`).hostname
    .replace(/^www\./, '')
    .replace(/\.$/, '');

/**
 * Server-side price checks only follow products on the saved boutique's own
 * site: the same host, one of its subdomains or its parent domain. Other links
 * can still be saved; they are reported as unsupported instead of fetched.
 */
export function isTrackableProductUrl(productUrl: string, boutiqueUrl: string): boolean {
  try {
    const url = new URL(productUrl);
    assertOutboundUrl(url);
    const product = siteHost(url.href);
    const boutique = siteHost(boutiqueUrl.trim());
    return product === boutique || product.endsWith(`.${boutique}`) || boutique.endsWith(`.${product}`);
  } catch {
    return false;
  }
}
