// IKAS page data and head, made up on an .test host in the shape measured on vayustore.com on
// 2026-09-27 (claude-yamalar/2026-09-27-duzeltmeler/kanit/ikas-vayu-spa-olcumu-2026-09-27.md and
// claude-yamalar/2026-09-27-dar-kapsam/ikas-spa/vayu-bas-olcumu-2026-09-27.md).
export const PRODUCT = '11111111-2222-4333-8444-555555555555';
export const OTHER = '99999999-2222-4333-8444-555555555555';
export const LOCATION = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
export const HOST = 'https://ikas.test';
export const SLUG = 'afrodit-sporcu-sutyeni';
export const variant = (n, colour, size, stock = 10, extra = {}) => ({ id: `0000000${n}-0000-4000-8000-00000000000${n}`, productId: PRODUCT, deleted: false, isActive: true,
  variantValues: [{ name: colour }, { name: size }], stocks: [{ stockLocationId: LOCATION, stockCount: stock }], ...extra });
export const VARIANTS = [variant(1, 'Mor', 'XS/S'), variant(2, 'Mor', 'M', 0), variant(3, 'Siyah', 'XS/S', 3)];
// Next's page data for a product: page /[slug], its slug in the query and in metaData.
export const productData = ({ id = PRODUCT, slug = SLUG, variants = VARIANTS, pageType = 'PRODUCT', config = { stockLocationIds: [LOCATION] }, querySlug = slug } = {}) => ({
  page: '/[slug]', query: querySlug === null ? {} : { slug: querySlug },
  props: { pageProps: { pageType, pageSpecificData: { id, metaData: { slug }, variantTypes: [{ id: 't1' }, { id: 't2' }], variants }, ...(config ? { configJson: config } : {}) } },
});
export const homeData = () => ({ page: '/', query: {}, props: { pageProps: { pageType: 'INDEX', pageSpecificData: null, configJson: { stockLocationIds: [LOCATION] } } } });
export const offered = (rows = VARIANTS, available = rows.map(r => r.stocks?.[0]?.stockCount > 0)) =>
  rows.map((r, i) => ({ id: `ikas:${PRODUCT}:${r.id}`, title: r.variantValues.map(v => v.name).join(' / '), available: available[i] }));

// The head the store writes for a page: its canonical and, on a product page, one Product whose
// Offer is at the product's address (with the chosen option in the query, as on VAYU).
export const head = ({ path = `/${SLUG}`, product = true, canonical = path } = {}) => [
  canonical === null ? '' : `<link rel="canonical" href="${HOST}${canonical}">`,
  `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Website', url: HOST })}</script>`,
  `<script type="application/ld+json">${JSON.stringify(product
    ? { '@context': 'https://schema.org/', '@type': 'Product', name: 'X', offers: { '@type': 'Offer', url: `${HOST}${path}?Renk=Mor`, price: '1119.96', priceCurrency: 'TRY' } }
    : { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'X' })}</script>`,
].join('');
