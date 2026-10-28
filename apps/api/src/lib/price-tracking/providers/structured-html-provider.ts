import { extractProductPrice } from '../extract-product-price';
import type {
  PriceProvider,
  PriceProviderContext,
  PriceProviderResult,
} from '../price-provider';

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

export const structuredHtmlPriceProvider: PriceProvider = {
  name: 'structured_html',

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
    const result =
      await extractProductPrice(
        context.url,
      );

    if (
      result.status === 'success'
    ) {
      return {
        status: 'success',
        observation: {
          availability: result.availability ?? 'unknown',
          priceMinor:
            result.priceMinor,
          currency:
            result.currency,
          observedAt:
            new Date(),
          provider:
            'structured_html',
          method:
            result.source,
        },
      };
    }

    // A page whose own data contradicts itself is a refusal, not a gap: another
    // source answering over it would publish the very amount this page denies.
    // Every other failure still lets the next provider try.
    return {
      status: 'failure',
      reason: result.status,
      error: result.error,
      ...(result.contradiction ? { stopFallback: true } : {}),
    };
  },
};
