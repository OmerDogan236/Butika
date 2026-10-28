type Input = { eventId: string; trackedProductId: string; boutiqueId: string; sourceUrl: string; productTitle: string | null;
  priceMinor: number; previousPriceMinor: number | null; currency: string };
export function restockMessage(input: Input): Record<string, unknown> {
  const format = (n: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: input.currency }).format(n / 100);
  const price = input.previousPriceMinor !== null && input.previousPriceMinor > input.priceMinor
    ? `${format(input.previousPriceMinor)} → ${format(input.priceMinor)}` : format(input.priceMinor);
  return {
    title: 'Stoğa geldi 🎉',
    body: `${input.productTitle?.trim() || 'Beğendiğin ürün'} tekrar stokta: ${price}`,
    sound: 'default', priority: 'high', channelId: 'price-drops-v2', ttl: 3600,
    data: { type: 'back_in_stock', eventId: input.eventId, trackedProductId: input.trackedProductId,
      boutiqueId: input.boutiqueId, sourceUrl: input.sourceUrl, productTitle: input.productTitle ?? '' },
  };
}
