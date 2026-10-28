import { retailerFetch } from '../retailer-http';
import { selectShopifyPrice } from './shopify-price-selection';
import { shopifyAvailability } from '../availability';
import type {
  PriceProvider,
  PriceProviderContext,
  PriceProviderFailureReason,
  PriceProviderResult,
} from '../price-provider';

const REQUEST_TIMEOUT_MS =
  20_000;

type ShopifyCart = {
  currency?: unknown;
};

type FetchJsonResult = {
  ok: boolean;
  status: number | null;
  data: unknown;
  reason:
    | PriceProviderFailureReason
    | null;
  error: string | null;
};

function supportsShopifyProductUrl(
  rawUrl: string,
): boolean {
  try {
    const parsed =
      new URL(
        rawUrl,
      );

    if (
      parsed.protocol !==
        'http:' &&
      parsed.protocol !==
        'https:'
    ) {
      return false;
    }

    const segments =
      parsed.pathname
        .split('/')
        .filter(Boolean);

    const productsIndex =
      segments.findIndex(
        (segment) =>
          segment.toLowerCase() ===
          'products',
      );

    return (
      productsIndex >=
        0 &&
      typeof segments[
        productsIndex + 1
      ] ===
        'string' &&
      segments[
        productsIndex + 1
      ]!.length >
        0
    );
  } catch {
    return false;
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value ===
      'object' &&
    value !==
      null
  );
}

function getCurrencyMinorDigits(
  currency: string,
): number | null {
  try {
    const resolved =
      new Intl.NumberFormat(
        'en-US',
        {
          style:
            'currency',
          currency,
        },
      ).resolvedOptions();

    return (
      resolved
        .maximumFractionDigits ??
      null
    );
  } catch {
    return null;
  }
}

function getProductJsUrl(
  rawUrl: string,
): string | null {
  try {
    const parsed =
      new URL(
        rawUrl,
      );

    const segments =
      parsed.pathname
        .split('/')
        .filter(Boolean);

    const productsIndex =
      segments.findIndex(
        (segment) =>
          segment.toLowerCase() ===
          'products',
      );

    if (
      productsIndex <
        0 ||
      !segments[
        productsIndex + 1
      ]
    ) {
      return null;
    }

    /*
     * /products/handle
     * /tr/products/handle
     * /en-us/products/handle
     * gibi locale prefixlerini koruyoruz.
     */
    const prefix = segments.slice(0, productsIndex);
    // Collection navigation is not part of the Ajax API's locale root.
    if (prefix.at(-2)?.toLowerCase() === 'collections') prefix.splice(-2);
    const relevant = [...prefix, 'products', segments[productsIndex + 1]!];

    relevant[
      relevant.length - 1
    ] =
      `${relevant.at(-1)}.js`;

    parsed.pathname =
      `/${relevant.join('/')}`;

    /*
     * variant query Shopify tarafından
     * product.js endpointi için gerekli değil.
     * Seçimi payload içinden biz yapıyoruz.
     */
    parsed.search = '';
    parsed.hash = '';

    return parsed.toString();
  } catch {
    return null;
  }
}

function getCartJsUrl(
  rawUrl: string,
): string | null {
  try {
    const parsed =
      new URL(
        rawUrl,
      );

    const segments =
      parsed.pathname
        .split('/')
        .filter(Boolean);

    const productsIndex =
      segments.findIndex(
        (segment) =>
          segment.toLowerCase() ===
          'products',
      );

    if (
      productsIndex <
      0
    ) {
      return null;
    }

    /*
     * Locale prefix varsa koru:
     *
     * /products/x       -> /cart.js
     * /tr/products/x    -> /tr/cart.js
     * /en-us/products/x -> /en-us/cart.js
     */
    const prefix =
      segments.slice(
        0,
        productsIndex,
      );
    if (prefix.at(-2)?.toLowerCase() === 'collections') prefix.splice(-2);

    parsed.pathname =
      `/${
        prefix.length >
        0
          ? `${prefix.join('/')}/`
          : ''
      }cart.js`;

    parsed.search = '';
    parsed.hash = '';

    return parsed.toString();
  } catch {
    return null;
  }
}

// Shopify redirects a renamed product's page to its new handle but not the .js
// endpoint. Returns that redirect target, keeping the saved query, for a URL with
// one exact variant; the caller must still find that variant in the product.
async function renamedProductUrl(rawUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const requested = new URL(rawUrl);
    const variants = requested.searchParams.getAll('variant');
    if (variants.length !== 1 || !/^[1-9]\d*$/.test(variants[0] ?? '')) return null;
    const page = new URL(requested.origin + requested.pathname);
    const response = await retailerFetch(page.toString(), {
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept: 'text/html,*/*', 'accept-language': 'tr-TR,tr;q=0.9,en;q=0.7',
        'user-agent': 'Mozilla/5.0 (compatible; ButikaPriceTracker/1.0)' },
    });
    await response.body?.cancel().catch(() => {});
    const location = response.headers.get('location');
    if (![301, 302, 307, 308].includes(response.status) || !location) return null;
    const target = new URL(location, page);
    if (target.origin !== page.origin || target.username || target.password) return null;
    target.search = requested.search;
    target.hash = '';
    const next = getProductJsUrl(target.toString());
    return next && next !== getProductJsUrl(rawUrl) ? target.toString() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(
  url: string,
): Promise<FetchJsonResult> {
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
        url,
        {
          redirect:
            'follow',

          signal:
            controller.signal,

          headers: {
            accept:
              'application/json,text/plain,*/*',

            'accept-language':
              'tr-TR,tr;q=0.9,en;q=0.7',

            'user-agent':
              'Mozilla/5.0 (compatible; ButikaPriceTracker/1.0)',
          },
        },
      );

    if (
      response.status ===
        404
    ) {
      return {
        ok:
          false,

        status:
          response.status,

        data:
          null,

        reason:
          'not_found',

        error:
          `Shopify endpoint HTTP ${response.status}`,
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
        ok:
          false,

        status:
          response.status,

        data:
          null,

        reason:
          'blocked',

        error:
          `Shopify endpoint HTTP ${response.status}`,
      };
    }

    if (
      !response.ok
    ) {
      return {
        ok:
          false,

        status:
          response.status,

        data:
          null,

        reason:
          'http_error',

        error:
          `Shopify endpoint HTTP ${response.status}`,
      };
    }

    const data:
      unknown =
        await response.json();

    return {
      ok:
        true,

      status:
        response.status,

      data,

      reason:
        null,

      error:
        null,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name ===
        'AbortError'
    ) {
      return {
        ok:
          false,

        status:
          null,

        data:
          null,

        reason:
          'timeout',

        error:
          `Shopify request timed out after ${REQUEST_TIMEOUT_MS}ms`,
      };
    }

    return {
      ok:
        false,

      status:
        null,

      data:
        null,

      reason:
        'http_error',

      error:
        error instanceof Error
          ? error.message
          : String(error),
    };
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

export const shopifyPublicPriceProvider:
  PriceProvider = {
    name:
      'shopify',

    canHandle(
      context:
        PriceProviderContext,
    ): boolean {
      return supportsShopifyProductUrl(
        context.url,
      );
    },

    async getPrice(
      context:
        PriceProviderContext,
    ): Promise<PriceProviderResult> {
      const productJsUrl =
        getProductJsUrl(
          context.url,
        );

      const cartJsUrl =
        getCartJsUrl(
          context.url,
        );

      if (
        !productJsUrl ||
        !cartJsUrl
      ) {
        return {
          status:
            'failure',

          reason:
            'unsupported',

          error:
            'Could not derive Shopify public endpoints',
        };
      }

      const [
        firstProductResult,
        cartResult,
      ] =
        await Promise.all([
          fetchJson(
            productJsUrl,
          ),
          fetchJson(
            cartJsUrl,
          ),
        ]);

      // A saved size keeps its variant id when the product is renamed. Accept the
      // redirected product only if it has that exact variant; otherwise the
      // original not_found stands and the page price is still used.
      let productResult = firstProductResult;
      let selectionUrl = context.url;
      if (!productResult.ok && productResult.reason === 'not_found') {
        const renamed = await renamedProductUrl(context.url);
        const renamedJs = renamed ? getProductJsUrl(renamed) : null;
        const retry = renamed && renamedJs ? await fetchJson(renamedJs) : null;
        if (renamed && retry?.ok && isRecord(retry.data) && !('status' in selectShopifyPrice(retry.data, renamed))) {
          productResult = retry;
          selectionUrl = renamed;
        }
      }

      if (
        !productResult.ok
      ) {
        return {
          status:
            'failure',

          reason:
            productResult.reason ??
            'provider_error',

          error:
            productResult.error ??
            'Shopify product endpoint failed',
          ...(productResult.status === 404 && cartResult.status === 404 ? { storefrontMissing: true } : {}),
        };
      }

      if (
        !isRecord(
          productResult.data,
        )
      ) {
        return {
          status:
            'failure',

          reason:
            'not_found',

          error:
            'Invalid Shopify product payload',
        };
      }

      const selection = selectShopifyPrice(productResult.data, selectionUrl);
      if ('status' in selection) return selection;
      const { priceMinor, variantId: requestedVariantId } = selection;

      if (!cartResult.ok) {
        return { status: 'failure', reason: cartResult.reason ?? 'provider_error', error: cartResult.error ?? 'Shopify cart endpoint failed' };
      }

      if (
        !isRecord(
          cartResult.data,
        )
      ) {
        return {
          status:
            'failure',

          reason:
            'not_found',

          error:
            'Invalid Shopify cart payload',
        };
      }

      const cart =
        cartResult.data as
          ShopifyCart;

      const rawCurrency =
        cart.currency;

      if (
        typeof rawCurrency !==
          'string'
      ) {
        return {
          status:
            'failure',

          reason:
            'not_found',

          error:
            'Shopify cart currency not found',
        };
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
        return {
          status:
            'failure',

          reason:
            'unsupported',

          error:
            `Invalid Shopify currency: ${rawCurrency}`,
        };
      }

      const minorDigits =
        getCurrencyMinorDigits(
          currency,
        );

      /*
       * Butika'nın mevcut priceMinor modeli
       * şu anda 2 basamaklı para birimlerine
       * göre çalışıyor.
       */
      if (
        minorDigits !==
        2
      ) {
        return {
          status:
            'failure',

          reason:
            'unsupported',

          error:
            `Unsupported Shopify currency minor unit: ${String(minorDigits)}`,
        };
      }

      return {
        status:
          'success',

        observation: {
          availability: shopifyAvailability(productResult.data, requestedVariantId),
          priceMinor,
          currency,

          observedAt:
            new Date(),

          provider:
            'shopify',

          method:
            requestedVariantId
              ? selectionUrl === context.url ? 'product-js-variant+cart-js' : 'product-js-variant+cart-js+renamed-handle'
              : 'product-js+cart-js',
        },
      };
    },
  };
