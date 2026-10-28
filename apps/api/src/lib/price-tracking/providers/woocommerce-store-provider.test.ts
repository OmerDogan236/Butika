import {
  afterEach,
  describe,
  expect,
  test,
} from 'bun:test';

import {
  woocommerceStorePriceProvider,
} from './woocommerce-store-provider';
import {
  GEBE_LALIN_ROOT_ENDPOINT,
  GEBE_LALIN_ROOT_ANSWER,
  GEBE_LALIN_TR_ANSWER,
  GEBE_LALIN_TR_ENDPOINT,
  GEBE_LALIN_URL,
} from '../gebematernity-tr.fixture';
import {
  BEBEBUTIGIIM_URL,
  BEBEBUTIGIIM_WP_JSON_ANSWER,
  BEBEBUTIGIIM_WP_JSON_CONTENT_TYPE,
} from '../bebebutigiim.fixture';


const originalFetch =
  globalThis.fetch;


afterEach(
  () => {
    globalThis.fetch =
      originalFetch;
  },
);


function mockProduct(
  input: {
    price: string;
    currency: string;
    minorUnit: number;
    regularPrice?: string;
    salePrice?: string;
  },
): void {
  globalThis.fetch =
    (async () =>
      new Response(
        JSON.stringify([
          {
            id:
              1,

            name:
              'Test Product',

            slug:
              'test-product',

            permalink:
              'https://store.test/product/test-product/',

            is_purchasable:
              true,

            prices: {
              price:
                input.price,

              regular_price:
                input.regularPrice ??
                input.price,

              sale_price:
                input.salePrice ??
                input.price,

              currency_code:
                input.currency,

              currency_minor_unit:
                input.minorUnit,
            },
          },
        ]),
        {
          status:
            200,

          headers: {
            'content-type':
              'application/json',
          },
        },
      )) as unknown as typeof fetch;
}


describe(
  'woocommerceStorePriceProvider',
  () => {

    test(
      'keeps normal two-decimal Woo price unchanged',
      async () => {
        mockProduct({
          price:
            '6985000',

          currency:
            'TRY',

          minorUnit:
            2,
        });

        const result =
          await woocommerceStorePriceProvider.getPrice({
            url:
              'https://store.test/product/test-product/',
          });

        expect(
          result.status,
        ).toBe(
          'success',
        );

        if (
          result.status !==
          'success'
        ) {
          throw new Error(
            result.error,
          );
        }

        expect(
          result.observation.priceMinor,
        ).toBe(
          6_985_000,
        );

        expect(
          result.observation.method,
        ).toBe(
          'store-api',
        );
      },
    );


    test(
      'normalizes zero-decimal Woo store price into Butika minor units',
      async () => {
        mockProduct({
          price:
            '2400',

          currency:
            'TRY',

          minorUnit:
            0,
        });

        const result =
          await woocommerceStorePriceProvider.getPrice({
            url:
              'https://store.test/product/test-product/',
          });

        expect(
          result.status,
        ).toBe(
          'success',
        );

        if (
          result.status !==
          'success'
        ) {
          throw new Error(
            result.error,
          );
        }

        expect(
          result.observation.priceMinor,
        ).toBe(
          240_000,
        );

        expect(
          result.observation.currency,
        ).toBe(
          'TRY',
        );

        expect(
          result.observation.method,
        ).toBe(
          'store-api-normalized',
        );
      },
    );


    test(
      'normalizes higher precision only when conversion is lossless',
      async () => {
        mockProduct({
          price:
            '2400000',

          currency:
            'TRY',

          minorUnit:
            3,
        });

        const result =
          await woocommerceStorePriceProvider.getPrice({
            url:
              'https://store.test/product/test-product/',
          });

        expect(
          result.status,
        ).toBe(
          'success',
        );

        if (
          result.status !==
          'success'
        ) {
          throw new Error(
            result.error,
          );
        }

        expect(
          result.observation.priceMinor,
        ).toBe(
          240_000,
        );
      },
    );


    test(
      'rejects higher precision when conversion would lose value',
      async () => {
        mockProduct({
          price:
            '2400001',

          currency:
            'TRY',

          minorUnit:
            3,
        });

        const result =
          await woocommerceStorePriceProvider.getPrice({
            url:
              'https://store.test/product/test-product/',
          });

        expect(
          result.status,
        ).toBe(
          'failure',
        );

        if (
          result.status ===
          'failure'
        ) {
          expect(
            result.reason,
          ).toBe(
            'unsupported',
          );
        }
      },
    );


    test(
      'does not treat regular price as current price when Woo current price is zero',
      async () => {
        mockProduct({
          price:
            '0',

          regularPrice:
            '798800',

          salePrice:
            '0',

          currency:
            'TRY',

          minorUnit:
            2,
        });

        const result =
          await woocommerceStorePriceProvider.getPrice({
            url:
              'https://store.test/product/test-product/',
          });

        expect(
          result.status,
        ).toBe(
          'failure',
        );

        if (
          result.status ===
          'failure'
        ) {
          expect(
            result.reason,
          ).toBe(
            'not_found',
          );
        }
      },
    );


    test(
      'rejects currencies outside Butika two-decimal model',
      async () => {
        mockProduct({
          price:
            '2400',

          currency:
            'JPY',

          minorUnit:
            0,
        });

        const result =
          await woocommerceStorePriceProvider.getPrice({
            url:
              'https://store.test/product/test-product/',
          });

        expect(
          result.status,
        ).toBe(
          'failure',
        );

        if (
          result.status ===
          'failure'
        ) {
          expect(
            result.reason,
          ).toBe(
            'unsupported',
          );
        }
      },
    );
  },
);


// gebematernity.com/tr/…: a store that keeps each language in its own directory lists
// a product only under that language's Store API. Answers are the ones fetched.
function mockStore(answers: Record<string, string>): string[] {
  const requested: string[] = [];
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    requested.push(url);
    return url in answers
      ? new Response(answers[url], { status: 200, headers: { 'content-type': 'application/json; charset=UTF-8' } })
      : new Response('<!DOCTYPE html><html><body>404</body></html>', { status: 404, headers: { 'content-type': 'text/html' } });
  }) as unknown as typeof fetch;
  return requested;
}

describe('WooCommerce store in a language directory', () => {
  test('gebematernity /tr/ product is read from the /tr/ Store API', async () => {
    const requested = mockStore({ [GEBE_LALIN_ROOT_ENDPOINT]: GEBE_LALIN_ROOT_ANSWER, [GEBE_LALIN_TR_ENDPOINT]: GEBE_LALIN_TR_ANSWER });
    const result = await woocommerceStorePriceProvider.getPrice({ url: GEBE_LALIN_URL });
    expect(result).toMatchObject({ status: 'success', observation: { priceMinor: 77935, currency: 'TRY', availability: 'unknown', provider: 'woocommerce', method: 'store-api' } });
    expect(requested).toEqual([GEBE_LALIN_TR_ENDPOINT]);
  });

  test('the language endpoint answers only for the requested address', async () => {
    // Same slug, but the product the language endpoint returns lives at another address.
    const elsewhere = GEBE_LALIN_TR_ANSWER.replace('gebematernity.com/tr/product/hamile-elbisesi-lalin/', 'gebematernity.com/product/hamile-elbisesi-lalin/');
    expect(elsewhere).not.toBe(GEBE_LALIN_TR_ANSWER);
    mockStore({ [GEBE_LALIN_ROOT_ENDPOINT]: GEBE_LALIN_ROOT_ANSWER, [GEBE_LALIN_TR_ENDPOINT]: elsewhere });
    expect(await woocommerceStorePriceProvider.getPrice({ url: GEBE_LALIN_URL }))
      .toEqual({ status: 'failure', reason: 'not_found', error: 'WooCommerce product not found' });
  });

  test('an address without a language directory asks only the root endpoints, as before', async () => {
    const requested = mockStore({});
    await woocommerceStorePriceProvider.getPrice({ url: 'https://store.test/product/test-product/' });
    expect(requested).toEqual([
      'https://store.test/wp-json/wc/store/v1/products?slug=test-product',
      'https://store.test/wp-json/wc/store/products?slug=test-product',
    ]);
    // A two-letter first segment that is the whole path is a slug, not a language.
    const short = mockStore({});
    await woocommerceStorePriceProvider.getPrice({ url: 'https://store.test/tr' });
    expect(short).toEqual([
      'https://store.test/wp-json/wc/store/v1/products?slug=tr',
      'https://store.test/wp-json/wc/store/products?slug=tr',
    ]);
  });
});

// www.bebebutigiim.com (IdeaSoft): /wp-json/... answers 200 with the store's own HTML
// page. That is not a broken WooCommerce answer; the site has no Store API.
describe('a site that answers the Store API address with a web page', () => {
  test('bebebutigiim: an HTML answer means no Store API, not an HTTP error', async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests += 1;
      return new Response(BEBEBUTIGIIM_WP_JSON_ANSWER, { status: 200, headers: { 'content-type': BEBEBUTIGIIM_WP_JSON_CONTENT_TYPE } });
    }) as unknown as typeof fetch;
    expect(await woocommerceStorePriceProvider.getPrice({ url: BEBEBUTIGIIM_URL }))
      .toEqual({ status: 'failure', reason: 'unsupported', error: 'Site has no WooCommerce Store API (answered with a non-JSON page)' });
    expect(requests).toBe(2);
  });

  test('a product found on the second endpoint is still read after an HTML answer on the first', async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests += 1;
      return requests === 1
        ? new Response(BEBEBUTIGIIM_WP_JSON_ANSWER, { status: 200, headers: { 'content-type': BEBEBUTIGIIM_WP_JSON_CONTENT_TYPE } })
        : new Response(JSON.stringify([{ slug: 'test-product', is_purchasable: true, prices: { price: '2400', currency_code: 'TRY', currency_minor_unit: 2 } }]), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    expect(await woocommerceStorePriceProvider.getPrice({ url: 'https://store.test/product/test-product/' }))
      .toMatchObject({ status: 'success', observation: { priceMinor: 2400, currency: 'TRY' } });
  });
});
