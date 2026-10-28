import { retailerFetch } from '../retailer-http';
import { ikasProductAvailability } from '../ikas-stock';
import type {
  PriceProvider,
  PriceProviderContext,
  PriceProviderFailureReason,
  PriceProviderResult,
} from '../price-provider';


const REQUEST_TIMEOUT_MS =
  8_000;

const USER_AGENT =
  'Mozilla/5.0 (compatible; ButikaPriceTracker/1.0)';


type JsonRecord =
  Record<string, unknown>;


type IkasPrice = {
  sellPrice?: unknown;
  discountPrice?: unknown;
  campaignPrice?: unknown;
  currency?: unknown;
  currencyCode?: unknown;
  priceListId?: unknown;
};


function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    value !== null &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value,
    )
  );
}


function supportsHttpUrl(
  url: string,
): boolean {
  try {
    const parsed =
      new URL(
        url,
      );

    return (
      parsed.protocol ===
        'http:' ||
      parsed.protocol ===
        'https:'
    );
  } catch {
    return false;
  }
}


function productSlugFromUrl(
  url: string,
): string | null {
  try {
    const parsed =
      new URL(
        url,
      );

    const slug =
      parsed.pathname
        .split('/')
        .filter(
          Boolean,
        )
        .at(-1)
        ?.trim()
        .toLowerCase() ??
      '';

    return (
      slug.length >
        0
        ? slug
        : null
    );
  } catch {
    return null;
  }
}


function extractNextData(
  html: string,
): JsonRecord | null {
  /*
   * IKAS storefront şu anda Next.js kullanıyor.
   * Ana ürün verisi __NEXT_DATA__ içinde serialize.
   */
  const match =
    html.match(
      /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    );

  if (
    !match?.[1]
  ) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(
        match[1],
      ) as unknown;

    return isRecord(
      parsed,
    )
      ? parsed
      : null;
  } catch {
    return null;
  }
}


function isIkasHtml(
  html: string,
): boolean {
  /*
   * Sadece herhangi bir Next.js sayfasını IKAS
   * olarak kabul etmiyoruz.
   *
   * Storefront HTML'lerinde cdn.myikas.com
   * veya public storefront API izi bulunuyor.
   */
  return (
    /https?:\/\/cdn\.myikas\.com\//i.test(
      html,
    ) ||
    /https?:\/\/api\.myikas\.com\/api\/sf\/graphql/i.test(
      html,
    )
  );
}


function getPageSpecificData(
  nextData: JsonRecord,
): JsonRecord | null {
  const props =
    nextData.props;

  if (
    !isRecord(
      props,
    )
  ) {
    return null;
  }

  const pageProps =
    props.pageProps;

  if (
    !isRecord(
      pageProps,
    )
  ) {
    return null;
  }

  const pageSpecificData =
    pageProps.pageSpecificData;

  return isRecord(
    pageSpecificData,
  )
    ? pageSpecificData
    : null;
}


function getObjectSlug(
  value: JsonRecord,
): string | null {
  const metaData =
    value.metaData;

  if (
    !isRecord(
      metaData,
    )
  ) {
    return null;
  }

  const slug =
    metaData.slug;

  if (
    typeof slug !==
      'string'
  ) {
    return null;
  }

  const normalized =
    slug
      .trim()
      .toLowerCase();

  return normalized
    ? normalized
    : null;
}


function getIsoFractionDigits(
  currency: string,
): number | null {
  try {
    return (
      new Intl.NumberFormat(
        'en',
        {
          style:
            'currency',

          currency,
        },
      )
        .resolvedOptions()
        .maximumFractionDigits ??
      null
    );
  } catch {
    return null;
  }
}


function majorToButikaMinor(
  major:
    number,
  currency:
    string,
): number | null {
  /*
   * Butika'nın mevcut DB modeli iki basamaklı
   * minor-unit kullanıyor.
   */
  if (
    getIsoFractionDigits(
      currency,
    ) !==
    2
  ) {
    return null;
  }

  if (
    !Number.isFinite(
      major,
    ) ||
    major <=
      0
  ) {
    return null;
  }

  const scaled =
    major *
    100;

  const rounded =
    Math.round(
      scaled,
    );

  if (
    !Number.isSafeInteger(
      rounded,
    ) ||
    rounded <=
      0
  ) {
    return null;
  }

  /*
   * Floating-point kaynaklı çok küçük farkı
   * kabul et; gerçek 3+ ondalık hassasiyeti reddet.
   */
  if (
    Math.abs(
      scaled -
      rounded,
    ) >
    0.000001
  ) {
    return null;
  }

  return rounded;
}


function normalizeCurrency(
  value: unknown,
): string | null {
  if (
    typeof value !==
      'string'
  ) {
    return null;
  }

  const currency =
    value
      .trim()
      .toUpperCase();

  return /^[A-Z]{3}$/.test(
    currency,
  )
    ? currency
    : null;
}


function hasPositiveConditionalPrice(
  value: unknown,
): boolean {
  return (
    typeof value ===
      'number' &&
    Number.isFinite(
      value,
    ) &&
    value >
      0
  );
}


function extractBasePrices(
  pageSpecificData:
    JsonRecord,
  expectedCurrency:
    string | null,
): {
  priceMinor: number;
  currency: string;
} | {
  failure:
    PriceProviderResult;
} {
  const variants =
    pageSpecificData.variants;

  /*
   * Category/collection sayfaları aynı /[slug]
   * route'unu kullanabiliyor.
   * variants yoksa ürün olarak kabul etme.
   */
  if (
    !Array.isArray(
      variants,
    ) ||
    variants.length ===
      0
  ) {
    return {
      failure: {
        status:
          'failure',

        reason:
          'not_found',

        error:
          'IKAS pageSpecificData is not a product with variants',
      },
    };
  }


  const observations:
    Array<{
      priceMinor: number;
      currency: string;
    }> =
      [];


  for (
    const variant of
    variants
  ) {
    if (
      !isRecord(
        variant,
      )
    ) {
      continue;
    }

    const prices =
      variant.prices;

    if (
      !Array.isArray(
        prices,
      )
    ) {
      continue;
    }


    for (
      const rawPrice of
      prices
    ) {
      if (
        !isRecord(
          rawPrice,
        )
      ) {
        continue;
      }

      const price =
        rawPrice as
          IkasPrice;


      /*
       * Dinamik/özel price-list fiyatlarını
       * ilk sürümde canonical storefront
       * fiyatı olarak kabul etmiyoruz.
       */
      if (
        price.priceListId !==
          null &&
        price.priceListId !==
          undefined &&
        price.priceListId !==
          ''
      ) {
        continue;
      }


      /*
       * discountPrice/campaignPrice semantiğini
       * henüz exact-product seviyesinde
       * doğrulamadık.
       *
       * Yanlış fiyat bildirimindense
       * unsupported daha güvenli.
       */
      if (
        hasPositiveConditionalPrice(
          price.discountPrice,
        ) ||
        hasPositiveConditionalPrice(
          price.campaignPrice,
        )
      ) {
        return {
          failure: {
            status:
              'failure',

            reason:
              'unsupported',

            error:
              'IKAS discounted or campaign price requires explicit validation',
          },
        };
      }


      const currency =
        normalizeCurrency(
          price.currencyCode,
        ) ??
        normalizeCurrency(
          price.currency,
        );

      if (
        !currency
      ) {
        continue;
      }


      if (
        expectedCurrency &&
        currency !==
          expectedCurrency
      ) {
        continue;
      }


      if (
        typeof price.sellPrice !==
          'number'
      ) {
        continue;
      }


      const priceMinor =
        majorToButikaMinor(
          price.sellPrice,
          currency,
        );

      if (
        priceMinor ===
          null
      ) {
        continue;
      }


      observations.push({
        priceMinor,
        currency,
      });
    }
  }


  if (
    observations.length ===
      0
  ) {
    return {
      failure: {
        status:
          'failure',

        reason:
          'not_found',

        error:
          'IKAS product has no safe base price',
      },
    };
  }


  const unique =
    new Map<
      string,
      {
        priceMinor: number;
        currency: string;
      }
    >();


  for (
    const observation of
    observations
  ) {
    unique.set(
      `${observation.currency}:${observation.priceMinor}`,
      observation,
    );
  }


  /*
   * Farklı currency veya farklı varyant fiyatları
   * varsa URL/query üzerinden exact variant
   * çözmeden tahmin yapmıyoruz.
   */
  if (
    unique.size !==
      1
  ) {
    return {
      failure: {
        status:
          'failure',

        reason:
          'unsupported',

        error:
          'IKAS product variants expose multiple base prices',
      },
    };
  }


  const first =
    unique
      .values()
      .next()
      .value;


  if (
    !first
  ) {
    return {
      failure: {
        status:
          'failure',

        reason:
          'not_found',

        error:
          'IKAS product price could not be selected',
      },
    };
  }


  return first;
}


export const ikasPublicPriceProvider:
  PriceProvider = {
    name:
      'ikas',

    canHandle(
      context:
        PriceProviderContext,
    ): boolean {
      return supportsHttpUrl(
        context.url,
      );
    },

    async getPrice(
      context:
        PriceProviderContext,
    ): Promise<PriceProviderResult> {
      const slug =
        productSlugFromUrl(
          context.url,
        );

      if (
        !slug
      ) {
        return {
          status:
            'failure',

          reason:
            'not_found',

          error:
            'IKAS product slug is missing',
        };
      }


      const controller =
        new AbortController();

      const timeout =
        setTimeout(
          () =>
            controller.abort(),
          REQUEST_TIMEOUT_MS,
        );


      try {
        const response =
          await retailerFetch(
            context.url,
            {
              redirect:
                'follow',

              signal:
                controller.signal,

              headers: {
                accept:
                  'text/html,application/xhtml+xml,*/*;q=0.8',

                'accept-language':
                  'tr-TR,tr;q=0.9,en;q=0.7',

                'user-agent':
                  USER_AGENT,
              },
            },
          );


        if (
          response.status ===
            404
        ) {
          return {
            status:
              'failure',

            reason:
              'not_found',

            error:
              'IKAS product page returned HTTP 404',
          };
        }


        if (
          response.status ===
            401 ||
          response.status ===
            403 ||
          response.status ===
            429
        ) {
          return {
            status:
              'failure',

            reason:
              'blocked',

            error:
              `IKAS product page returned HTTP ${response.status}`,
          };
        }


        if (
          !response.ok
        ) {
          return {
            status:
              'failure',

            reason:
              'http_error',

            error:
              `IKAS product page returned HTTP ${response.status}`,
          };
        }


        const html =
          await response.text();


        if (
          !isIkasHtml(
            html,
          )
        ) {
          return {
            status:
              'failure',

            reason:
              'unsupported',

            error:
              'Page does not expose an IKAS storefront signature',
          };
        }


        const nextData =
          extractNextData(
            html,
          );

        if (
          !nextData
        ) {
          return {
            status:
              'failure',

            reason:
              'not_found',

            error:
              'IKAS __NEXT_DATA__ was not found',
          };
        }


        if (
          nextData.page !==
            '/[slug]'
        ) {
          return {
            status:
              'failure',

            reason:
              'not_found',

            error:
              'IKAS page is not a slug detail route',
          };
        }


        const product =
          getPageSpecificData(
            nextData,
          );

        if (
          !product
        ) {
          return {
            status:
              'failure',

            reason:
              'not_found',

            error:
              'IKAS pageSpecificData was not found',
          };
        }


        const exactSlug =
          getObjectSlug(
            product,
          );

        if (
          exactSlug !==
            slug
        ) {
          return {
            status:
              'failure',

            reason:
              'not_found',

            error:
              'IKAS pageSpecificData slug does not match requested product',
          };
        }


        const expectedCurrency =
          normalizeCurrency(
            context.expectedCurrency,
          );


        const result =
          extractBasePrices(
            product,
            expectedCurrency,
          );


        if (
          'failure' in
          result
        ) {
          return result.failure;
        }


        return {
          status:
            'success',

          observation: {
            availability: ['variant', '_butika_variant', 'vid'].some(key => new URL(context.url).searchParams.has(key))
              ? 'unknown'
              : ikasProductAvailability(html, context.url, result.priceMinor, result.currency),
            priceMinor:
              result.priceMinor,

            currency:
              result.currency,

            observedAt:
              new Date(),

            provider:
              'ikas',

            method:
              'next-data-page-specific',
          },
        };
      } catch (error) {
        const reason:
          PriceProviderFailureReason =
            (
              error instanceof Error &&
              error.name ===
                'AbortError'
            )
              ? 'timeout'
              : 'http_error';


        return {
          status:
            'failure',

          reason,

          error:
            reason ===
              'timeout'
              ? `IKAS request timed out after ${REQUEST_TIMEOUT_MS}ms`
              : (
                  error instanceof Error
                    ? error.message
                    : String(error)
                ),
        };
      } finally {
        clearTimeout(
          timeout,
        );
      }
    },
  };
