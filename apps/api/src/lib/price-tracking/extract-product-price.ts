import {readWooSelection,wooSelectedObservation} from './woo-selected-product';
import {readModanisaSelection,modanisaSlug,modanisaObservation} from './modanisa-product';
import {scopedMicrodataPrice} from './scoped-microdata-price';
import { readBrandroomSelection, brandroomProduct, brandroomAvailability } from './brandroom-stock';
import { readAymarkaSelection, aymarkaPagePrice, aymarkaProduct, aymarkaAvailability } from './aymarka-stock';
import { readLutvelizadeSelection, lutvelizadeSelectedSize } from './lutvelizade-size';
import { retailerFetch } from './retailer-http';
import { extractTicimaxSelectedVariant, readTicimaxSelection } from './ticimax-selected-variant';
import { ikasVariantObservation, readIkasSelection, readIkasProduct } from './ikas-stock';
import { farktorAvailability } from './farktor-stock';
import { akinonAvailability } from './akinon-stock';
import { readAkinonNextProduct } from './akinon-next-product';
import { trackingCurrency } from './currency';
import { extractSchemaSelectedOffer, readSchemaSelection } from './schema-selected-offer';
import { readSchemaProductOffer, type SchemaProductOffer } from './schema-product-offer';
import { jsonLdBlocks, parseJsonLd } from './json-ld-blocks';
import { isVerifiedDilvinLira } from './dilvin-lira';
import { readMiorreProduct } from './miorre-product';
import { wooStatesItsOwnSizes, wooVariationVerdict } from './woo-variation-stock';
import { newinshopChoice, newinshopWithholdsStock } from './newinshop-size-stock';
import { isJimmykeyAddress, isJimmykeySelection, jimmykeyChoice, jimmykeySelectedSize, jimmykeyStock, readJimmykeySelection } from './jimmykey-size-stock';
import { bslChoice, bslStock, isBslAddress, isBslSelection } from './bsl-size-stock';
type ExtractedPrice = {
  status: 'success';
  availability?: import('./availability').Availability;
  priceMinor: number;
  currency: string;
  source: 'json-ld' | 'meta' | 'ticimax' | 'ikas' | 'microdata' | 'html' | 'aymarka' | 'brandroom' | 'modanisa' | 'woo-variant' | 'unit-price-specification' | 'akinon-next' | 'miorre-html' | 'lutvelizade' | 'jimmykey';
};

type FailedExtraction = {
  status: 'blocked' | 'not_found' | 'http_error' | 'timeout';
  error: string;
  // The page's own data contradicts itself, so no other source may answer for
  // this address. Read as a flag, never from the message.
  contradiction?: true;
};

export type ProductPriceExtraction =
  | ExtractedPrice
  | FailedExtraction;

import { structuredAvailability } from './availability';
const REQUEST_TIMEOUT_MS = 12_000;


export async function extractProductPrice(
  url: string,
): Promise<ProductPriceExtraction> {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    // A chosen jimmykey size is read only as jimmykey:<ProductID>:<ColorID>:<SizeID>
    // (jimmykey-size-stock.ts); for any other selection on that store nothing is fetched,
    // so no selection path below can answer in its place.
    if (isJimmykeySelection(url)) return { status: 'not_found', error: 'A jimmykey size cannot be verified' };
    if (isBslSelection(url)) return { status: 'not_found', error: 'A BSL size cannot be verified' };
    const ikasSelection = readIkasSelection(url);
    const selection = readLutvelizadeSelection(url) ?? readJimmykeySelection(url) ?? readWooSelection(url) ?? readModanisaSelection(url) ?? readBrandroomSelection(url) ?? readAymarkaSelection(url) ?? readSchemaSelection(url) ?? ikasSelection ?? readTicimaxSelection(url);
    if (selection && !selection.variantId) return { status: 'not_found', error: 'Invalid selected variant identity' };
    const response = await retailerFetch(selection?.sourceUrl ?? url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'tr-TR,tr;q=0.9,en;q=0.7',
        'user-agent':
          'Mozilla/5.0 (compatible; ButikaPriceTracker/1.0)',
      },
    });

    let html = await response.text();

    if (!response.ok) {
      return {
        status: 'http_error',
        error: `HTTP ${response.status}`,
      };
    }

    if(readWooSelection(url)){const woo=await wooSelectedObservation(url,controller.signal);return woo?{status:'success',...woo,source:'woo-variant'}:{status:'not_found',error:'Selected Woo product cannot be verified'};}
    const modanisa=await modanisaObservation(url,controller.signal);
    if(modanisa)return {status:'success',priceMinor:modanisa.priceMinor,currency:modanisa.currency,availability:modanisa.availability,source:'modanisa'};
    if(modanisaSlug(url))return {status:'not_found',error:'Turkish product and selected size could not be verified'};
    let extracted=extractProductHtml(html,url);
    // Some Angular storefronts serve a CSR shell to browser user agents and
    // rendered public product data to crawlers. Identify our crawler honestly.
    // A challenge, HTTP error or actual product page never triggers this retry.
    if(extracted.status==='not_found'&&/<(spa-root|app-root)\b[^>]*>\s*<\/\1>/i.test(html)){
      const rendered=await retailerFetch(selection?.sourceUrl??url,{
        redirect:'follow',signal:controller.signal,
        headers:{accept:'text/html','accept-language':'tr-TR,tr;q=0.9,en;q=0.7','user-agent':'ButikaPriceTracker/1.0'},
      });
      if(!rendered.ok){await rendered.body?.cancel();return {status:'http_error',error:`HTTP ${rendered.status}`};}
      html=await rendered.text();extracted=extractProductHtml(html,url);
    }
    if(extracted.status==='success' && extracted.source==='brandroom') extracted.availability=await brandroomAvailability(html,url,controller.signal);
    if(extracted.status==='success' && aymarkaProduct(html,url,extracted.priceMinor,extracted.currency)) {
      extracted.availability=await aymarkaAvailability(html,url,extracted.priceMinor,extracted.currency,controller.signal);
    }
    // A price-only source stays price-only: neither the Akinon streaming record nor
    // the Miorre theme markup proves stock, so neither is carried into the enrichment
    // below. A product whose own variations payload states mixed per-size stock is
    // left unknown too: the store's product-level answer is the very claim that was
    // set aside. So is a newinshop product that asks for a size or whose form is not
    // tied to it (newinshop-size-stock.ts), and every jimmykey or BSL page, whose stock its
    // own size list decides (jimmykey-size-stock.ts, bsl-size-stock.ts). Every other source
    // keeps the behaviour it had.
    if(extracted.status==='success'&&extracted.availability==='unknown'&&extracted.source!=='akinon-next'&&extracted.source!=='miorre-html'&&
      !wooStatesItsOwnSizes(html,url)&&!newinshopWithholdsStock(html,url)&&!isJimmykeyAddress(url)&&!isBslAddress(url)&&!selection&&!new URL(url).searchParams.has('variant')) {
      extracted.availability=await farktorAvailability(html,url,extracted.priceMinor,extracted.currency);
      if(extracted.availability==='unknown')extracted.availability=await akinonAvailability(html,url,extracted.priceMinor,extracted.currency);
      if(extracted.availability==='unknown'&&/<body[^>]*class=["'][^"']*\bwoocommerce\b/i.test(html)){
        const {woocommerceStorePriceProvider}=await import('./providers/woocommerce-store-provider');
        const result=await woocommerceStorePriceProvider.getPrice({url});
        if(result.status==='success'&&result.observation.priceMinor===extracted.priceMinor&&result.observation.currency===extracted.currency)
          extracted.availability=result.observation.availability??'unknown';
      }
    }
    return extracted;
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'AbortError'
    ) {
      return {
        status: 'timeout',
        error: `Request timed out after ${REQUEST_TIMEOUT_MS}ms`,
      };
    }

    return {
      status: 'http_error',
      error:
        error instanceof Error
          ? error.message
          : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function extractProductHtml(html: string, url: string): ProductPriceExtraction {
  return bslSizeStock(html, url, jimmykeySizeStock(html, url, newinshopSizeStock(html, url, unselectedWooStock(html, url, readProductHtml(html, url)))));
}

// newinshop.co (newinshop-size-stock.ts): the page states stock for the product, never
// for a size. Where the product asks for a size, or its form cannot be tied to it, the
// price stays and the stock is unknown, in stock or out of stock alike. A size that
// changes the price leaves no product price, and a chosen size is never read.
function newinshopSizeStock(html: string, url: string, result: ProductPriceExtraction): ProductPriceExtraction {
  if (result.status !== 'success') return result;
  const choice = newinshopChoice(html, url);
  switch (choice.kind) {
    case 'other_host': case 'no_choice': return result;
    case 'selection_address': return { status: 'not_found', error: 'A newinshop size cannot be verified' };
    case 'price_differs': return { status: 'not_found', contradiction: true, error: 'newinshop sizes change the product price' };
    default: return { ...result, availability: 'unknown' };
  }
}

// jimmykey.com (jimmykey-size-stock.ts): the page states stock for the product and for
// each size. The product-level claim stands only where every size is stated and all of
// them agree with it; otherwise the price stays and the stock is unknown. A page whose
// identity or add-to-bag amount contradicts the address is not read, and no other source
// may answer for it. A chosen size is answered by its own reading above
// (jimmykey:<ProductID>:<ColorID>:<SizeID>) and passes through; any other selection is
// never read.
function jimmykeySizeStock(html: string, url: string, result: ProductPriceExtraction): ProductPriceExtraction {
  if (!isJimmykeyAddress(url)) return result;
  const choice = jimmykeyChoice(html, url);
  switch (choice.kind) {
    case 'other_host': return result;
    case 'selection_address':
      return readJimmykeySelection(url)?.variantId ? result : { status: 'not_found', error: 'A jimmykey size cannot be verified' };
    case 'conflict': return { status: 'not_found', contradiction: true, error: `jimmykey page does not match the requested product: ${choice.reason}` };
    case 'unbound': return result.status === 'success' ? { ...result, availability: 'unknown' } : result;
    default:
      if (result.status !== 'success') return result;
      if (choice.amountMinor !== result.priceMinor) {
        return { status: 'not_found', contradiction: true, error: 'jimmykey add-to-bag amount differs from the product price' };
      }
      return { ...result, availability: jimmykeyStock(choice.sizes, result.availability ?? 'unknown') };
  }
}

// www.bsl.com.tr (bsl-size-stock.ts): the same rule as jimmykey.com on BSL's own template.
// The product-level claim stands only where every size is stated and all of them agree
// with it; otherwise the price stays and the stock is unknown. A page whose identity or
// add-to-bag amount contradicts the address is not read, and no other source may answer
// for it. A chosen size is never read.
function bslSizeStock(html: string, url: string, result: ProductPriceExtraction): ProductPriceExtraction {
  if (!isBslAddress(url)) return result;
  const choice = bslChoice(html, url);
  switch (choice.kind) {
    case 'other_host': return result;
    case 'selection_address': return { status: 'not_found', error: 'A BSL size cannot be verified' };
    case 'conflict': return { status: 'not_found', contradiction: true, error: `BSL page does not match the requested product: ${choice.reason}` };
    case 'unbound': return result.status === 'success' ? { ...result, availability: 'unknown' } : result;
    default:
      if (result.status !== 'success') return result;
      if (choice.amountMinor !== result.priceMinor) {
        return { status: 'not_found', contradiction: true, error: 'BSL add-to-bag amount differs from the product price' };
      }
      return { ...result, availability: bslStock(choice.sizes, result.availability ?? 'unknown') };
  }
}

// An address with no chosen size is answered with the page's product-level claim.
// Where the product's own variations payload contradicts that claim — in the
// amount or in the stock, and whichever way round — the claim is not this
// product's answer. A chosen size keeps its own path: it is answered above and
// never reaches this guard.
function unselectedWooStock(html: string, url: string, result: ProductPriceExtraction): ProductPriceExtraction {
  if (result.status !== 'success') return result;
  try { if (new URL(url).searchParams.has('_butika_variant')) return result; } catch { return result; }
  switch (wooVariationVerdict(html, url, result.priceMinor, result.currency, result.availability)) {
    case 'mixed_prices': return { status: 'not_found', contradiction: true, error: 'WooCommerce variations of this product state different prices' };
    case 'price_mismatch': return { status: 'not_found', contradiction: true, error: 'WooCommerce variations of this product state a different price' };
    case 'withhold_stock': return { ...result, availability: 'unknown' };
    default: return result;
  }
}

function readProductHtml(html: string, url: string): ProductPriceExtraction {
  const result=extractProductHtmlRaw(html,url);
  if(result.status!=='success')return result;
  // Stock was already read with the page's own TRL label on both sides; keep it.
  if(result.currency==='TRL'&&result.source==='json-ld'&&isVerifiedDilvinLira(html,url,result.priceMinor))return {...result,currency:'TRY'};
  const currency=trackingCurrency(result.currency);
  if(!currency)return {status:'not_found',error:'Unsupported currency for the two-decimal tracking model'};
  if(currency!==result.currency)return {...result,currency,availability:structuredAvailability(html,result.priceMinor,currency,url)};
  return result;
}

function extractProductHtmlRaw(html: string, url: string): ProductPriceExtraction {
  const ikasSelection = readIkasSelection(url);
  const schemaSelection = readSchemaSelection(url);
  const aymarkaSelection = readAymarkaSelection(url);
  const brandroomSelection = readBrandroomSelection(url);
  const lutvelizadeSelection = readLutvelizadeSelection(url);
  const jimmykeySelection = readJimmykeySelection(url);
  const selection = lutvelizadeSelection ?? jimmykeySelection ?? brandroomSelection ?? aymarkaSelection ?? schemaSelection ?? ikasSelection ?? readTicimaxSelection(url);
  if (selection && !selection.variantId) return { status: 'not_found', error: 'Invalid selected variant identity' };
    if (isBlockedPage(html)) {
      return {
        status: 'blocked',
        error: 'Retailer returned an anti-bot/challenge page',
      };
    }

    // A chosen Lutvelizade size: the product's own price, read without the
    // selection, and the size's stock only where the page binds both to it.
    if (lutvelizadeSelection) {
      const base = extractProductHtmlRaw(html, lutvelizadeSelection.sourceUrl);
      if (base.status !== 'success') return { status: 'not_found', error: 'Selected Lutvelizade size cannot be verified: no product price' };
      const size = lutvelizadeSelectedSize(html, url, base);
      return 'availability' in size ? { ...base, availability: size.availability, source: 'lutvelizade' }
        : { status: 'not_found', error: `Selected Lutvelizade size cannot be verified: ${size.rejected}` };
    }

    // A chosen jimmykey size: the colour page's own price, read without the selection,
    // and that size's own state where the page binds the product, the colour and the size.
    // No product-level price or stock stands in for a size the page does not state.
    if (jimmykeySelection) {
      const base = extractProductHtmlRaw(html, jimmykeySelection.sourceUrl);
      if (base.status !== 'success') return { status: 'not_found', error: 'Selected jimmykey size cannot be verified: no product price' };
      const size = jimmykeySelectedSize(html, url, base);
      if ('availability' in size) return { ...base, availability: size.availability, source: 'jimmykey' };
      return { status: 'not_found', error: `Selected jimmykey size cannot be verified: ${size.rejected}`,
        ...(size.contradiction ? { contradiction: true as const } : {}) };
    }

    if (brandroomSelection) {
      const p=brandroomProduct(html,url);
      return p && p.productId===brandroomSelection.productId && p.attributeId===brandroomSelection.attributeId && p.values.some(v=>v.Id===brandroomSelection.variantId)
        ? {status:'success',priceMinor:p.priceMinor,currency:p.currency,availability:'unknown',source:'brandroom'}
        : {status:'not_found',error:'Selected Brandroom size cannot be verified'};
    }
    if (aymarkaSelection) {
      const base = extractProductHtmlRaw(html, aymarkaSelection.sourceUrl);
      const product = base.status === 'success' ? aymarkaProduct(html,url,base.priceMinor,base.currency) : null;
      return base.status === 'success' && product && String(product.id) === aymarkaSelection.productId && product.barcodes.some(b => String(b.id) === aymarkaSelection.variantId)
        ? {...base, source:'aymarka', availability:'unknown'}
        : {status:'not_found',error:'Selected barcode cannot be verified'};
    }
    if (selection) {
      const selected = schemaSelection ? extractSchemaSelectedOffer(html,selection.sourceUrl,selection.variantId)
        : ikasSelection ? ikasVariantObservation(html,selection.sourceUrl,selection.productId,selection.variantId)
        : extractTicimaxSelectedVariant(html, selection.sourceUrl, selection.productId, selection.variantId);
      return selected ? { status: 'success', ...selected, source: schemaSelection ? 'json-ld' : ikasSelection ? 'ikas' : 'ticimax' }
        : { status: 'not_found', error: 'Selected variant cannot be verified' };
    }
    const brandroom=brandroomProduct(html,url);
    if(brandroom)return {status:'success',priceMinor:brandroom.priceMinor,currency:brandroom.currency,availability:'unknown',source:'brandroom'};
    const aymarkaPrice = aymarkaPagePrice(html,url);
    if (aymarkaPrice) return {status:'success',...aymarkaPrice,availability:'unknown',source:'aymarka'};
    const jsonLd = extractFromJsonLd(html);

    if (jsonLd) {
      return {
        status: 'success',
        ...jsonLd,
        availability: structuredAvailability(html, jsonLd.priceMinor, jsonLd.currency, url),
        source: readIkasProduct(html) ? 'ikas' : 'json-ld',
      };
    }

    // ProductGroup and UnitPriceSpecification offers of this page's product only fill
    // gaps: a price the readers below find still stands, as before, and these offers
    // may add the stock they prove for that same price. Without any other price they
    // are the answer, and when they cannot be used the reason is reported.
    const schemaOffer = readSchemaProductOffer(html, url, new Date());

    const meta = extractFromMeta(html);

    if (meta) {
      return withSchemaStock({
        status: 'success',
        ...meta,
        availability: structuredAvailability(html, meta.priceMinor, meta.currency, url),
        source: 'meta',
      }, schemaOffer);
    }

    const ticimax = extractFromTicimax(html);

    if (ticimax) {
      return withSchemaStock({
        status: 'success',
        ...ticimax,
        availability: structuredAvailability(html, ticimax.priceMinor, ticimax.currency, url),
        source: 'ticimax',
      }, schemaOffer);
    }

    const microdata = scopedMicrodataPrice(html,url) ?? extractFromMicrodata(html);

    if (microdata) {
      return withSchemaStock({
        status: 'success',
        ...microdata,
        availability: structuredAvailability(html, microdata.priceMinor, microdata.currency, url),
        source: 'microdata',
      }, schemaOffer);
    }

    const htmlPrice = extractFromCommonHtml(html);

    if (htmlPrice) {
      return withSchemaStock({
        status: 'success',
        ...htmlPrice,
        availability: structuredAvailability(html, htmlPrice.priceMinor, htmlPrice.currency, url),
        source: 'html',
      }, schemaOffer);
    }

    if (schemaOffer.status === 'success') return schemaOffer;
    if (schemaOffer.status === 'rejected') {
      return { status: 'not_found', error: `Schema offer cannot be used: ${schemaOffer.reason}`,
        ...(schemaOffer.contradiction ? { contradiction: true as const } : {}) };
    }

    // Last, and only where nothing above found a price: two storefronts that publish
    // their price nowhere a general reader looks — one in its Next.js streaming
    // payload, one in its own SAP Commerce markup. Each answers with a price alone,
    // in lira; the identity each proves stays inside its own helper, and neither
    // decides stock here or is enriched with it later.
    const akinonNext = readAkinonNextProduct(html, url, 'TRY');
    if (akinonNext) {
      return { status: 'success', priceMinor: akinonNext.priceMinor, currency: akinonNext.currency,
        availability: 'unknown', source: 'akinon-next' };
    }

    const miorre = readMiorreProduct(html, url, 'TRY');
    if (miorre) {
      return { status: 'success', priceMinor: miorre.priceMinor, currency: miorre.currency,
        availability: 'unknown', source: 'miorre-html' };
    }

    return {
      status: 'not_found',
      error: 'No supported product price found',
    };
}

// Another reader's price stands. The page's own schema offers only add a stock
// state they prove for exactly that amount and currency.
function withSchemaStock(result: ExtractedPrice, offer: SchemaProductOffer): ExtractedPrice {
  if (offer.status !== 'success' || offer.availability === 'unknown' || (result.availability ?? 'unknown') !== 'unknown') return result;
  if (offer.priceMinor !== result.priceMinor || offer.currency !== trackingCurrency(result.currency)) return result;
  return { ...result, currency: offer.currency, availability: offer.availability };
}

export function isBlockedPage(html: string): boolean {
  if (!html) {
    return true;
  }

  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  if (/access denied|request rejected|just a moment|attention required|verify (?:you are|you're) human|security check|forbidden/i.test(title)) return true;
  // Normal storefronts load anti-bot libraries too. Script names such as
  // "challenge" or "akamai" alone do not mean the product page was blocked.
  const visible = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, ' ');
  return html.length < 50_000 && /access denied|request rejected|verify (?:you are|you're) human|enable javascript and cookies to continue/i.test(visible);
}

function extractFromJsonLd(
  html: string,
): {
  priceMinor: number;
  currency: string;
} | null {
  for (const block of jsonLdBlocks(html)) {
    const result =
      findPriceInJsonLd(
        parseJsonLd(block),
      );

    if (result) {
      return result;
    }
  }

  return null;
}

function findPriceInJsonLd(
  value: unknown,
): {
  priceMinor: number;
  currency: string;
} | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result =
        findPriceInJsonLd(item);

      if (result) return result;
    }

    return null;
  }

  if (
    typeof value !== 'object'
  ) {
    return null;
  }

  const object =
    value as Record<string, unknown>;

  const type = object['@type'];

  const isProduct =
    type === 'Product' ||
    (Array.isArray(type) &&
      type.includes('Product'));

  if (isProduct) {
    const offers =
      object.offers;

    const result =
      findPriceInOffers(offers);

    if (result) {
      return result;
    }
  }

  if (object['@graph']) {
    const result =
      findPriceInJsonLd(
        object['@graph'],
      );

    if (result) {
      return result;
    }
  }

  return null;
}

function findPriceInOffers(
  offers: unknown,
): {
  priceMinor: number;
  currency: string;
} | null {
  if (!offers) {
    return null;
  }

  if (Array.isArray(offers)) {
    for (const offer of offers) {
      const result =
        findPriceInOffers(offer);

      if (result) return result;
    }

    return null;
  }

  if (
    typeof offers !== 'object'
  ) {
    return null;
  }

  const offer =
    offers as Record<string, unknown>;

  const rawPrice =
    offer.price ??
    offer.lowPrice;

  const rawCurrency =
    offer.priceCurrency;

  if (
    rawPrice !== undefined &&
    typeof rawCurrency ===
      'string'
  ) {
    const priceMinor =
      decimalPriceToMinor(
        String(rawPrice),
      );

    if (priceMinor !== null) {
      return {
        priceMinor,
        currency:
          rawCurrency.toUpperCase(),
      };
    }
  }

  return null;
}

function extractFromMeta(
  html: string,
): {
  priceMinor: number;
  currency: string;
} | null {
  const amount =
    findMetaContent(html, [
      'product:price:amount',
      'og:price:amount',
    ]);

  const currency =
    findMetaContent(html, [
      'product:price:currency',
      'og:price:currency',
    ]);

  if (!amount || !currency) {
    return null;
  }

  const priceMinor =
    decimalPriceToMinor(amount);

  if (priceMinor === null) {
    return null;
  }

  return {
    priceMinor,
    currency:
      currency.toUpperCase(),
  };
}

function findMetaContent(
  html: string,
  properties: string[],
): string | null {
  for (const property of properties) {
    const escaped =
      escapeRegExp(property);

    const propertyFirst =
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
        'i',
      );

    const contentFirst =
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
        'i',
      );

    const match =
      html.match(propertyFirst) ??
      html.match(contentFirst);

    if (match?.[1]) {
      return decodeHtml(
        match[1].trim(),
      );
    }
  }

  return null;
}

function extractFromTicimax(
  html: string,
): {
  priceMinor: number;
  currency: string;
} | null {
  const json =
    extractAssignedJsonObject(
      html,
      'productDetailModel',
    );

  if (!json) {
    return null;
  }

  try {
    const model =
      JSON.parse(json) as Record<string, unknown>;

    const productId =
      model.productId;

    const productName =
      model.productName;

    if (
      typeof productId !== 'number' ||
      productId <= 0 ||
      typeof productName !== 'string' ||
      !productName.trim()
    ) {
      return null;
    }

    if (
      model.productActive === false
    ) {
      return null;
    }

    const rawCurrency =
      typeof model.productCurrency === 'string'
        ? model.productCurrency
        : extractBodyCurrency(html);

    if (!rawCurrency) {
      return null;
    }

    const currency =
      rawCurrency
        .trim()
        .toUpperCase();

    if (
      !/^[A-Z]{3}$/.test(currency)
    ) {
      return null;
    }

    /*
     * Ticimax:
     * productPrice çoğunlukla KDV hariç değerdir.
     * Kullanıcıya gösterilen fiyat için
     * productPriceKDVIncluded tercih edilir.
     */
    const included =
      model.productPriceKDVIncluded;

    if (
      typeof included === 'number' &&
      Number.isFinite(included) &&
      included > 0
    ) {
      const priceMinor =
        Math.round(included * 100);

      if (
        Number.isSafeInteger(priceMinor) &&
        priceMinor > 0
      ) {
        return {
          priceMinor,
          currency,
        };
      }
    }

    /*
     * Bazı Ticimax kurulumlarında sayısal alan
     * bulunmazsa ekrandaki string değeri fallback.
     */
    const priceStr =
      model.productPriceStr;

    if (
      typeof priceStr === 'string'
    ) {
      const priceMinor =
        decimalPriceToMinor(
          priceStr,
        );

      if (
        priceMinor !== null &&
        priceMinor > 0
      ) {
        return {
          priceMinor,
          currency,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

function extractBodyCurrency(
  html: string,
): string | null {
  const match =
    html.match(
      /<body[^>]+data-currency=["']([A-Za-z]{3})["']/i,
    );

  return match?.[1] ?? null;
}

function extractAssignedJsonObject(
  html: string,
  variableName: string,
): string | null {
  const escaped =
    escapeRegExp(variableName);

  const assignment =
    new RegExp(
      `(?:var|let|const)\\s+${escaped}\\s*=\\s*`,
      'i',
    ).exec(html);

  if (!assignment) {
    return null;
  }

  let index =
    assignment.index +
    assignment[0].length;

  while (
    index < html.length &&
    /\s/.test(html[index] ?? '')
  ) {
    index += 1;
  }

  if (
    html[index] !== '{'
  ) {
    return null;
  }

  const start =
    index;

  let depth = 0;
  let inString = false;
  let escapedChar = false;

  for (
    ;
    index < html.length;
    index += 1
  ) {
    const char =
      html[index];

    if (inString) {
      if (escapedChar) {
        escapedChar = false;
        continue;
      }

      if (char === '\\') {
        escapedChar = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return html.slice(
          start,
          index + 1,
        );
      }
    }
  }

  return null;
}
function extractFromMicrodata(
  html: string,
): {
  priceMinor: number;
  currency: string;
} | null {
  const offerStarts =
    [
      ...html.matchAll(
        /<[^>]+itemtype=["'][^"']*schema\.org\/Offer[^"']*["'][^>]*>/gi,
      ),
    ];

  for (const offerStart of offerStarts) {
    const startIndex =
      offerStart.index ?? 0;

    const offerHtml =
      html.slice(
        startIndex,
        Math.min(
          html.length,
          startIndex + 4_000,
        ),
      );

    const rawCurrency =
      findItempropContent(
        offerHtml,
        'priceCurrency',
      );

    const rawPrice =
      findItempropContent(
        offerHtml,
        'price',
      );

    if (
      !rawCurrency ||
      !rawPrice
    ) {
      continue;
    }

    const currency =
      rawCurrency
        .trim()
        .toUpperCase();

    if (
      !/^[A-Z]{3}$/.test(
        currency,
      )
    ) {
      continue;
    }

    const priceMinor =
      decimalPriceToMinor(
        rawPrice,
      );

    if (
      priceMinor === null ||
      priceMinor <= 0
    ) {
      continue;
    }

    return {
      priceMinor,
      currency,
    };
  }

  return null;
}

function findItempropContent(
  html: string,
  itemprop: string,
): string | null {
  const escaped =
    escapeRegExp(itemprop);

  const patterns = [
    new RegExp(
      `<[^>]+itemprop=["']${escaped}["'][^>]+(?:content|value)=["']([^"']+)["'][^>]*>`,
      'i',
    ),
    new RegExp(
      `<[^>]+(?:content|value)=["']([^"']+)["'][^>]+itemprop=["']${escaped}["'][^>]*>`,
      'i',
    ),
  ];

  for (const pattern of patterns) {
    const match =
      html.match(pattern);

    if (match?.[1]) {
      return decodeHtml(
        match[1].trim(),
      );
    }
  }

  return null;
}
function extractFromCommonHtml(
  html: string,
): {
  priceMinor: number;
  currency: string;
} | null {
  const dataTag =
    html.match(
      /<data[^>]+data-currency=["']([A-Za-z]{3})["'][^>]+value=["']([\d.,]+)["'][^>]*>/i,
    ) ??
    html.match(
      /<data[^>]+value=["']([\d.,]+)["'][^>]+data-currency=["']([A-Za-z]{3})["'][^>]*>/i,
    );

  if (!dataTag) {
    return null;
  }

  let currency: string;
  let rawPrice: string;

  if (
    /^[A-Za-z]{3}$/.test(
      dataTag[1] ?? '',
    )
  ) {
    currency = dataTag[1]!;
    rawPrice = dataTag[2]!;
  } else {
    rawPrice = dataTag[1]!;
    currency = dataTag[2]!;
  }

  const priceMinor =
    decimalPriceToMinor(rawPrice);

  if (priceMinor === null) {
    return null;
  }

  return {
    priceMinor,
    currency:
      currency.toUpperCase(),
  };
}

function decimalPriceToMinor(
  raw: string,
): number | null {
  if (/[+-]|[eE][+-]?\d/.test(raw)) return null;
  let value = raw
    .trim()
    .replace(/\s/g, '')
    .replace(/[^\d.,]/g, '');

  if (!value) {
    return null;
  }

  const comma =
    value.lastIndexOf(',');

  const dot =
    value.lastIndexOf('.');

  let decimalSeparator:
    | ','
    | '.'
    | null = null;

  if (comma >= 0 && dot >= 0) {
    decimalSeparator =
      comma > dot ? ',' : '.';
  } else if (comma >= 0) {
    if (
      [1, 2].includes(value.length - comma - 1)
    ) {
      decimalSeparator = ',';
    }
  } else if (dot >= 0) {
    if (
      [1, 2].includes(value.length - dot - 1)
    ) {
      decimalSeparator = '.';
    }
  }

  if (decimalSeparator) {
    const thousands =
      decimalSeparator === ','
        ? '.'
        : ',';

    value = value
      .split(thousands)
      .join('');

    value = value.replace(
      decimalSeparator,
      '.',
    );
  } else {
    value = value.replace(
      /[.,]/g,
      '',
    );
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return null;
  }

  const minor = Math.round(number * 100);
  return Number.isSafeInteger(minor) ? minor : null;
}

function decodeHtml(
  value: string,
): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function escapeRegExp(
  value: string,
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
}

