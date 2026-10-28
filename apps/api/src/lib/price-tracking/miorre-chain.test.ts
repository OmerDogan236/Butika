import { afterEach, expect, test } from 'bun:test';
import { MIORRE_URL, miorrePage } from './miorre.fixture';
import { extractProductHtml, extractProductPrice, type ProductPriceExtraction } from './extract-product-price';
import { resolveProductPrice } from './price-source-router';

// Where the Miorre theme markup sits in the reader chain, and what the resolver makes
// of it. These run on the trimmed fixture; the raw 179 KB saved page is replayed
// separately (tanilama/miorre-ham-replay.ts) and is not a test.
const found: ProductPriceExtraction = { status: 'success', priceMinor: 15300, currency: 'TRY', availability: 'unknown', source: 'miorre-html' };

test('the theme markup is read only where no other reader found a price', () => {
  expect(extractProductHtml(miorrePage(), MIORRE_URL)).toEqual(found);

  // An older reader's price keeps its place: the page's own meta price wins and the
  // theme markup is not consulted at all.
  const withMeta = miorrePage().replace('<head>',
    '<head><meta property="product:price:amount" content="149.90"><meta property="product:price:currency" content="TRY">');
  expect(extractProductHtml(withMeta, MIORRE_URL)).toMatchObject({ priceMinor: 14990, source: 'meta' });

  // A schema offer this page cannot use is still a refusal, not a fallback: two
  // groups both claiming this page leave the helper unable to say which is the
  // product, and that rejection is not stepped over.
  const group = (sku: string) => ({ '@context': 'https://schema.org', '@type': 'ProductGroup', url: MIORRE_URL,
    hasVariant: [{ '@type': 'Product', sku, offers: { '@type': 'Offer', price: '153.00', priceCurrency: 'TRY',
      availability: 'https://schema.org/InStock', url: MIORRE_URL } }] });
  const rejected = miorrePage().replace('</body>',
    `<script type="application/ld+json">${JSON.stringify(group('A'))}</script>` +
    `<script type="application/ld+json">${JSON.stringify(group('B'))}</script></body>`);
  expect(extractProductHtml(rejected, MIORRE_URL))
    .toMatchObject({ status: 'not_found', error: 'Schema offer cannot be used: ambiguous_product' });

  // A chosen variant is refused before any of this, never answered with the page price.
  for (const query of ['_butika_variant=ticimax:1:2', '_butika_variant=offer:48150', 'integration_size=125'])
    expect(extractProductHtml(miorrePage(), `${MIORRE_URL}?${query}`)).toMatchObject({ status: 'not_found' });
});

test.each([
  ['the box names another product', { code: '48151' }],
  ['the mobile bar states another amount', { mobileSale: '149,90 TL' }],
  ['the variant field carries a size', { variantField: 'OTHER-SIZE' }],
  ['a size link stands in the product box', { inMainBox: '<a href="?size=M">M</a>' }],
  ['the current amount is only inside a template', { saleInner: '<template>153,00 TL</template>' }],
] as const)('a contradiction the helper refuses is not answered by the chain either: %s', (_name, options) => {
  expect(extractProductHtml(miorrePage(options), MIORRE_URL))
    .toEqual({ status: 'not_found', error: 'No supported product price found' });
});

test('the page decides no stock, and the chain does not add one', () => {
  // The quantity box allows 253 and the page carries a stock modal; both stay out.
  expect(extractProductHtml(miorrePage(), MIORRE_URL)).toHaveProperty('availability', 'unknown');
  expect(miorrePage()).toContain('max="253"');
});

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('the resolver reports the price with no stock, from saved responses only', async () => {
  // A resolver fixture test, not a live result and not a raw-page replay: the
  // response below is the trimmed fixture, not the 179 KB page the store served.
  // Any other address fails the test instead of reaching the network.
  const requested: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const href = String(input instanceof Request ? input.url : input);
    requested.push(href);
    if (href === MIORRE_URL) return new Response(miorrePage(), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    throw new Error(`Unexpected network request: ${href}`);
  }) as typeof fetch;

  const resolved = await resolveProductPrice({ url: MIORRE_URL });
  expect(resolved).toMatchObject({ status: 'success',
    observation: { priceMinor: 15300, currency: 'TRY', availability: 'unknown', provider: 'structured_html', method: 'miorre-html' } });
  expect(requested).toEqual([MIORRE_URL]);
});

test('the price-only source asks no stock endpoint, even on a page that looks like another platform', async () => {
  // The guard that keeps miorre-html out of the stock enrichment is what this pins.
  // The observed page carries none of the three triggers — no rawProduct identity,
  // no Farktor context, no woocommerce body class — so the guard is a rule rather
  // than a fix for a request that was being made. The body class below is therefore
  // the fixture's own, not the store's: without the guard it would send the reader
  // to the WooCommerce store endpoint, and that request fails the test.
  const requested: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const href = String(input instanceof Request ? input.url : input);
    requested.push(href);
    if (href === MIORRE_URL) {
      return new Response(miorrePage({ bodyClass: 'page-productDetails woocommerce' }),
        { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    throw new Error(`Unexpected stock request: ${href}`);
  }) as typeof fetch;

  expect(await extractProductPrice(MIORRE_URL)).toEqual(found);
  expect(requested).toEqual([MIORRE_URL]);
});
