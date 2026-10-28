type Input = { eventId: string; trackedProductId: string; boutiqueId: string; sourceUrl: string; productTitle: string | null; previousPriceMinor: number; newPriceMinor: number; currency: string };
export function priceDropMessage(input: Input): Record<string, unknown> {
  const format = (n: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: input.currency }).format(n / 100);
  return {
    title: 'Fiyat düştü 🎉',
    body: `${input.productTitle?.trim() || 'Takip ettiğin ürün'}: ${format(input.previousPriceMinor)} → ${format(input.newPriceMinor)}`,
    sound: 'default', priority: 'high', channelId: 'price-drops-v2', ttl: 3600,
    data: { type: 'price_drop', eventId: input.eventId, trackedProductId: input.trackedProductId,
      boutiqueId: input.boutiqueId, sourceUrl: input.sourceUrl, productTitle: input.productTitle ?? '' },
  };
}
