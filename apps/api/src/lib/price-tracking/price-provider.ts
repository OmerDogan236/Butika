export type PriceProviderName =
  | 'structured_html'
  | 'shopify'
  | 'woocommerce'
  | 'ikas'
  | 'magento'
  | 'affiliate_feed'
  | 'managed_web'
  | 'client_observation'
  | 'baglanti'
  | 'custom';

export type PriceProviderFailureReason =
  | 'blocked'
  | 'not_found'
  | 'http_error'
  | 'timeout'
  | 'unsupported'
  | 'price_conflict'
  | 'provider_error';

export type PriceProviderContext = {
  url: string;
  domain?: string | null;
  title?: string | null;
  expectedCurrency?: string | null;
  trackedProductId?: string;
  /** Butiğin mağaza bağlantısı açıksa fiyat siteden değil bağlantıdan okunur. */
  boutiqueId?: string | null;
};

export type PriceObservation = {
  availability?: import('./availability').Availability;
  priceMinor: number;
  currency: string;
  observedAt: Date;
  provider: PriceProviderName;

  /**
   * Provider içindeki fiyat kaynağı.
   * Örn: json-ld, meta, html, api, feed.
   */
  method?: string;
};

export type PriceProviderSuccess = {
  status: 'success';
  observation: PriceObservation;
};

export type PriceProviderFailure = {
  status: 'failure';
  reason: PriceProviderFailureReason;
  error: string;
  /** Confirmed identity/variant ambiguity must not be bypassed by a generic source. */
  stopFallback?: boolean;
  /**
   * Shopify's product and cart endpoints both answered HTTP 404, so the host is
   * not a Shopify Online Store. Supporting evidence only, never stock evidence.
   */
  storefrontMissing?: boolean;
};

export type PriceProviderResult =
  | PriceProviderSuccess
  | PriceProviderFailure;

export interface PriceProvider {
  readonly name: PriceProviderName;

  canHandle(
    context: PriceProviderContext,
  ): boolean | Promise<boolean>;

  getPrice(
    context: PriceProviderContext,
  ): Promise<PriceProviderResult>;
}

export type PriceProviderAttempt = {
  provider: PriceProviderName;
  status: 'success' | 'failure';
  reason?: PriceProviderFailureReason;
  error?: string;
  elapsedMs: number;
};

export type PriceResolutionSuccess = {
  status: 'success';
  observation: PriceObservation;
  attempts: PriceProviderAttempt[];
};

export type PriceResolutionFailure = {
  status: 'failed';
  reason: PriceProviderFailureReason;
  error: string;
  attempts: PriceProviderAttempt[];
};

export type PriceResolutionResult =
  | PriceResolutionSuccess
  | PriceResolutionFailure;
