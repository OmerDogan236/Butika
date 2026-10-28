import type { Availability } from './availability';
import { readStockMicrodata } from './microdata-stock';
import { jsonLdBlocks, parseJsonLd } from './json-ld-blocks';
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
function readIkasPage(html: string): {product:Record<string,unknown>;config:Record<string,unknown> | null} | null {
  const scripts = [...html.matchAll(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const modern = [...html.matchAll(/<script[^>]+id=["']__IKAS_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)];
  if (scripts.length + modern.length !== 1) return null;
  try {
    if (modern.length) {
      const assigned = /^\s*window\.__IKAS_DATA__\s*=\s*({[\s\S]*})\s*;?\s*$/.exec(modern[0]![1]!);
      if (!assigned) return null;
      const data = JSON.parse(assigned[1]!);
      const product = data.pageSpecificData;
      return data.pageType === 'PRODUCT' && obj(product) && uuid(product.id) && Array.isArray(product.variants)
        ? {product,config:obj(data.storefrontConfig)?data.storefrontConfig:null} : null;
    }
    const data = JSON.parse(scripts[0]![1]!);
    const product = data.props?.pageProps?.pageSpecificData;
    return obj(product) && uuid(product.id) && Array.isArray(product.variants) ? {product,config:obj(data.props?.pageProps?.configJson)?data.props.pageProps.configJson:null} : null;
  } catch { return null; }
}
export function readIkasProduct(html: string) { return readIkasPage(html)?.product ?? null; }

function hasOnlyFreeOptionalText(product: Record<string, unknown>): boolean {
  if (!product.productOptionSetId) return true;
  const set=product.productOptionSet;
  if (!uuid(product.productOptionSetId) || !obj(set) || set.id!==product.productOptionSetId || set.deleted!==false || !Array.isArray(set.options) || !set.options.length) return false;
  const ids=new Set<unknown>();
  return set.options.every(option=>{
    if (!obj(option) || !uuid(option.id) || ids.has(option.id)) return false;
    ids.add(option.id);
    // Text notes such as optional height/weight do not change this SKU's price or stock.
    // Required personalization, paid extras and selectable options still need their own model.
    return option.productOptionSetId===set.id && option.deleted===false && option.isOptional===true && option.type==='TEXT' &&
      option.price===null && option.priceType===null && option.otherPrices===null && option.selectSettings===null &&
      option.requiredOptionId===null && option.requiredOptionValueIds===null;
  });
}

export function readIkasSelection(rawUrl: string) {
  const url = new URL(rawUrl), values = url.searchParams.getAll('_butika_variant');
  if (!values[0]?.startsWith('ikas:')) return null;
  const parts = values[0].split(':');
  const valid = values.length === 1 && parts.length === 3 && uuid(parts[1]) && uuid(parts[2]);
  url.searchParams.delete('_butika_variant');
  return { sourceUrl: url.toString(), productId: valid ? parts[1]! : '', variantId: valid ? parts[2]! : '' };
}

export function ikasVariantObservation(html: string, url: string, productId: string, variantId: string) {
  const page = readIkasPage(html);
  // Only a saved, exact product identity can authorize a renamed slug. A
  // product-level archive URL does not carry that identity and stays strict.
  const sameSelectedProduct = uuid(productId) && page?.product.id === productId;
  return observeVariant(page, readOffers(html), ikasOfferUrl(html, url, sameSelectedProduct), productId, variantId);
}

// Migrated storefronts may still serve /products/slug while their exact offers
// use /slug. Require a single same-origin canonical proving that specific alias.
function ikasOfferUrl(html: string, rawUrl: string, sameSelectedProduct = false): string {
  const requested = new URL(rawUrl);
  if (!/^\/products\/[^/]+\/?$/.test(requested.pathname)) return rawUrl;
  const canonicals = readStockMicrodata(html).canonicals;
  const [canonicalHref] = canonicals;
  if (canonicals.length !== 1 || canonicalHref === undefined) return rawUrl;
  try {
    const canonical = new URL(canonicalHref, requested);
    if (canonical.origin !== requested.origin || canonical.username || canonical.password || canonical.search || canonical.hash) return rawUrl;
    const sameSlug = canonical.pathname.replace(/\/$/, '') === requested.pathname.replace(/^\/products/, '').replace(/\/$/, '');
    if (!sameSlug && !sameSelectedProduct) return rawUrl;
    requested.pathname = canonical.pathname;
    return requested.toString();
  } catch { return rawUrl; }
}

function observeVariant(page: ReturnType<typeof readIkasPage>, offers: Record<string, unknown>[], url: string, productId: string, variantId: string, allowCommonPrice = true): {priceMinor:number;currency:string;availability:Availability} | null {
  const product = page?.product;
  if (!product || product.id !== productId || product.deleted !== false || !hasOnlyFreeOptionalText(product)) return null;
  const config = page?.config;
  if (!config || !uuid(config.salesChannelId) || !Array.isArray(config.stockLocationIds) || !config.stockLocationIds.length || config.stockLocationIds.some(id=>!uuid(id))) return null;
  const onlineLocations = new Set(config.stockLocationIds);
  if (!Array.isArray(product.salesChannels)) return null;
  const channels = product.salesChannels.filter(c=>obj(c)&&c.id===config.salesChannelId);
  if (channels.length !== 1 || !obj(channels[0]) || channels[0].status !== 'VISIBLE' || channels[0].productVolumeDiscountId || channels[0].quantitySettings) return null;
  const minimum = typeof channels[0].minQuantityPerCart === 'number' ? Math.max(1,channels[0].minQuantityPerCart) : 1;
  if (!obj(product.metaData) || product.metaData.slug !== decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? '')) return null;
  const variants = product.variants as unknown[];
  if (!variants.length || variants.some(v => !obj(v) || !uuid(v.id) || v.productId !== product.id) || new Set(variants.map(v => (v as any).id)).size !== variants.length) return null;
  const variant = variants.find(v => obj(v) && v.id === variantId);
  if (!obj(variant) || variant.deleted !== false || typeof variant.isActive !== 'boolean' || !Array.isArray(variant.stocks) || !Array.isArray(variant.prices)) return null;
  const locations = new Set<string>();
  let quantity = 0;
  for (const stock of variant.stocks) {
    if (!obj(stock) || !uuid(stock.stockLocationId) || locations.has(stock.stockLocationId) || typeof stock.stockCount !== 'number' || !Number.isFinite(stock.stockCount) || stock.stockCount < 0) return null;
    locations.add(stock.stockLocationId);
    if (onlineLocations.has(stock.stockLocationId)) quantity += stock.stockCount;
  }
  const prices = variant.prices.filter(p => obj(p) && !p.priceListId);
  if (prices.length !== 1 || !obj(prices[0])) return null;
  const price = prices[0];
  if (price.campaignPrice !== null && price.campaignPrice !== undefined && price.campaignPrice !== 0) return null;
  const major = typeof price.discountPrice === 'number' && price.discountPrice > 0 ? price.discountPrice : price.sellPrice;
  const currency = String(price.currencyCode || price.currency).toUpperCase();
  if (typeof major !== 'number' || !Number.isFinite(major) || major <= 0 || !/^[A-Z]{3}$/.test(currency)) return null;
  if (new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits !== 2) return null;
  const priceMinor = Math.round(major * 100);
  if (!Number.isSafeInteger(priceMinor) || Math.abs(priceMinor - major * 100) > .000001) return null;
  // Confirm price against the rendered Offer for this exact UUID, including discounted prices.
  const expected = new URL(url);
  const valuesKey=(values:unknown)=>Array.isArray(values)&&values.length&&values.every(v=>obj(v)&&uuid(v.id)&&uuid(v.variantTypeId))
    ? values.map(v=>`${v.variantTypeId}:${v.id}`).sort().join('|'):null;
  const renderedValues=valuesKey(product.selectedVariantValues);
  const renderedVariant=!!renderedValues&&renderedValues===valuesKey(variant.variantValues)&&
    variants.filter(v=>obj(v)&&valuesKey(v.variantValues)===renderedValues).length===1;
  const provenOffers = offers.filter(offer => {
    if (typeof offer.url !== 'string') return false;
    try {
      const target = new URL(offer.url);
      const offeredId = target.searchParams.get('vid') ?? target.search.match(/[?&]vid=([0-9a-f-]{36})(?:&|$)/i)?.[1];
      const path=(value:string)=>(currency==='TRY'?value.replace(/^\/tr\//,'/'):value).replace(/\/$/,'');
      return target.hostname === expected.hostname && path(target.pathname) === path(expected.pathname) && (offeredId === variantId || (!offeredId && (variants.length===1||renderedVariant) && offers.length===1)) &&
        String(offer.priceCurrency).toUpperCase() === currency && Number.isFinite(Number(offer.price)) && Math.round(Number(offer.price) * 100) === priceMinor;
    } catch { return false; }
  });
  const sharedPrice = !provenOffers.length && allowCommonPrice && commonVariantPrice(page, offers, url, productId, priceMinor, currency);
  if (!provenOffers.length && !sharedPrice) return null;
  // A default variant's Offer can corroborate a uniform price, never another SKU's stock.
  const explicitSoldOut=provenOffers.length>0 && provenOffers.every(o=>typeof o.availability==='string'&&/^(?:https?:\/\/schema\.org\/)?OutOfStock$/i.test(o.availability));
  const completeStock = [...onlineLocations].every(id=>locations.has(id as string));
  if (sharedPrice && !completeStock) return {priceMinor,currency,availability:'unknown'};
  return {priceMinor,currency,availability: !variant.isActive || (quantity === 0 && (completeStock || (variant.sellIfOutOfStock===false && explicitSoldOut))) ? 'out_of_stock' : quantity >= minimum ? 'in_stock' : 'unknown'};
}

function commonVariantPrice(page: ReturnType<typeof readIkasPage>, offers: Record<string, unknown>[], url: string, productId: string, priceMinor: number, currency: string): boolean {
  const product=page?.product;
  if (!product || !Array.isArray(product.variants) || product.variants.length<2 || offers.length!==1) return false;
  // No customer price lists, campaigns, missing entries or differing variant prices.
  if (!product.variants.every(v=>{
    if (!obj(v) || v.deleted!==false || typeof v.isActive!=='boolean' || !Array.isArray(v.prices) || v.prices.length!==1 || !obj(v.prices[0])) return false;
    const p=v.prices[0];
    if (p.priceListId!=null || (p.campaignPrice!=null && p.campaignPrice!==0)) return false;
    const major=typeof p.discountPrice==='number' && p.discountPrice>0?p.discountPrice:p.sellPrice;
    return typeof major==='number' && Number.isFinite(major) && major>0 &&
      Math.abs(major*100-priceMinor)<.000001 && String(p.currencyCode||p.currency).toUpperCase()===currency;
  })) return false;
  const offer=offers[0];
  if (!offer || typeof offer.url!=='string') return false;
  try {
    const target=new URL(offer.url);
    const expected=new URL(url);
    if (target.origin!==expected.origin || target.username || target.password || target.hash || target.searchParams.getAll('vid').length>1) return false;
    // Only one model variant may own this Offer. Disable this fallback while
    // proving the anchor, preventing circular or self-justifying evidence.
    const anchors=product.variants.filter(v=>obj(v) && observeVariant(page,offers,url,productId,String(v.id),false)!==null);
    return anchors.length===1;
  } catch { return false; }
}

export function ikasProductAvailability(html: string, url: string, priceMinor: number, currency: string): Availability {
  const page = readIkasPage(html), product = page?.product;
  if (!product) return 'unknown';
  const offers = readOffers(html);
  const offerUrl = ikasOfferUrl(html, url);
  const results = (product.variants as any[]).map(v => observeVariant(page,offers,offerUrl,String(product.id),String(v?.id)));
  if (!results.length || results.some(r => !r || r.priceMinor !== priceMinor || r.currency !== currency)) return 'unknown';
  return results.every(r => r?.availability === 'in_stock') ? 'in_stock' : results.every(r => r?.availability === 'out_of_stock') ? 'out_of_stock' : 'unknown';
}

function readOffers(html: string): Record<string, unknown>[] {
  const offers: Record<string, unknown>[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!obj(node)) return;
    if (node['@type'] === 'Product') {
      for (const offer of Array.isArray(node.offers) ? node.offers : [node.offers]) {
        if (obj(offer)) offers.push(offer);
      }
    }
    if (node['@graph']) walk(node['@graph']);
  };
  // Unreadable JSON-LD is not a usable offer.
  for (const block of jsonLdBlocks(html)) walk(parseJsonLd(block));
  return offers;
}
