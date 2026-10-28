import { expect, test } from 'bun:test';
import { extractProductHtml } from './extract-product-price';
import { type PickedVariant, pickVariants, pickedUrl, reyhanModel, reyhanUrl, ticimaxPage } from './ticimax-secim.fixture';
import { readTicimaxSelection } from './ticimax-selected-variant';

// The two ends are already covered separately: apps/mobile/tests/saved-variant.test.mjs
// runs variantCaptureScript in a VM, and ticimax-selected-variant.test.ts checks the
// reader against an identity it writes itself. Neither carries one identity across the
// boundary, so this file does: every URL below is built from a row the picker actually
// produced and readVariants accepted, never from a hand-written identity.

// Written from the saved model by hand, not from this code's output: eight rows,
// colour option first and size second in productVariantData, Siyah M out of stock.
const expected = [
  { id: 'ticimax:435:1948', title: 'Renk: Siyah / Beden: XS', available: true },
  { id: 'ticimax:435:1949', title: 'Renk: Siyah / Beden: S', available: true },
  { id: 'ticimax:435:1950', title: 'Renk: Siyah / Beden: M', available: false },
  { id: 'ticimax:435:1951', title: 'Renk: Siyah / Beden: L', available: true },
  { id: 'ticimax:435:1952', title: 'Renk: Beyaz / Beden: XS', available: true },
  { id: 'ticimax:435:1953', title: 'Renk: Beyaz / Beden: S', available: true },
  { id: 'ticimax:435:1954', title: 'Renk: Beyaz / Beden: M', available: true },
  { id: 'ticimax:435:1955', title: 'Renk: Beyaz / Beden: L', available: true },
];

/** The picker's own stock flag chooses the rows; the identity comes with them. */
const chosen = (rows: PickedVariant[]) => {
  const stocked = rows.find(row => row.available === true);
  const soldOut = rows.find(row => row.available === false);
  if (!stocked || !soldOut) throw new Error('The fixture must offer one stocked and one sold-out size');
  return { stocked, soldOut };
};

test('the size the picker offers is the size the reader answers for', async () => {
  const rows = await pickVariants();
  expect(rows).toEqual(expected);

  const { stocked, soldOut } = chosen(rows);
  // Pinned expectations: these two rows are the ones the saved model describes.
  expect([stocked.id, soldOut.id]).toEqual(['ticimax:435:1948', 'ticimax:435:1950']);

  const html = ticimaxPage();
  const stockedUrl = await pickedUrl(stocked);
  const soldOutUrl = await pickedUrl(soldOut);

  // The identity travels intact: the API reads back the picker's own product and size.
  expect(readTicimaxSelection(stockedUrl)).toEqual({ sourceUrl: reyhanUrl, productId: '435', variantId: '1948' });
  expect(readTicimaxSelection(soldOutUrl)).toEqual({ sourceUrl: reyhanUrl, productId: '435', variantId: '1950' });

  // Same page, same price, opposite stock: the two sizes are never merged.
  expect(extractProductHtml(html, stockedUrl))
    .toEqual({ status: 'success', priceMinor: 60000, currency: 'TRY', availability: 'in_stock', source: 'ticimax' });
  expect(extractProductHtml(html, soldOutUrl))
    .toEqual({ status: 'success', priceMinor: 60000, currency: 'TRY', availability: 'out_of_stock', source: 'ticimax' });
  // The picker's own availability flag and the reader's answer agree, row by row.
  for (const row of rows) {
    expect({ id: row.id, availability: (extractProductHtml(html, await pickedUrl(row)) as { availability?: string }).availability })
      .toEqual({ id: row.id, availability: row.available ? 'in_stock' : 'out_of_stock' });
  }
  // Without the selection the product itself stays unknown: seven sizes in, one out.
  expect(extractProductHtml(html, reyhanUrl)).toMatchObject({ availability: 'unknown' });
});

test('a size or product the picker never offered is refused, never quietly replaced', async () => {
  const rows = await pickVariants();
  const { stocked } = chosen(rows);
  const html = ticimaxPage();
  const offered = new Set(rows.map(row => row.id));
  const refused = [
    ['size not in this product', 'ticimax:435:9999'],
    ['another product id', 'ticimax:999:1948'],
    ['sizes of two products crossed', 'ticimax:999:9999'],
  ] as const;
  for (const [reason, id] of refused) {
    expect(offered.has(id)).toBe(false);
    expect({ reason, ...extractProductHtml(html, await pickedUrl({ id, title: reason, available: null })) })
      .toEqual({ reason, status: 'not_found', error: 'Selected variant cannot be verified' });
  }
  // An identity that is not a single well-formed selection is refused before any read.
  const doubled = `${await pickedUrl(stocked)}&_butika_variant=ticimax%3A435%3A1950`;
  expect(readTicimaxSelection(doubled)?.variantId).toBe('');
  expect(extractProductHtml(html, doubled)).toMatchObject({ status: 'not_found' });
  // A page of another product cannot answer for this identity.
  expect(extractProductHtml(ticimaxPage(reyhanModel, 'https://reyhanbilginbutik.com/baska-urun-9'), await pickedUrl(stocked)))
    .toMatchObject({ status: 'not_found', error: 'Selected variant cannot be verified' });
});

test('dropping the selection parameter falls back to the product, not to a size', async () => {
  const html = ticimaxPage();
  // A theme that strips internal parameters must not leave a size-shaped answer
  // behind: the product-level read is unknown because the sizes disagree.
  expect(readTicimaxSelection(reyhanUrl)).toBeNull();
  expect(extractProductHtml(html, reyhanUrl))
    .toEqual({ status: 'success', priceMinor: 60000, currency: 'TRY', availability: 'unknown', source: 'ticimax' });
});
