import {
  afterEach,
  describe,
  expect,
  test,
} from 'bun:test';

import {
  ikasPublicPriceProvider,
} from './ikas-public-provider';

import {
  resolveProductPrice,
} from '../price-source-router';


const originalFetch =
  globalThis.fetch;


afterEach(
  () => {
    globalThis.fetch =
      originalFetch;
  },
);


function makeHtml(
  pageSpecificData: unknown,
): string {
  const nextData = {
    page:
      '/[slug]',

    props: {
      pageProps: {
        pageSpecificData,
      },
    },
  };

  return `
    <!doctype html>
    <html>
      <head>
        <script src="https://cdn.myikas.com/sf/test/_next/static/test.js"></script>
      </head>
      <body>
        <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>
      </body>
    </html>
  `;
}


function mockHtml(
  html: string,
  status = 200,
): void {
  const mockFetch =
    async () =>
      new Response(
        html,
        {
          status,
          headers: {
            'content-type':
              'text/html; charset=utf-8',
          },
        },
      );

  globalThis.fetch =
    mockFetch as unknown as
      typeof fetch;
}


describe(
  'ikasPublicPriceProvider',
  () => {
    test(
      'extracts exact pageSpecificData product and converts major TRY into Butika minor units',
      async () => {
        mockHtml(
          makeHtml({
            name:
              'Peria Düğmeli Gömlek',

            metaData: {
              slug:
                'peria-dugmeli-gomlek',
            },

            variants: [
              {
                prices: [
                  {
                    sellPrice:
                      1499,

                    discountPrice:
                      null,

                    campaignPrice:
                      null,

                    currencyCode:
                      'TRY',

                    priceListId:
                      null,
                  },
                ],
              },

              {
                prices: [
                  {
                    sellPrice:
                      1499,

                    discountPrice:
                      null,

                    campaignPrice:
                      null,

                    currency:
                      'TRY',

                    priceListId:
                      null,
                  },
                ],
              },
            ],
          }),
        );


        const result =
          await ikasPublicPriceProvider.getPrice({
            url:
              'https://nowanstore.com.tr/peria-dugmeli-gomlek?Renkler=Ekru',
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
          return;
        }


        expect(
          result.observation.priceMinor,
        ).toBe(
          149900,
        );

        expect(
          result.observation.currency,
        ).toBe(
          'TRY',
        );

        expect(
          result.observation.provider,
        ).toBe(
          'ikas',
        );

        expect(
          result.observation.method,
        ).toBe(
          'next-data-page-specific',
        );
      },
    );


    test(
      'does not treat an IKAS category slug as a product',
      async () => {
        mockHtml(
          makeHtml({
            name:
              'RENKLİ GÖMLEK',

            metaData: {
              slug:
                'renkli-gomlek',
            },

            categoryPath:
              '/renkli-gomlek',

            conditions:
              [],
          }),
        );


        const result =
          await ikasPublicPriceProvider.getPrice({
            url:
              'https://sentetiksezar.com/renkli-gomlek',
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
      'rejects multiple variant base prices instead of guessing',
      async () => {
        mockHtml(
          makeHtml({
            name:
              'Variable Product',

            metaData: {
              slug:
                'variable-product',
            },

            variants: [
              {
                prices: [
                  {
                    sellPrice:
                      1000,

                    currencyCode:
                      'TRY',

                    priceListId:
                      null,
                  },
                ],
              },

              {
                prices: [
                  {
                    sellPrice:
                      1200,

                    currencyCode:
                      'TRY',

                    priceListId:
                      null,
                  },
                ],
              },
            ],
          }),
        );


        const result =
          await ikasPublicPriceProvider.getPrice({
            url:
              'https://example.com/variable-product',
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
      'rejects discounted price semantics until explicitly validated',
      async () => {
        mockHtml(
          makeHtml({
            name:
              'Sale Product',

            metaData: {
              slug:
                'sale-product',
            },

            variants: [
              {
                prices: [
                  {
                    sellPrice:
                      1199,

                    discountPrice:
                      839,

                    campaignPrice:
                      null,

                    currencyCode:
                      'TRY',

                    priceListId:
                      null,
                  },
                ],
              },
            ],
          }),
        );


        const result =
          await ikasPublicPriceProvider.getPrice({
            url:
              'https://example.com/sale-product',
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
      'ignores product lists outside pageSpecificData',
      async () => {
        const nextData = {
          page:
            '/[slug]',

          props: {
            pageProps: {
              pageSpecificData: {
                name:
                  'Category',

                metaData: {
                  slug:
                    'target-product',
                },

                conditions:
                  [],
              },

              propValues: [
                {
                  productsList: {
                    data: [
                      {
                        name:
                          'Target Product',

                        metaData: {
                          slug:
                            'target-product',
                        },

                        variants: [
                          {
                            prices: [
                              {
                                sellPrice:
                                  999,

                                currencyCode:
                                  'TRY',
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          },
        };


        mockHtml(`
          <html>
            <head>
              <script src="https://cdn.myikas.com/test.js"></script>
            </head>
            <body>
              <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>
            </body>
          </html>
        `);


        const result =
          await ikasPublicPriceProvider.getPrice({
            url:
              'https://example.com/target-product',
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
  },
);
describe(
  'resolveProductPrice IKAS fallback',
  () => {
    test(
      'uses IKAS fallback before Woo for a Shopify-shaped non-Shopify URL',
      async () => {
        const html =
          makeHtml({
            name:
              'Faux IKAS Product',

            metaData: {
              slug:
                'faux-ikas-product',
            },

            variants: [
              {
                prices: [
                  {
                    sellPrice:
                      1234,

                    discountPrice:
                      null,

                    campaignPrice:
                      null,

                    currencyCode:
                      'TRY',

                    priceListId:
                      null,
                  },
                ],
              },
            ],
          });


        const mockFetch =
          async (
            input:
              Parameters<typeof fetch>[0],
          ) => {
            const rawUrl =
              typeof input ===
                'string'
                ? input
                : (
                    input instanceof URL
                      ? input.toString()
                      : input.url
                  );

            const url =
              new URL(
                rawUrl,
              );


            /*
             * Structured ve IKAS aynı gerçek
             * storefront URL'sini görür.
             */
            if (
              url.pathname ===
                '/products/faux-ikas-product'
            ) {
              return new Response(
                html,
                {
                  status:
                    200,

                  headers: {
                    'content-type':
                      'text/html; charset=utf-8',
                  },
                },
              );
            }


            /*
             * Shopify probe'ları başarısız.
             * Böylece router'ın IKAS fallback'ine
             * geçmesini doğruluyoruz.
             */
            if (
              url.pathname ===
                '/products/faux-ikas-product.js' ||
              url.pathname ===
                '/cart.js'
            ) {
              return new Response(
                '',
                {
                  status:
                    404,
                },
              );
            }


            /*
             * IKAS başarılı olursa Woo'ya
             * ulaşılmaması gerekir.
             */
            if (
              url.pathname.includes(
                '/wp-json/',
              )
            ) {
              throw new Error(
                'WOO_SHOULD_NOT_BE_CALLED',
              );
            }


            return new Response(
              '',
              {
                status:
                  404,
              },
            );
          };


        globalThis.fetch =
          mockFetch as unknown as
            typeof fetch;


        const result =
          await resolveProductPrice({
            url:
              'https://example.com/products/faux-ikas-product',

            expectedCurrency:
              'TRY',
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
          return;
        }


        expect(
          result.observation.provider,
        ).toBe(
          'ikas',
        );

        expect(
          result.observation.priceMinor,
        ).toBe(
          123400,
        );

        expect(
          result.observation.currency,
        ).toBe(
          'TRY',
        );

        expect(
          result.attempts.map(
            (attempt) =>
              attempt.provider,
          ),
        ).toEqual([
          'structured_html',
          'shopify',
          'ikas',
        ]);
      },
    );
  },
);