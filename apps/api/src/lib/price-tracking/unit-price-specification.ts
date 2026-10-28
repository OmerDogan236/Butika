/** Narrow fallback for an identity-validated Offer. Does not prove product/variant identity or stock. */
export type UnitPriceResult =
  | { status: 'absent' }
  | { status: 'rejected'; reason: string }
  | { status: 'success'; priceMinor: number; currency: 'TRY'; source: 'unit-price-specification' };

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const rejected = (reason: string): UnitPriceResult => ({ status: 'rejected', reason });
const allowed = new Set(['@type', 'price', 'priceCurrency', 'valueAddedTaxIncluded', 'validThrough']);

function dateOnly(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function readUnitPriceSpecification(offer: unknown, observedAt: Date): UnitPriceResult {
  if (!object(offer)) return rejected('invalid_offer');
  if (!('priceSpecification' in offer)) return { status: 'absent' };
  if (offer['@type'] !== 'Offer') return rejected('unsupported_offer_type');
  if (['price', 'lowPrice', 'highPrice'].some(key => key in offer)) return rejected('direct_price_present');
  if (['eligibleQuantity', 'eligibleCustomerType', 'eligibleTransactionVolume', 'businessFunction'].some(key => key in offer)) {
    return rejected('conditional_offer');
  }
  const specs = Array.isArray(offer.priceSpecification) ? offer.priceSpecification : [offer.priceSpecification];
  if (!specs.length || specs.length > 16 || specs.some(s => !object(s))) return rejected('ambiguous_specification');
  const current: Record<string, unknown>[] = [];
  for (const entry of specs) {
    if (!object(entry) || entry['@type'] !== 'UnitPriceSpecification') return rejected('unsupported_specification');
    if (!('priceType' in entry)) { current.push(entry); continue; }
    // An explicitly crossed-out value is never a current price or a baseline.
    if (!['StrikethroughPrice', 'https://schema.org/StrikethroughPrice', 'http://schema.org/StrikethroughPrice'].includes(String(entry.priceType)) ||
        typeof entry.priceType !== 'string' || Object.keys(entry).some(key => key !== 'priceType' && !allowed.has(key))) {
      return rejected('unsupported_specification');
    }
    if (entry.priceCurrency !== 'TRY') return rejected('unsupported_or_conflicting_currency');
  }
  if (current.length !== 1) return rejected('ambiguous_specification');
  const spec = current[0]!;
  if (spec['@type'] !== 'UnitPriceSpecification' || Object.keys(spec).some(key => !allowed.has(key))) {
    return rejected('unsupported_specification');
  }
  if (spec.valueAddedTaxIncluded !== true) return rejected('tax_inclusive_price_unproven');
  // Deliberately narrow: no currency alias or conversion in this fallback.
  if (spec.priceCurrency !== 'TRY' || ('priceCurrency' in offer && offer.priceCurrency !== 'TRY')) {
    return rejected('unsupported_or_conflicting_currency');
  }
  if (!Number.isFinite(observedAt.getTime())) return rejected('invalid_observation_date');
  const today = observedAt.toISOString().slice(0, 10);
  for (const [key, lowerBound] of [['validFrom', true], ['validThrough', false], ['priceValidUntil', false]] as const) {
    if (!(key in offer)) continue;
    const date = dateOnly(offer[key]);
    if (!date || (lowerBound ? date > today : date < today)) return rejected('offer_outside_validity');
  }
  if ('validThrough' in spec) {
    const until = dateOnly(spec.validThrough);
    if (!until || until < today) return rejected('specification_outside_validity');
  }
  if (typeof spec.price !== 'string' && typeof spec.price !== 'number') return rejected('invalid_price');
  const raw = String(spec.price);
  if (raw.length > 20 || !/^\d+(?:\.\d{1,2})?$/.test(raw)) return rejected('invalid_price');
  const [whole, fraction = ''] = raw.split('.');
  const minor = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) return rejected('invalid_price');
  return { status: 'success', priceMinor: Number(minor), currency: 'TRY', source: 'unit-price-specification' };
}
