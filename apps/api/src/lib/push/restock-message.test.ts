import { expect, test } from 'bun:test';
import { restockMessage } from './restock-message';

const base = { eventId: 'e1', trackedProductId: 't1', boutiqueId: 'b1', sourceUrl: 'https://shop.example/p?variant=1', currency: 'TRY' };

test('a restock names the saved size and its price', () => {
  const message = restockMessage({ ...base, productTitle: 'Elbise · Beden: M', priceMinor: 129900, previousPriceMinor: 129900 });
  expect(message.title).toBe('Stoğa geldi 🎉');
  expect(message.body).toBe('Elbise · Beden: M tekrar stokta: ₺1.299,00');
  expect(message.data).toEqual({ type: 'back_in_stock', eventId: 'e1', trackedProductId: 't1', boutiqueId: 'b1',
    sourceUrl: 'https://shop.example/p?variant=1', productTitle: 'Elbise · Beden: M' });
});

test('a cheaper restock shows the drop, and a missing title falls back', () => {
  expect(restockMessage({ ...base, productTitle: '  ', priceMinor: 99900, previousPriceMinor: 129900 }).body)
    .toBe('Beğendiğin ürün tekrar stokta: ₺1.299,00 → ₺999,00');
  expect(restockMessage({ ...base, productTitle: null, priceMinor: 99900, previousPriceMinor: null }).body)
    .toBe('Beğendiğin ürün tekrar stokta: ₺999,00');
});
