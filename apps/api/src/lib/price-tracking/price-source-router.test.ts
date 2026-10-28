import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';

import {
  resolveProductPrice,
} from './price-source-router';

import {
  structuredHtmlPriceProvider,
} from './providers/structured-html-provider';

import {
  shopifyPublicPriceProvider,
} from './providers/shopify-public-provider';

import {
  woocommerceStorePriceProvider,
} from './providers/woocommerce-store-provider';

import type {
  PriceProviderFailureReason,
  PriceProviderName,
  PriceProviderResult,
} from './price-provider';


const FIXED_DATE =
  new Date(
    '2026-09-09T00:00:00.000Z',
  );

test.each(['not_found', 'price_conflict'] as const)('Shopify %s identity rejection cannot be bypassed by structured or Woo prices', async (reason) => {
  mockRouterProviders({
    structured: success('structured_html', 9000, 'TRY', 'meta'),
    shopify: { status: 'failure', reason, error: 'Exact variant required', stopFallback: true },
    woo: success('woocommerce', 8000, 'TRY', 'store-api'),
  });
  const result = await resolveProductPrice({ url: 'https://store.test/products/dress' });
  expect(result.status).toBe('failed');
  expect(result.attempts.map((a) => a.provider)).toEqual(['structured_html', 'shopify']);
});


const originals = {
  structuredCanHandle:
    structuredHtmlPriceProvider.canHandle,

  structuredGetPrice:
    structuredHtmlPriceProvider.getPrice,

  shopifyCanHandle:
    shopifyPublicPriceProvider.canHandle,

  shopifyGetPrice:
    shopifyPublicPriceProvider.getPrice,

  wooCanHandle:
    woocommerceStorePriceProvider.canHandle,

  wooGetPrice:
    woocommerceStorePriceProvider.getPrice,

  fetch:
    globalThis.fetch,
};


function restoreMocks():
  void {
  structuredHtmlPriceProvider.canHandle =
    originals.structuredCanHandle;

  structuredHtmlPriceProvider.getPrice =
    originals.structuredGetPrice;

  shopifyPublicPriceProvider.canHandle =
    originals.shopifyCanHandle;

  shopifyPublicPriceProvider.getPrice =
    originals.shopifyGetPrice;

  woocommerceStorePriceProvider.canHandle =
    originals.wooCanHandle;

  woocommerceStorePriceProvider.getPrice =
    originals.wooGetPrice;

  globalThis.fetch =
    originals.fetch;
}


beforeEach(
  restoreMocks,
);

afterEach(
  restoreMocks,
);


function success(
  provider: PriceProviderName,
  priceMinor: number,
  currency: string,
  method: string,
): PriceProviderResult {
  return {
    status:
      'success',

    observation: {
      priceMinor,
      currency,

      observedAt:
        FIXED_DATE,

      provider,
      method,
    },
  };
}


function failure(
  reason:
    PriceProviderFailureReason,

  error: string =
    reason,
): PriceProviderResult {
  return {
    status:
      'failure',

    reason,
    error,
  };
}


function mockRouterProviders(
  input: {
    structured:
      PriceProviderResult;

    shopify:
      PriceProviderResult;

    woo?:
      PriceProviderResult;

    isShopify?:
      boolean;
  },
): void {
  structuredHtmlPriceProvider.canHandle =
    () =>
      true;

  structuredHtmlPriceProvider.getPrice =
    async () =>
      input.structured;

  shopifyPublicPriceProvider.canHandle =
    () =>
      input.isShopify ??
      true;

  shopifyPublicPriceProvider.getPrice =
    async () =>
      input.shopify;

  woocommerceStorePriceProvider.canHandle =
    () =>
      true;

  woocommerceStorePriceProvider.getPrice =
    async () =>
      input.woo ??
      failure(
        'not_found',
        'Woo not found',
      );
}


function expectSuccess(
  result:
    Awaited<
      ReturnType<
        typeof resolveProductPrice
      >
    >,
) {
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
      `Expected success, got ${result.reason}`,
    );
  }

  return result;
}


describe(
  'resolveProductPrice Shopify arbitration',
  () => {

    test(
      'keeps structured result when both sources exactly match',
      async () => {
        mockRouterProviders({
          structured:
            success(
              'structured_html',
              100_000,
              'TRY',
              'meta',
            ),

          shopify:
            success(
              'shopify',
              100_000,
              'TRY',
              'product-js+cart-js',
            ),
        });

        const result =
          expectSuccess(
            await resolveProductPrice({
              url:
                'https://store.test/products/example',

              expectedCurrency:
                'TRY',
            }),
          );

        expect(
          result.observation.provider,
        ).toBe(
          'structured_html',
        );

        expect(
          result.observation.priceMinor,
        ).toBe(
          100_000,
        );

        expect(
          result.observation.method,
        ).toBe(
          'meta',
        );

        expect(
          result.attempts.length,
        ).toBe(
          2,
        );
      },
    );


    test(
      'uses structured when Shopify fails',
      async () => {
        mockRouterProviders({
          structured:
            success(
              'structured_html',
              475_900,
              'TRY',
              'json-ld',
            ),

          shopify:
            failure(
              'not_found',
              'Shopify 404',
            ),
        });

        const result =
          expectSuccess(
            await resolveProductPrice({
              url:
                'https://store.test/products/example',

              expectedCurrency:
                'TRY',
            }),
          );

        expect(
          result.observation.provider,
        ).toBe(
          'structured_html',
        );

        expect(
          result.observation.priceMinor,
        ).toBe(
          475_900,
        );
      },
    );


    test(
      'uses Shopify when structured fails',
      async () => {
        mockRouterProviders({
          structured:
            failure(
              'blocked',
              'challenge',
            ),

          shopify:
            success(
              'shopify',
              110_000,
              'TRY',
              'product-js+cart-js',
            ),
        });

        const result =
          expectSuccess(
            await resolveProductPrice({
              url:
                'https://store.test/products/example',

              expectedCurrency:
                'TRY',
            }),
          );

        expect(
          result.observation.provider,
        ).toBe(
          'shopify',
        );

        expect(
          result.observation.priceMinor,
        ).toBe(
          110_000,
        );
      },
    );


    test(
      'expectedCurrency selects structured when currencies differ',
      async () => {
        mockRouterProviders({
          structured:
            success(
              'structured_html',
              246_000,
              'TRY',
              'json-ld',
            ),

          shopify:
            success(
              'shopify',
              4_999,
              'USD',
              'product-js+cart-js',
            ),
        });

        const result =
          expectSuccess(
            await resolveProductPrice({
              url:
                'https://store.test/products/example',

              expectedCurrency:
                'try',
            }),
          );

        expect(
          result.observation.provider,
        ).toBe(
          'structured_html',
        );

        expect(
          result.observation.currency,
        ).toBe(
          'TRY',
        );

        expect(
          result.observation.method,
        ).toBe(
          'json-ld+currency-arbitrated',
        );
      },
    );


    test(
      'expectedCurrency selects Shopify when currencies differ',
      async () => {
        mockRouterProviders({
          structured:
            success(
              'structured_html',
              5_000,
              'USD',
              'meta',
            ),

          shopify:
            success(
              'shopify',
              246_000,
              'TRY',
              'product-js+cart-js',
            ),
        });

        const result =
          expectSuccess(
            await resolveProductPrice({
              url:
                'https://store.test/products/example',

              expectedCurrency:
                'TRY',
            }),
          );

        expect(
          result.observation.provider,
        ).toBe(
          'shopify',
        );

        expect(
          result.observation.priceMinor,
        ).toBe(
          246_000,
        );

        expect(
          result.observation.method,
        ).toBe(
          'product-js+cart-js+currency-arbitrated',
        );
      },
    );


    test(
      'returns price_conflict when currencies differ and no currency can arbitrate',
      async () => {
        mockRouterProviders({
          structured:
            success(
              'structured_html',
              246_000,
              'TRY',
              'json-ld',
            ),

          shopify:
            success(
              'shopify',
              4_999,
              'USD',
              'product-js+cart-js',
            ),
        });

        const result =
          await resolveProductPrice({
            url:
              'https://store.test/products/example',
          });

        expect(
          result.status,
        ).toBe(
          'failed',
        );

        if (
          result.status !==
          'failed'
        ) {
          throw new Error(
            'Expected failure',
          );
        }

        expect(
          result.reason,
        ).toBe(
          'price_conflict',
        );
      },
    );


    test(
      'corrects exact 10x structured scale error with Shopify',
      async () => {
        mockRouterProviders({
          structured:
            success(
              'structured_html',
              12_590_000,
              'TRY',
              'json-ld',
            ),

          shopify:
            success(
              'shopify',
              1_259_000,
              'TRY',
              'product-js+cart-js',
            ),
        });

        const result =
          expectSuccess(
            await resolveProductPrice({
              url:
                'https://store.test/products/example',

              expectedCurrency:
                'TRY',
            }),
          );

        expect(
          result.observation.provider,
        ).toBe(
          'shopify',
        );

        expect(
          result.observation.priceMinor,
        ).toBe(
          1_259_000,
        );

        expect(
          result.observation.method,
        ).toBe(
          'product-js+cart-js+scale-arbitrated',
        );
      },
    );


    test(
      'keeps storefront structured price for tiny rounding difference',
      async () => {
        mockRouterProviders({
          structured:
            success(
              'structured_html',
              64_900,
              'TRY',
              'meta',
            ),

          shopify:
            success(
              'shopify',
              64_935,
              'TRY',
              'product-js+cart-js',
            ),
        });

        const result =
          expectSuccess(
            await resolveProductPrice({
              url:
                'https://store.test/products/example',

              expectedCurrency:
                'TRY',
            }),
          );

        expect(
          result.observation.provider,
        ).toBe(
          'structured_html',
        );

        expect(
          result.observation.priceMinor,
        ).toBe(
          64_900,
        );

        expect(
          result.observation.method,
        ).toBe(
          'meta+near-equivalent-arbitrated',
        );
      },
    );


    test(
      'uses Shopify for meaningful same-currency disagreement',
      async () => {
        mockRouterProviders({
          structured:
            success(
              'structured_html',
              39_996,
              'TRY',
              'meta',
            ),

          shopify:
            success(
              'shopify',
              49_995,
              'TRY',
              'product-js+cart-js',
            ),
        });

        const result =
          expectSuccess(
            await resolveProductPrice({
              url:
                'https://store.test/products/example',

              expectedCurrency:
                'TRY',
            }),
          );

        expect(
          result.observation.provider,
        ).toBe(
          'shopify',
        );

        expect(
          result.observation.priceMinor,
        ).toBe(
          49_995,
        );

        expect(
          result.observation.method,
        ).toBe(
          'product-js+cart-js+same-currency-arbitrated',
        );
      },
    );


    test(
      'rejects structured-only result when it conflicts with expected currency',
      async () => {
        mockRouterProviders({
          structured:
            success(
              'structured_html',
              10_000,
              'USD',
              'meta',
            ),

          shopify:
            failure(
              'not_found',
            ),
        });

        const result =
          await resolveProductPrice({
            url:
              'https://store.test/products/example',

            expectedCurrency:
              'TRY',
          });

        expect(
          result.status,
        ).toBe(
          'failed',
        );

        if (
          result.status ===
          'failed'
        ) {
          expect(
            result.reason,
          ).toBe(
            'price_conflict',
          );
        }
      },
    );


    test(
      'rejects Shopify-only result when it conflicts with expected currency',
      async () => {
        mockRouterProviders({
          structured:
            failure(
              'not_found',
            ),

          shopify:
            success(
              'shopify',
              10_000,
              'USD',
              'product-js+cart-js',
            ),
        });

        const result =
          await resolveProductPrice({
            url:
              'https://store.test/products/example',

            expectedCurrency:
              'TRY',
          });

        expect(
          result.status,
        ).toBe(
          'failed',
        );

        if (
          result.status ===
          'failed'
        ) {
          expect(
            result.reason,
          ).toBe(
            'price_conflict',
          );
        }
      },
    );


    test(
      'preserves blocked failure when Shopify, IKAS and Woo all fail',
      async () => {
        mockRouterProviders({
          structured:
            failure(
              'blocked',
              'challenge',
            ),

          shopify:
            failure(
              'not_found',
            ),

          woo:
            failure(
              'not_found',
            ),
        });

        const result =
          await resolveProductPrice({
            url:
              'https://store.test/products/example',
          });

        expect(
          result.status,
        ).toBe(
          'failed',
        );

        if (
          result.status ===
          'failed'
        ) {
          expect(
            result.reason,
          ).toBe(
            'blocked',
          );
        }

        expect(
          result.attempts.length,
        ).toBe(
          4,
        );
      },
    );


    test(
      'keeps normal structured to IKAS to Woo flow for non-Shopify URLs',
      async () => {
        mockRouterProviders({
          structured:
            failure(
              'not_found',
            ),

          shopify:
            failure(
              'not_found',
            ),

          woo:
            success(
              'woocommerce',
              6_985_000,
              'TRY',
              'store-api',
            ),

          isShopify:
            false,
        });

        const result =
          expectSuccess(
            await resolveProductPrice({
              url:
                'https://store.test/urun/example',

              expectedCurrency:
                'TRY',
            }),
          );

        expect(
          result.observation.provider,
        ).toBe(
          'woocommerce',
        );

        expect(
          result.observation.priceMinor,
        ).toBe(
          6_985_000,
        );

        expect(
          result.attempts.length,
        ).toBe(
          3,
        );
      },
    );
  },
);


function setFetchMock(
  handler:
    (
      url: string,
    ) =>
      Response |
      Promise<Response>,
): void {
  globalThis.fetch =
    (async (
      input:
        string |
        URL |
        Request,
    ) => {
      const url =
        typeof input ===
          'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      return handler(
        url,
      );
    }) as typeof fetch;
}


function jsonResponse(
  value: unknown,
  status =
    200,
): Response {
  return new Response(
    JSON.stringify(
      value,
    ),
    {
      status,

      headers: {
        'content-type':
          'application/json',
      },
    },
  );
}


describe(
  'shopifyPublicPriceProvider',
  () => {

    test(
      'handles exact Shopify product paths including locale prefix',
      async () => {
        expect(
          await shopifyPublicPriceProvider.canHandle({
            url:
              'https://store.test/products/example',
          }),
        ).toBe(
          true,
        );

        expect(
          await shopifyPublicPriceProvider.canHandle({
            url:
              'https://store.test/tr/products/example',
          }),
        ).toBe(
          true,
        );

        expect(
          await shopifyPublicPriceProvider.canHandle({
            url:
              'https://store.test/collections/example',
          }),
        ).toBe(
          false,
        );
      },
    );


    test(
      'uses exact variant price when variant query exists',
      async () => {
        setFetchMock(
          async (
            url,
          ) => {
            if (
              url ===
              'https://store.test/tr/products/example.js'
            ) {
              return jsonResponse({
                id:
                  1,

                title:
                  'Example',

                price:
                  10_000,

                variants: [
                  {
                    id:
                      111,

                    price:
                      10_000,
                  },
                  {
                    id:
                      222,

                    price:
                      12_000,
                  },
                ],
              });
            }

            if (
              url ===
              'https://store.test/tr/cart.js'
            ) {
              return jsonResponse({
                currency:
                  'TRY',
              });
            }

            return jsonResponse(
              {},
              404,
            );
          },
        );

        const result =
          await shopifyPublicPriceProvider.getPrice({
            url:
              'https://store.test/tr/products/example?variant=222',
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
          12_000,
        );

        expect(
          result.observation.currency,
        ).toBe(
          'TRY',
        );

        expect(
          result.observation.method,
        ).toBe(
          'product-js-variant+cart-js',
        );
      },
    );


    test(
      'does not silently fall back when requested variant does not exist',
      async () => {
        setFetchMock(
          async (
            url,
          ) => {
            if (
              url.endsWith(
                '/products/example.js',
              )
            ) {
              return jsonResponse({
                id:
                  1,

                title:
                  'Example',

                price:
                  10_000,

                variants: [
                  {
                    id:
                      111,

                    price:
                      10_000,
                  },
                ],
              });
            }

            if (
              url.endsWith(
                '/cart.js',
              )
            ) {
              return jsonResponse({
                currency:
                  'TRY',
              });
            }

            return jsonResponse(
              {},
              404,
            );
          },
        );

        const result =
          await shopifyPublicPriceProvider.getPrice({
            url:
              'https://store.test/products/example?variant=999',
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
      'rejects currencies whose minor unit is not two digits',
      async () => {
        setFetchMock(
          async (
            url,
          ) => {
            if (
              url.endsWith(
                '/products/example.js',
              )
            ) {
              return jsonResponse({
                id:
                  1,

                title:
                  'Example',

                price:
                  10_000,

                variants: [
                  {
                    id:
                      111,

                    price:
                      10_000,
                  },
                ],
              });
            }

            if (
              url.endsWith(
                '/cart.js',
              )
            ) {
              return jsonResponse({
                currency:
                  'JPY',
              });
            }

            return jsonResponse(
              {},
              404,
            );
          },
        );

        const result =
          await shopifyPublicPriceProvider.getPrice({
            url:
              'https://store.test/products/example',
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

          expect(
            result.error,
          ).toContain(
            'minor unit',
          );
        }
      },
    );
  },
);
