import { afterEach, expect, test } from 'bun:test';
import { akinonSayfa, pancoKayit, pancoUrl } from './akinon-next.fixture';
import { extractProductHtml, extractProductPrice } from './extract-product-price';
import { resolveProductPrice } from './price-source-router';

// Where the Akinon streaming record sits in the reader chain, and what the resolver
// makes of it. These run on the trimmed fixture; the two raw 380 KB pages are
// replayed separately (tanilama/replay-akinon-ham-html.ts) and are not tests.
const kayit = (degisiklik: Record<string, unknown>) => ({ ...pancoKayit, ...degisiklik });

test('the streaming record is read only where no other reader found a price', () => {
  expect(extractProductHtml(akinonSayfa(), pancoUrl))
    .toEqual({ status: 'success', priceMinor: 79500, currency: 'TRY', availability: 'unknown', source: 'akinon-next' });

  // An older reader's price keeps its place: the page's own meta price wins and
  // the streaming record is not consulted at all.
  const metaLi = akinonSayfa().replace('<head>',
    '<head><meta property="product:price:amount" content="695.00"><meta property="product:price:currency" content="TRY">');
  expect(extractProductHtml(metaLi, pancoUrl)).toMatchObject({ priceMinor: 69500, source: 'meta' });

  // A schema offer this page cannot use is still a refusal, not a fallback: two
  // groups both claiming this page leave the helper unable to say which is the
  // product, and that rejection is not stepped over.
  const grup = (sku: string) => ({ '@context': 'https://schema.org', '@type': 'ProductGroup', url: pancoUrl,
    hasVariant: [{ '@type': 'Product', sku, offers: { '@type': 'Offer', price: '695.00', priceCurrency: 'TRY',
      availability: 'https://schema.org/InStock', url: pancoUrl } }] });
  const reddedilen = akinonSayfa().replace('</body>',
    `<script type="application/ld+json">${JSON.stringify(grup('A'))}</script>` +
    `<script type="application/ld+json">${JSON.stringify(grup('B'))}</script></body>`);
  expect(extractProductHtml(reddedilen, pancoUrl))
    .toMatchObject({ status: 'not_found', error: 'Schema offer cannot be used: ambiguous_product' });

  // A chosen size is refused before any of this, never answered with the product price.
  const secili = `${pancoUrl}?_butika_variant=ticimax:1:2`;
  expect(extractProductHtml(akinonSayfa({ url: secili }), secili)).toMatchObject({ status: 'not_found' });
});

test('the conditional offer, the shipping threshold and another store stay out', () => {
  // 612,15 is the basket offer's total and 750 is the free-shipping limit.
  expect(extractProductHtml(akinonSayfa({ kayitlar: [kayit({ price: '612.15', retail_price: '795' })],
    gorunur: ['612,15 TL'] }), pancoUrl)).toMatchObject({ status: 'not_found' });
  expect(extractProductHtml(akinonSayfa({ gorunur: ['795,00 TL', '750 TL'] }), pancoUrl))
    .toMatchObject({ status: 'not_found' });
  const disKapsam = 'https://www.baska-akinon.example/urun-1/';
  expect(extractProductHtml(akinonSayfa({ url: disKapsam, canonical: disKapsam }), disKapsam))
    .toMatchObject({ status: 'not_found' });
});

test('the record claiming stock never becomes stock', () => {
  // in_stock true, stock 1 and even is_ready_to_basket true stay unknown here, so
  // recordPriceObservation gets no verified stock to start a baseline from; the
  // rule itself is pinned by schema-stock-baseline.integration.test.ts.
  for (const flags of [{ in_stock: true, stock: 5, is_ready_to_basket: true }, { in_stock: true, stock: 1 }])
    expect(extractProductHtml(akinonSayfa({ kayitlar: [kayit(flags)] }), pancoUrl))
      .toMatchObject({ availability: 'unknown', source: 'akinon-next' });
});

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('the resolver reports the price with no stock, from saved responses only', async () => {
  // A resolver fixture test, not a live result and not a raw-page replay: the
  // response below is the trimmed fixture, not the 380 KB page the store served.
  // Any other address fails the test instead of reaching the network.
  const istenen: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const href = String(input instanceof Request ? input.url : input);
    istenen.push(href);
    if (href === pancoUrl) return new Response(akinonSayfa(), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    throw new Error(`Unexpected network request: ${href}`);
  }) as typeof fetch;

  const resolved = await resolveProductPrice({ url: pancoUrl });
  expect(resolved).toMatchObject({ status: 'success',
    observation: { priceMinor: 79500, currency: 'TRY', availability: 'unknown', provider: 'structured_html', method: 'akinon-next' } });
  expect(istenen).toEqual([pancoUrl]);
});

test('the price-only source asks no stock endpoint, even when an old identity is there', async () => {
  // The guard that keeps akinon-next out of the stock enrichment is what this pins.
  // The page also carries the older theme's rawProduct identity, so without the
  // guard akinonAvailability would reach for /product/<pk>/ — and that request
  // fails the test instead of being made.
  const istenen: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const href = String(input instanceof Request ? input.url : input);
    istenen.push(href);
    if (href === pancoUrl) {
      return new Response(akinonSayfa({ eskiRawProduct: true }), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    throw new Error(`Unexpected stock request: ${href}`);
  }) as typeof fetch;

  expect(await extractProductPrice(pancoUrl)).toEqual({ status: 'success', priceMinor: 79500,
    currency: 'TRY', availability: 'unknown', source: 'akinon-next' });
  expect(istenen).toEqual([pancoUrl]);
});
