import { structuredHtmlPriceProvider } from './providers/structured-html-provider';
import { shopifyPublicPriceProvider } from './providers/shopify-public-provider';
import { ikasPublicPriceProvider } from './providers/ikas-public-provider';
import { woocommerceStorePriceProvider } from './providers/woocommerce-store-provider';
import { withStockTrust } from './stock-trust';
import { baglantiFiyatiBul } from '../baglanti/baglanti-fiyat-kaynagi';
import type {
  PriceObservation,
  PriceProvider,
  PriceProviderAttempt,
  PriceProviderContext,
  PriceProviderFailure,
  PriceProviderFailureReason,
  PriceProviderResult,
  PriceResolutionResult,
} from './price-provider';

const providers: PriceProvider[] = [
  structuredHtmlPriceProvider,
  shopifyPublicPriceProvider,
  ikasPublicPriceProvider,
  woocommerceStorePriceProvider,
];

export function getRegisteredPriceProviders():
  readonly PriceProvider[] {
  return providers;
}

type ProviderExecution = {
  handled: boolean;

  result:
    | PriceProviderResult
    | null;

  attempt:
    | PriceProviderAttempt
    | null;
};

function normalizeExpectedCurrency(
  context: PriceProviderContext,
): string | null {
  const value =
    context.expectedCurrency
      ?.trim()
      .toUpperCase() ??
    null;

  return (
    value &&
    /^[A-Z]{3}$/.test(value)
      ? value
      : null
  );
}

function observationMatchesExpectedCurrency(
  observation: PriceObservation,
  expectedCurrency: string | null,
): boolean {
  if (!expectedCurrency) {
    return true;
  }

  return (
    observation.currency
      .trim()
      .toUpperCase() ===
    expectedCurrency
  );
}

function isExactTenfoldDifference(
  first: number,
  second: number,
): boolean {
  return (
    first ===
      second * 10 ||
    second ===
      first * 10
  );
}

/*
 * Bazı Shopify temaları gerçek storefront
 * fiyatını küsurat yuvarlayarak gösteriyor.
 *
 * Örn:
 * Shopify internal: 649.35 TRY
 * Storefront:        649.00 TRY
 *
 * Maksimum 1 ana para birimi ve %0.2
 * farkı aynı fiyat kabul ediyoruz.
 */
function isNearEquivalentPrice(
  first: number,
  second: number,
): boolean {
  const difference =
    Math.abs(
      first -
      second,
    );

  const larger =
    Math.max(
      first,
      second,
    );

  if (
    larger <=
    0
  ) {
    return false;
  }

  const relativeDifference =
    difference /
    larger;

  return (
    difference <=
      100 &&
    relativeDifference <=
      0.002
  );
}

function withArbitrationMethod(
  observation: PriceObservation,
  suffix: string,
): PriceObservation {
  return {
    ...observation,

    method:
      observation.method
        ? `${observation.method}+${suffix}`
        : suffix,
  };
}

function conflict(
  message: string,
): PriceProviderFailure {
  return {
    status:
      'failure',

    reason:
      'price_conflict',

    error:
      message,
  };
}

async function executeProvider(
  provider: PriceProvider,
  context: PriceProviderContext,
): Promise<ProviderExecution> {
  let canHandle =
    false;

  try {
    canHandle =
      await provider.canHandle(
        context,
      );
  } catch (error) {
    return {
      handled:
        false,

      result:
        null,

      attempt: {
        provider:
          provider.name,

        status:
          'failure',

        reason:
          'provider_error',

        error:
          error instanceof Error
            ? error.message
            : String(error),

        elapsedMs:
          0,
      },
    };
  }

  if (!canHandle) {
    return {
      handled:
        false,

      result:
        null,

      attempt:
        null,
    };
  }

  const startedAt =
    Date.now();

  try {
    const result =
      await provider.getPrice(
        context,
      );

    const elapsedMs =
      Date.now() -
      startedAt;

    if (
      result.status ===
      'success'
    ) {
      return {
        handled:
          true,

        result,

        attempt: {
          provider:
            provider.name,

          status:
            'success',

          elapsedMs,
        },
      };
    }

    return {
      handled:
        true,

      result,

      attempt: {
        provider:
          provider.name,

        status:
          'failure',

        reason:
          result.reason,

        error:
          result.error,

        elapsedMs,
      },
    };
  } catch (error) {
    const result:
      PriceProviderFailure = {
        status:
          'failure',

        reason:
          'provider_error',

        error:
          error instanceof Error
            ? error.message
            : String(error),
      };

    return {
      handled:
        true,

      result,

      attempt: {
        provider:
          provider.name,

        status:
          'failure',

        reason:
          result.reason,

        error:
          result.error,

        elapsedMs:
          Date.now() -
          startedAt,
      },
    };
  }
}

function arbitrateShopifyResults(
  structured:
    PriceProviderResult | null,

  shopify:
    PriceProviderResult | null,

  context:
    PriceProviderContext,
): PriceProviderResult | null {
  if (shopify?.status === 'failure' && shopify.stopFallback) return shopify;
  if (structured?.status === 'success') {
    const provenIkas = structured.observation.method === 'ikas' &&
      !new URL(context.url).searchParams.has('variant') &&
      shopify?.status === 'failure' && shopify.reason === 'not_found';
    // A /products/ address on a host without Shopify's storefront endpoints is not
    // a Shopify store. Only the page's own verified stock may stand (one product,
    // matching price and currency, no mixed offers); a saved size never inherits
    // it, and a timeout, block or server error proves nothing.
    const notShopifyStorefront = !new URL(context.url).searchParams.has('variant') &&
      shopify?.status === 'failure' && shopify.reason === 'not_found' && shopify.storefrontMissing === true;
    structured = { ...structured, observation: { ...structured.observation,
      availability: shopify?.status === 'success' ? shopify.observation.availability ?? 'unknown' :
        provenIkas || notShopifyStorefront ? structured.observation.availability ?? 'unknown' : 'unknown',
    } };
  }
  const expectedCurrency =
    normalizeExpectedCurrency(
      context,
    );

  const structuredSuccess =
    structured?.status ===
    'success'
      ? structured
      : null;

  const shopifySuccess =
    shopify?.status ===
    'success'
      ? shopify
      : null;

  // An explicitly selected size has its own authoritative price. A theme's
  // generic/default-size price must not replace it, even by just one cent.
  if (new URL(context.url).searchParams.has('variant') && shopifySuccess) {
    if (!observationMatchesExpectedCurrency(shopifySuccess.observation,expectedCurrency)) return conflict('Selected Shopify variant currency changed');
    return shopifySuccess;
  }

  /*
   * İkisi de başarısız:
   * WooCommerce gibi sonraki provider'lara
   * devam edebilmek için null.
   */
  if (
    !structuredSuccess &&
    !shopifySuccess
  ) {
    return null;
  }

  /*
   * Sadece structured başarılı.
   */
  if (
    structuredSuccess &&
    !shopifySuccess
  ) {
    if (
      !observationMatchesExpectedCurrency(
        structuredSuccess.observation,
        expectedCurrency,
      )
    ) {
      return conflict(
        `Structured currency ${structuredSuccess.observation.currency} does not match expected ${expectedCurrency}`,
      );
    }

    return structuredSuccess;
  }

  /*
   * Sadece Shopify başarılı.
   */
  if (
    !structuredSuccess &&
    shopifySuccess
  ) {
    if (
      !observationMatchesExpectedCurrency(
        shopifySuccess.observation,
        expectedCurrency,
      )
    ) {
      return conflict(
        `Shopify currency ${shopifySuccess.observation.currency} does not match expected ${expectedCurrency}`,
      );
    }

    return shopifySuccess;
  }

  if (
    !structuredSuccess ||
    !shopifySuccess
  ) {
    return null;
  }

  const structuredObservation =
    structuredSuccess.observation;

  const shopifyObservation =
    shopifySuccess.observation;

  const structuredCurrency =
    structuredObservation.currency
      .trim()
      .toUpperCase();

  const shopifyCurrency =
    shopifyObservation.currency
      .trim()
      .toUpperCase();

  /*
   * Tam eşleşme:
   * Davranış değişikliğini minimum tutmak
   * için structured sonucunu koruyoruz.
   */
  if (
    structuredCurrency ===
      shopifyCurrency &&
    structuredObservation.priceMinor ===
      shopifyObservation.priceMinor
  ) {
    return structuredSuccess;
  }

  /*
   * Para birimleri farklıysa,
   * DB'de daha önce güvenilir şekilde
   * kaydedilmiş currency hakem olabilir.
   */
  if (
    structuredCurrency !==
    shopifyCurrency
  ) {
    if (
      expectedCurrency
    ) {
      const structuredMatches =
        structuredCurrency ===
        expectedCurrency;

      const shopifyMatches =
        shopifyCurrency ===
        expectedCurrency;

      if (
        structuredMatches &&
        !shopifyMatches
      ) {
        return {
          status:
            'success',

          observation:
            withArbitrationMethod(
              structuredObservation,
              'currency-arbitrated',
            ),
        };
      }

      if (
        shopifyMatches &&
        !structuredMatches
      ) {
        return {
          status:
            'success',

          observation:
            withArbitrationMethod(
              shopifyObservation,
              'currency-arbitrated',
            ),
        };
      }
    }

    return conflict(
      `Structured currency ${structuredCurrency} conflicts with Shopify currency ${shopifyCurrency}`,
    );
  }

  /*
   * Shopify consistency audit'inde
   * sistematik olarak görülen tam 10x
   * structured scaling hatası.
   *
   * Shopify product.js doğrudan minor-unit
   * integer verdiği için bu özel durumda
   * Shopify sonucu tercih edilir.
   */
  if (
    isExactTenfoldDifference(
      structuredObservation.priceMinor,
      shopifyObservation.priceMinor,
    )
  ) {
    return {
      status:
        'success',

      observation:
        withArbitrationMethod(
          shopifyObservation,
          'scale-arbitrated',
        ),
    };
  }

  /*
   * Çok küçük farklar storefront rounding
   * kaynaklı olabilir.
   *
   * Kullanıcının gördüğü structured/display
   * fiyatı tercih edilir.
   */
  if (
    isNearEquivalentPrice(
      structuredObservation.priceMinor,
      shopifyObservation.priceMinor,
    )
  ) {
    return {
      status:
        'success',

      observation:
        withArbitrationMethod(
          structuredObservation,
          'near-equivalent-arbitrated',
        ),
    };
  }

  /*
   * Aynı currency'de anlamlı uyuşmazlık:
   *
   * Shopify product.js, gerçek ürünün
   * unconditional current sell price
   * alanıdır.
   *
   * Structured markup bazı mağazalarda
   * sepette/kupon/member fiyatını veya
   * hatalı theme/schema fiyatını döndürüyor.
   *
   * Bu nedenle aynı currency doğrulandığında
   * Shopify canonical price kabul edilir.
   */
  return {
    status:
      'success',

    observation:
      withArbitrationMethod(
        shopifyObservation,
        'same-currency-arbitrated',
      ),
  };
}

function finalFailure(
  attempts: PriceProviderAttempt[],
  handledByAnyProvider: boolean,
  lastFailure:
    PriceProviderFailure | null,
): PriceResolutionResult {
  const blockedAttempt =
    attempts.find(
      (attempt) =>
        attempt.status ===
          'failure' &&
        attempt.reason ===
          'blocked',
    );

  if (
    blockedAttempt
  ) {
    return {
      status:
        'failed',

      reason:
        'blocked',

      error:
        blockedAttempt.error ??
        'At least one price provider was blocked',

      attempts,
    };
  }

  if (
    !handledByAnyProvider
  ) {
    return {
      status:
        'failed',

      reason:
        'unsupported',

      error:
        'No registered price provider can handle this product',

      attempts,
    };
  }

  const reason:
    PriceProviderFailureReason =
      lastFailure?.reason ??
      'not_found';

  return {
    status:
      'failed',

    reason,

    error:
      lastFailure?.error ??
      'No provider returned a price',

    attempts,
  };
}

// Every observation leaves through here, so a store-level stock restriction also
// covers selected sizes and every provider.
export async function resolveProductPrice(
  context: PriceProviderContext,
): Promise<PriceResolutionResult> {
  if (context.boutiqueId) {
    const baglantidan = await resolveFromConnection(context.boutiqueId, context);
    if (baglantidan) return baglantidan;
  }
  return withStockTrust(context.url, await resolveUnrestricted(context));
}

// Bağlı butiğin sitesine hiç istek atılmaz. Ürün bağlantı verisinde yoksa (henüz
// eşitlenmemiş, mağazadan kalkmış, beden belirsiz) gözlem atlanır: not_found, sitedeki
// kayıp ürün gibi bir gün sonra yeniden denenir; takip durdurulmaz. Bağlantı yoksa ya da
// verisi 12 saatten eskiyse (eşitleme duruyor) null: fiyat her zamanki gibi siteden okunur.
async function resolveFromConnection(
  boutiqueId: string,
  context: PriceProviderContext,
): Promise<PriceResolutionResult | null> {
  const startedAt = Date.now();
  const fiyat = await baglantiFiyatiBul(boutiqueId, context.url);
  const elapsedMs = Date.now() - startedAt;
  if (fiyat === 'kapsam_disi') return null;
  if (!fiyat) {
    const error = 'Product not found in boutique connection data';
    return { status: 'failed', reason: 'not_found', error,
      attempts: [{ provider: 'baglanti', status: 'failure', reason: 'not_found', error, elapsedMs }] };
  }
  return { status: 'success', attempts: [{ provider: 'baglanti', status: 'success', elapsedMs }],
    observation: { priceMinor: fiyat.fiyatMinor, currency: fiyat.currency, observedAt: new Date(), provider: 'baglanti', method: 'api',
      availability: fiyat.stokta === null ? 'unknown' : fiyat.stokta ? 'in_stock' : 'out_of_stock' } };
}

async function resolveUnrestricted(
  context: PriceProviderContext,
): Promise<PriceResolutionResult> {
  // Internal selection identities must never fall back to a generic product price.
  let hasInternalSelection = false;
  try { hasInternalSelection = new URL(context.url).searchParams.has('_butika_variant'); }
  catch { return { status: 'failed', reason: 'unsupported', error: 'Invalid product URL', attempts: [] }; }
  if (hasInternalSelection) {
    const startedAt = Date.now();
    const result = await structuredHtmlPriceProvider.getPrice(context);
    const attempts: PriceProviderAttempt[] = [{ provider: 'structured_html', status: result.status,
      ...(result.status === 'failure' ? { reason: result.reason, error: result.error } : {}), elapsedMs: Date.now() - startedAt }];
    if (result.status === 'failure') return { status: 'failed', reason: result.reason, error: result.error, attempts };
    if (!observationMatchesExpectedCurrency(result.observation, normalizeExpectedCurrency(context))) return { status: 'failed', reason: 'price_conflict', error: 'Selected variant currency changed', attempts };
    return { ...result, attempts };
  }
  const attempts:
    PriceProviderAttempt[] =
      [];

  let lastFailure:
    PriceProviderFailure | null =
      null;

  let handledByAnyProvider =
    false;

  let isShopifyProduct =
    false;

  try {
    isShopifyProduct =
      await shopifyPublicPriceProvider.canHandle(
        context,
      );
  } catch {
    isShopifyProduct =
      false;
  }

  /*
   * Shopify ürünlerinde structured ve
   * Shopify public kaynağını paralel
   * çalıştırıp tek fiyat seçiyoruz.
   */
  if (
    isShopifyProduct
  ) {
    const [
      structuredExecution,
      shopifyExecution,
    ] =
      await Promise.all([
        executeProvider(
          structuredHtmlPriceProvider,
          context,
        ),

        executeProvider(
          shopifyPublicPriceProvider,
          context,
        ),
      ]);

    for (
      const execution of [
        structuredExecution,
        shopifyExecution,
      ]
    ) {
      if (
        execution.handled
      ) {
        handledByAnyProvider =
          true;
      }

      if (
        execution.attempt
      ) {
        attempts.push(
          execution.attempt,
        );
      }

      if (
        execution.result?.status ===
        'failure'
      ) {
        lastFailure =
          execution.result;
      }
    }

    const arbitration =
      arbitrateShopifyResults(
        structuredExecution.result,
        shopifyExecution.result,
        context,
      );

    if (
      arbitration?.status ===
      'success'
    ) {
      return {
        status:
          'success',

        observation:
          arbitration.observation,

        attempts,
      };
    }

    /*
     * Gerçek fiyat conflict'i varsa
     * başka generic provider ile üzerine
     * yazmaya çalışma.
     */
    if (
      arbitration?.status ===
        'failure' &&
      (arbitration.reason === 'price_conflict' || arbitration.stopFallback)
    ) {
      return {
        status:
          'failed',

        reason:
          arbitration.reason,

        error:
          arbitration.error,

        attempts,
      };
    }

    /*
     * Her iki Shopify kaynağı da başarısızsa
     * IKAS -> Woo fallback zincirini dene.
     *
     * Bu aynı zamanda /products/<slug> kullanan
     * fakat gerçekte Shopify olmayan storefront'ları
     * yanlışlıkla dışarıda bırakmamamızı sağlar.
     */
    for (
      const provider of [
        ikasPublicPriceProvider,
        woocommerceStorePriceProvider,
      ]
    ) {
      const execution =
        await executeProvider(
          provider,
          context,
        );

      if (
        execution.handled
      ) {
        handledByAnyProvider =
          true;
      }

      if (
        execution.attempt
      ) {
        attempts.push(
          execution.attempt,
        );
      }

      if (
        execution.result?.status ===
          'success'
      ) {
        return {
          status:
            'success',

          observation:
            execution.result.observation,

          attempts,
        };
      }

      if (
        execution.result?.status ===
          'failure'
      ) {
        lastFailure =
          execution.result;
      }
    }
    return finalFailure(
      attempts,
      handledByAnyProvider,
      lastFailure,
    );
  }

  /*
   * Shopify olmayan ürünlerde mevcut
   * structured -> Woo davranışını koru.
   */
  for (
    const provider of [
      structuredHtmlPriceProvider,
      ikasPublicPriceProvider,
      woocommerceStorePriceProvider,
    ]
  ) {
    const execution =
      await executeProvider(
        provider,
        context,
      );

    if (
      execution.handled
    ) {
      handledByAnyProvider =
        true;
    }

    if (
      execution.attempt
    ) {
      attempts.push(
        execution.attempt,
      );
    }

    if (
      execution.result?.status ===
      'success'
    ) {
      return {
        status:
          'success',

        observation:
          execution.result
            .observation,

        attempts,
      };
    }

    if (
      execution.result?.status ===
      'failure'
    ) {
      lastFailure =
        execution.result;

      /*
       * Sayfanın kendi verisi kendisiyle çelişiyorsa
       * bu bir boşluk değil, ret. Sonraki sağlayıcı
       * bunun üzerine yazmamalı. Sıradan not_found
       * fallback'i eskisi gibi çalışır.
       */
      if (execution.result.stopFallback) {
        return {
          status: 'failed',
          reason: execution.result.reason,
          error: execution.result.error,
          attempts,
        };
      }
    }
  }

  return finalFailure(
    attempts,
    handledByAnyProvider,
    lastFailure,
  );
}

