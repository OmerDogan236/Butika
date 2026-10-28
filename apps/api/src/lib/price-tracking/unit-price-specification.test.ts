import { expect, test } from 'bun:test';
import { readUnitPriceSpecification } from './unit-price-specification';
const now = new Date('2026-09-21T23:59:59Z');
function offer(): Record<string, unknown> {
  return { '@type': 'Offer', availability: 'OutOfStock', priceSpecification: {
    '@type': 'UnitPriceSpecification', price: '356.85', priceCurrency: 'TRY',
    valueAddedTaxIncluded: true, validThrough: '2026-09-21',
  } };
}
test('returns price without changing source or inventing availability', () => {
  const input = offer();
  const before = JSON.stringify(input);
  expect(readUnitPriceSpecification(input, now)).toEqual({ status: 'success',
    priceMinor: 35685, currency: 'TRY', source: 'unit-price-specification' });
  expect(JSON.stringify(input)).toBe(before);
});
test('absent differs from rejected', () => {
  expect(readUnitPriceSpecification({ '@type': 'Offer' }, now)).toEqual({status: 'absent'});
  expect(readUnitPriceSpecification({ '@type': 'Offer', priceSpecification: null }, now).status).toBe('rejected');
});
test.each([
  { price: null }, { price: '0' }, { price: '-1' }, { price: '1e3' }, { price: '1,23' },
  { price: '1.234' }, { price: '90071992547409.92' }, { price: '9'.repeat(100) },
  { priceCurrency: 'USD' }, { priceCurrency: 'TRL' }, { valueAddedTaxIncluded: false },
  { valueAddedTaxIncluded: undefined }, { validThrough: '2026-02-30' },
  { validThrough: '2026-09-20' }, { validThrough: '2027-13-01' },
  { priceType: 'StrikethroughPrice' }, { billingDuration: 12 },
  { referenceQuantity: { value: 100 } }, { eligibleQuantity: { value: 2 } },
])('rejects specification %j', change => {
  const input = offer(); Object.assign(input.priceSpecification as object, change);
  expect(readUnitPriceSpecification(input, now).status).toBe('rejected');
});
test.each([
  { price: null }, { price: '100' }, { lowPrice: 10 }, { highPrice: 100 },
  { '@type': 'AggregateOffer' }, { priceCurrency: 'USD' }, { eligibleQuantity: {value: 2} },
  { validFrom: '2026-09-22' }, { validThrough: '2026-09-20' }, { priceValidUntil: '2026-09-20' },
])('rejects conflicting or conditional offer %j', change => {
  expect(readUnitPriceSpecification(Object.assign(offer(), change), now).status).toBe('rejected');
});
test('rejects multiple specifications and invalid clock', () => {
  const input = offer(); input.priceSpecification = [input.priceSpecification, input.priceSpecification];
  expect(readUnitPriceSpecification(input, now).status).toBe('rejected');
  expect(readUnitPriceSpecification(offer(), new Date('invalid')).status).toBe('rejected');
});
test('exact minor units including the safe integer boundary', () => {
  for (const [price, minor] of [['0.01', 1], ['100.1', 10010], ['90071992547409.91', Number.MAX_SAFE_INTEGER]] as const) {
    const input = offer(); Object.assign(input.priceSpecification as object, { price });
    expect(readUnitPriceSpecification(input, now)).toMatchObject({status: 'success', priceMinor: minor});
  }
});

test.each(['StrikethroughPrice', 'https://schema.org/StrikethroughPrice', 'http://schema.org/StrikethroughPrice'])('ignores only explicitly crossed-out amounts: %s', priceType => {
  const input = offer();
  const current = input.priceSpecification as Record<string, unknown>;
  const old = { ...current, price: '700', priceType };
  input.priceSpecification = [old, current];
  const before = JSON.stringify(input);
  expect(readUnitPriceSpecification(input, now)).toMatchObject({ status: 'success', priceMinor: 35685 });
  expect(JSON.stringify(input)).toBe(before);
  input.priceSpecification = [current, old];
  expect(readUnitPriceSpecification(input, now)).toMatchObject({ status: 'success', priceMinor: 35685 });
});

test.each(['SalePrice', 'ListPrice', '', null, ['StrikethroughPrice'], 'https://other.example/StrikethroughPrice'].map(priceType => ({ priceType })))('does not discard unrecognized price type %j', ({ priceType }) => {
  const input = offer();
  input.priceSpecification = [input.priceSpecification, { ...(input.priceSpecification as object), price: '700', priceType }];
  expect(readUnitPriceSpecification(input, now).status).toBe('rejected');
});

test('rejects two current prices, only old prices and mismatched old currency', () => {
  const input = offer();
  const current = input.priceSpecification as Record<string, unknown>;
  const old = { ...current, price: '700', priceType: 'StrikethroughPrice' };
  for (const specs of [[current, current, old], [old], [current, { ...old, priceCurrency: 'USD' }],
    [current, { ...old, billingDuration: 12 }], [old, { ...current, valueAddedTaxIncluded: false }],
    [old, { ...current, price: '0' }]]) {
    input.priceSpecification = specs;
    expect(readUnitPriceSpecification(input, now).status).toBe('rejected');
  }
});

test('rejects more than 16 specifications and crossed-out entries of another type', () => {
  const input = offer();
  const current = input.priceSpecification as Record<string, unknown>;
  const old = { ...current, price: '700', priceType: 'StrikethroughPrice' };
  input.priceSpecification = [current, ...Array.from({ length: 15 }, () => old)];
  expect(readUnitPriceSpecification(input, now)).toMatchObject({ status: 'success', priceMinor: 35685 });
  for (const specs of [[current, ...Array.from({ length: 16 }, () => old)], [current, { ...old, '@type': 'PriceSpecification' }]]) {
    input.priceSpecification = specs;
    expect(readUnitPriceSpecification(input, now).status).toBe('rejected');
  }
});
