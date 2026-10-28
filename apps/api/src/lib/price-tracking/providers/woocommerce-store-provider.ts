import { retailerFetch } from '../retailer-http';
import type {
  PriceProvider,
  PriceProviderContext,
  PriceProviderFailureReason,
  PriceProviderResult,
} from '../price-provider';

const REQUEST_TIMEOUT_MS = 8_000;
import { wooAvailability } from '../availability';

type WooStoreProduct = {
  slug?: unknown;
  permalink?: unknown;
  prices?: {
    price?: unknown;
    currency_code?: unknown;
    currency_minor_unit?: unknown;
  };
};

function supportsHttpUrl(
  url: string,
): boolean {
  try {
    const parsed = new URL(url);

    return (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:'
    );
  } catch {
    return false;
  }
}

function extractSlug(
  url: string,
): string | null {
  try {
    const parsed = new URL(url);

    const segments =
      parsed.pathname
        .split('/')
        .filter(Boolean);

    const last =
      segments.at(-1);

    if (!last) {
      return null;
    }

    return decodeURIComponent(
      last,
    ).trim();
  } catch {
    return null;
  }
}

/*
 * /tr/product/x veya /en-gb/urun/x gibi adreslerde ilk
 * bölüm dil klasörüdür. Tek bölümlü adres (/tr) bir slug'dır.
 */
function extractLanguageDirectory(
  parsed: URL,
): string | null {
  const segments =
    parsed.pathname
      .split('/')
      .filter(Boolean);

  const first =
    segments[0];

  return (
    segments.length > 1 &&
    first !== undefined &&
    /^[a-z]{2}(?:-[a-z]{2})?$/i.test(
      first,
    )
      ? first
      : null
  );
}

function isSamePage(
  permalink: unknown,
  parsed: URL,
): boolean {
  if (
    typeof permalink !==
    'string'
  ) {
    return false;
  }

  try {
    const target =
      new URL(permalink);

    const normalize = (
      url: URL,
    ) =>
      `${url.hostname.replace(/^www\./, '')}${decodeURIComponent(url.pathname).replace(/\/$/, '')}`.toLowerCase();

    return (
      normalize(target) ===
      normalize(parsed)
    );
  } catch {
    return false;
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null
  );
}

export const woocommerceStorePriceProvider: PriceProvider = {
  name: 'woocommerce',

  canHandle(
    context: PriceProviderContext,
  ): boolean {
    return supportsHttpUrl(
      context.url,
    );
  },

  async getPrice(
    context: PriceProviderContext,
  ): Promise<PriceProviderResult> {
    let parsed: URL;

    try {
      parsed = new URL(
        context.url,
      );
    } catch {
      return {
        status: 'failure',
        reason: 'unsupported',
        error: 'Invalid product URL',
      };
    }

    const slug =
      extractSlug(
        context.url,
      );

    if (!slug) {
      return {
        status: 'failure',
        reason: 'unsupported',
        error:
          'Could not derive WooCommerce product slug',
      };
    }

    const encodedSlug =
      encodeURIComponent(
        slug,
      );

    /*
     * Dil klasörlü mağaza (ör. gebematernity.com/tr/product/...):
     * ürün yalnız o dilin Store API'sinde listelenir, kökteki uç
     * nokta boş dizi döner. Bu uç noktadan gelen ürün ancak kendi
     * permalink'i istenen adresle aynıysa kabul edilir.
     */
    const languageDirectory =
      extractLanguageDirectory(
        parsed,
      );

    const languageEndpoint =
      languageDirectory
        ? `${parsed.origin}/${languageDirectory}/wp-json/wc/store/v1/products?slug=${encodedSlug}`
        : null;

    const endpoints = [
      ...(languageEndpoint
        ? [languageEndpoint]
        : []),
      `${parsed.origin}/wp-json/wc/store/v1/products?slug=${encodedSlug}`,
      `${parsed.origin}/wp-json/wc/store/products?slug=${encodedSlug}`,
    ];

    let lastReason:
      PriceProviderFailureReason =
        'not_found';

    let lastError =
      'WooCommerce product not found';

    for (const endpoint of endpoints) {
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
            endpoint,
            {
              redirect: 'follow',
              signal:
                controller.signal,
              headers: {
                accept:
                  'application/json',
                'accept-language':
                  'tr-TR,tr;q=0.9,en;q=0.7',
                'user-agent':
                  'Mozilla/5.0 (compatible; ButikaPriceTracker/1.0)',
              },
            },
          );

        if (
          response.status === 404
        ) {
          continue;
        }

        if (!response.ok) {
          lastReason =
            'http_error';

          lastError =
            `WooCommerce Store API HTTP ${response.status}`;

          continue;
        }

        /*
         * WordPress olmayan siteler (ör. IdeaSoft) bu adrese
         * 200 ile kendi HTML sayfasını döndürür. Bu bozuk bir
         * WooCommerce yanıtı değil; sitede Store API yok.
         */
        let payload:
          unknown;

        try {
          payload =
            JSON.parse(
              await response.text(),
            );
        } catch {
          lastReason =
            'unsupported';

          lastError =
            'Site has no WooCommerce Store API (answered with a non-JSON page)';

          continue;
        }

        if (
          !Array.isArray(
            payload,
          )
        ) {
          continue;
        }

        /*
         * Kritik:
         * Bazı WooCommerce kurulumları slug query'sini
         * göz ardı edip başka ürünler döndürebiliyor.
         * Bu yüzden ilk ürünü ASLA doğrudan kullanmıyoruz.
         */
        const exactProduct =
          payload.find(
            (item) => {
              if (
                !isRecord(item)
              ) {
                return false;
              }

              const itemSlug =
                item.slug;

              return (
                typeof itemSlug ===
                  'string' &&
                itemSlug
                  .toLowerCase() ===
                  slug.toLowerCase() &&
                (endpoint !==
                  languageEndpoint ||
                  isSamePage(
                    item.permalink,
                    parsed,
                  ))
              );
            },
          );

        if (
          !isRecord(
            exactProduct,
          )
        ) {
          continue;
        }

        const prices =
          exactProduct.prices;

        if (
          !isRecord(prices)
        ) {
          continue;
        }

        const rawPrice =
          prices.price;

        const rawCurrency =
          prices.currency_code;

        const rawMinorUnit =
          prices.currency_minor_unit;

        if (
          typeof rawMinorUnit !==
            'number' ||
          !Number.isInteger(
            rawMinorUnit,
          ) ||
          rawMinorUnit < 0 ||
          rawMinorUnit > 6
        ) {
          lastReason =
            'unsupported';

          lastError =
            `Unsupported WooCommerce currency minor unit: ${String(rawMinorUnit)}`;

          continue;
        }

        if (
          typeof rawPrice !==
            'string' ||
          !/^\d+$/.test(
            rawPrice,
          )
        ) {
          continue;
        }

        const rawPriceInteger =
          Number(rawPrice);

        if (
          !Number.isSafeInteger(
            rawPriceInteger,
          ) ||
          rawPriceInteger <= 0
        ) {
          continue;
        }

        if (
          typeof rawCurrency !==
            'string'
        ) {
          continue;
        }

        const currency =
          rawCurrency
            .trim()
            .toUpperCase();

        if (
          !/^[A-Z]{3}$/.test(
            currency,
          )
        ) {
          continue;
        }

        /*
         * Butika'nın mevcut priceMinor modeli
         * iki ondalık basamak kullanıyor.
         *
         * WooCommerce Store API ise mağazanın
         * currency_minor_unit ayarına göre integer
         * fiyat döndürebilir.
         *
         * Örn:
         * price=2400, minorUnit=0, TRY
         * => 2400 TRY
         * => Butika priceMinor=240000
         */
        let isoMinorUnit:
          number | null =
            null;

        try {
          isoMinorUnit =
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
            null;
        } catch {
          isoMinorUnit =
            null;
        }

        /*
         * Butika'nın mevcut global modeli
         * iki-basamaklı currencies için tasarlandı.
         * JPY gibi currency'leri şimdilik kabul etme.
         */
        if (
          isoMinorUnit !== 2
        ) {
          lastReason =
            'unsupported';

          lastError =
            `Unsupported currency for Butika minor-unit model: ${currency}`;

          continue;
        }

        const exponentDifference =
          2 -
          rawMinorUnit;

        let priceMinor:
          number;

        if (
          exponentDifference >=
          0
        ) {
          priceMinor =
            rawPriceInteger *
            10 **
              exponentDifference;
        } else {
          const divisor =
            10 **
              -exponentDifference;

          /*
           * Woo fiyatı Butika'nın 2-basamaklı
           * modelinde kayıpsız temsil edilemiyorsa
           * yuvarlama yapma.
           */
          if (
            rawPriceInteger %
              divisor !==
            0
          ) {
            lastReason =
              'unsupported';

            lastError =
              `WooCommerce price precision cannot be represented safely: minor unit ${rawMinorUnit}`;

            continue;
          }

          priceMinor =
            rawPriceInteger /
            divisor;
        }

        if (
          !Number.isSafeInteger(
            priceMinor,
          ) ||
          priceMinor <= 0
        ) {
          lastReason =
            'unsupported';

          lastError =
            'WooCommerce normalized price is outside the safe integer range';

          continue;
        }

        return {
          status: 'success',
          observation: {
            availability: wooAvailability(exactProduct),
            priceMinor,
            currency,
            observedAt:
              new Date(),
            provider:
              'woocommerce',
            method:
              rawMinorUnit === 2
                ? 'store-api'
                : 'store-api-normalized',
          },
        };
      } catch (error) {
        if (
          error instanceof Error &&
          error.name ===
            'AbortError'
        ) {
          lastReason =
            'timeout';

          lastError =
            `WooCommerce request timed out after ${REQUEST_TIMEOUT_MS}ms`;
        } else {
          lastReason =
            'http_error';

          lastError =
            error instanceof Error
              ? error.message
              : String(error);
        }
      } finally {
        clearTimeout(
          timeout,
        );
      }
    }

    return {
      status: 'failure',
      reason:
        lastReason,
      error:
        lastError,
    };
  },
};
