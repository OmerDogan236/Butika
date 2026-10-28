export type SavedVariant = { id: string; title: string; available: boolean | null; url?: string };
const validId = (id: string) => /^(?:[1-9]\d*|(?:ticimax|aymarka|modanisa|woo):[1-9]\d*:[1-9]\d*|brandroom:[0-9a-f]{24}:[0-9a-f]{24}:[0-9a-f]{24}|offer:[A-Za-z0-9_.-]{1,120}|ikas:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.test(id) ||
  // Written by the page in lower case and read by the server exactly so.
  /^lutvelizade:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id) ||
  // jimmykey:<ProductID>:<ColorID>:<SizeID>, lower case, as the server reads it.
  /^jimmykey:[1-9][0-9]{0,9}:[1-9][0-9]{0,9}:[1-9][0-9]{0,9}$/.test(id);

// The decoded query pairs in any order, repeats kept: ?a=x%3Ay and ?a=x:y say the same, while a
// second value, another size or any other parameter does not.
const queryPairs=(url:URL,leaveOut?:string)=>{
  const pairs:string[]=[];
  url.searchParams.forEach((value,key)=>{if(key!==leaveOut)pairs.push(JSON.stringify([key,value]));});
  return pairs.sort().join('&');
};

export function findSavedVariant<T extends {url:string}>(saved:T[]|undefined,currentUrl:string):T|undefined {
  let current:URL;
  try{current=new URL(currentUrl);}catch{return undefined;}
  // Our own size parameter stated twice, or with a value the app never writes, names no one size: no save is
  // shown for such a page, not even one saved under the same text, so no size change or stock alert is bound to it.
  const selections=current.searchParams.getAll('_butika_variant');
  if(selections.length>1||selections.some(id=>!id.includes(':')||!validId(id)))return undefined;
  // The very same text is that save. The database keeps one save per account and address.
  const exact=saved?.find(p=>p.url===currentUrl);if(exact)return exact;
  const parsed=(saved??[]).flatMap(p=>{try{return [{p,u:new URL(p.url)}];}catch{return [];}});
  // The same page as a URL parser reads it: origin, the path as written (%2F stays apart from /),
  // the fragment and the query pairs. Spelling alone (%3A or :) never hides a save.
  const same=parsed.filter(({u})=>u.origin===current.origin&&u.pathname===current.pathname&&u.hash===current.hash&&queryPairs(u)===queryPairs(current));
  if(same.length)return same.length===1?same[0]?.p:undefined;
  if(current.searchParams.has('_butika_variant'))return undefined;
  // A theme may strip internal tracking parameters. Only recover an unambiguous save of one size.
  const matching=parsed.filter(({u})=>u.searchParams.getAll('_butika_variant').length===1&&u.origin===current.origin&&
    u.pathname===current.pathname&&queryPairs(u,'_butika_variant')===queryPairs(current));
  return matching.length===1?matching[0]?.p:undefined;
}

export function readVariants(value: unknown): SavedVariant[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 250) return null;
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item.id !== 'string' || !validId(item.id) ||
      typeof item.title !== 'string' || !item.title.trim() || item.title.length > 300 ||
      (item.available !== null && typeof item.available !== 'boolean') || ids.has(item.id)) return null;
    if(item.url!==undefined){try{if(!item.id.startsWith('offer:')||typeof item.url!=='string'||!/^https?:$/.test(new URL(item.url).protocol))return null;}catch{return null;}}
    ids.add(item.id);
  }
  return value;
}

export function variantUrl(url: string, id: string, offeredUrl?: string): string {
  const source = new URL(url), result = new URL(offeredUrl??url);
  if(offeredUrl && (!id.startsWith('offer:')||result.origin!==source.origin||result.pathname.replace(/\/$/,'')!==source.pathname.replace(/\/$/,'')))throw new Error('Variant belongs to another product');
  if (!/^https?:$/.test(result.protocol) || !validId(id)) throw new Error('Invalid variant');
  // A jimmykey size belongs to the store's colour page it was read from: the host, and the
  // colour that is the address's last segment, are part of its identity.
  if (id.startsWith('jimmykey:') && (!/^(www[.])?jimmykey[.]com$/.test(result.hostname) ||
    id.split(':')[2] !== result.pathname.split('/').filter(Boolean).pop())) throw new Error('Variant belongs to another colour');
  result.searchParams.set(id.includes(':') ? '_butika_variant' : 'variant', id);
  if (id.startsWith('ikas:')) result.searchParams.set('vid', id.split(':')[2]!);
  return result.toString();
}

// One option is not a choice (Shopify's "Default Title"): it is saved without the
// picker, and its label is not appended to the product title. A jimmykey size is always
// chosen in the picker, even when it is the only one: no one-size page has been seen there.
export function singleVariantSave(url: string, title: string, variants: SavedVariant[]): { url: string; title: string } | null {
  const [only] = variants;
  return variants.length === 1 && only && !only.id.startsWith('jimmykey:') ? { url: variantUrl(url, only.id, only.url), title } : null;
}

// A size saved from a page the user has since left must not pull the browser back to it.
export function followSavedVariant(pageUrl: string | undefined, currentUrl: string): boolean {
  return pageUrl !== undefined && pageUrl === currentUrl;
}

// Runs in the storefront. No client price or availability becomes a server baseline.
// The native picker requires an explicit choice, even when the theme has a default variant.
export function variantCaptureScript(metadataScript: string, requestId: string): string {
  const send = `window.ReactNativeWebView.postMessage(JSON.stringify(payload));`;
  return metadataScript.replace(send, `
    payload.requestId = ${JSON.stringify(requestId)};
    (async function () {
      var snapshotUrl = location.href;
      if (/^(www[.])?jimmykey[.]com$/.test(location.hostname) && /^[/][a-z]{2}[/][^/]+_[0-9a-z]+[/][^/]+[/][0-9]+[/]?$/i.test(location.pathname)) {
        // A jimmykey.com colour page (apps/api/src/lib/price-tracking/jimmykey-size-stock.ts).
        // The product's own block is the single .ProductContent outside modals,
        // recommendations, recently viewed and combine items, the sticky bar, the store-stock
        // search, the size chart, the footer and <template>. A size is offered as
        // jimmykey:<ProductID>:<ColorID>:<SizeID>: the size id alone is the store's size
        // dictionary, shared by every product and colour. Anything not stated once and
        // consistently leaves the page without a picker, never with a guessed size and never
        // saved without one.
        try {
          var jkElsewhere = ['template', 'footer', '.modal', '.personaclick-recommend', '.recommended-items', '.AutoGetLastVisited',
            '.SuggestAndLast', '.CombineItems', '.AddToBasketFixed', '.StoreStock', '.SizeTable', '#PrdInfo'];
          var jkOwn = function(el){return jkElsewhere.every(function(s){return !el.closest(s);});};
          var jkAll = function(root, selector){return Array.from(root.querySelectorAll(selector)).filter(jkOwn);};
          var jkId = function(value){if (!/^[1-9][0-9]{0,9}$/.test(value || '')) throw new Error('Invalid identity');return value;};
          var jkSpace = new RegExp('[' + String.fromCharCode(9, 10, 12, 13, 32, 160) + ']+', 'g');
          var jkLabel = function(value){return String(value || '').split('&nbsp;').join(' ').split('&#160;').join(' ').replace(jkSpace, ' ').trim();};
          var jkPlace = function(href){var u = new URL(href, location.href);
            return u.protocol + '//' + u.hostname.replace(/^www[.]/, '') + decodeURIComponent(u.pathname).replace(/[/]+$/, '').toLowerCase();};
          if (location.protocol !== 'https:' || location.port) throw new Error('Unverified address');
          var jkAddress = /_([0-9a-z]+)[/][^/]+[/]([0-9]+)[/]?$/i.exec(location.pathname);
          var jkBlocks = jkAll(document, '.ProductContent');
          if (jkBlocks.length !== 1) throw new Error('No single product block');
          var jk = jkBlocks[0];
          var jkOne = function(selector){var found = jkAll(jk, selector);if (found.length !== 1) throw new Error('Not one ' + selector);return found[0];};
          var jkProduct = jkId(jkOne('input#ProductID').getAttribute('value'));
          var jkColour = jkId(jkOne('input#ColorID').getAttribute('value'));
          if (jkColour !== jkAddress[2] || jkOne('input#CurrentColorId').getAttribute('value') !== jkColour) throw new Error('Another colour');
          // The active colour and the add-to-bag button are the block's own. On a phone the store
          // moves them out to one sticky bar at the end of the page: its colour row, its colour
          // pop-up and its add-to-bag slot, at most one copy in each. Only those places count; a
          // copy found anywhere else on the page, or any copy naming another product, colour or
          // page, leaves the page without a picker. No copy is ever chosen over another.
          // A colour sold out in every size has no add-to-bag button: the store renders its
          // notify-me link a#NotAdd.RemindMe in the button's place (on a phone, in the same slot),
          // with the product id and the colour id but no product code. Only where no button
          // exists does the link stand in for it: every copy must name this product and colour,
          // the code comes from the block's one favourite button (its data-id is the ProductID),
          // and every size must be sold out on its own.
          var jkActive = jkAll(jk, '.ColorOptionItem.active'), jkBaskets = jkAll(jk, 'button#Basket'), jkNotify = jkAll(jk, 'a#NotAdd.RemindMe');
          if (jkActive.length > 1 || jkBaskets.length > 1 || jkNotify.length > 1) throw new Error('Ambiguous product block');
          var jkBars = jkAll(document, '.product_page_sticky_button_container');
          if (jkBars.length > 1) throw new Error('Two sticky bars');
          if (jkBars.length) {
            var jkSlot = function(place, selector){var places = jkAll(jkBars[0], place);if (places.length > 1) throw new Error('Two ' + place);
              var found = places.length ? jkAll(places[0], selector) : [];if (found.length > 1) throw new Error('Two in ' + place);return found;};
            var jkBarActive = jkSlot('.product_page_sticky_button_colorOptions', '.ColorOptionItem.active')
              .concat(jkSlot('.product_page_sticky_button_colorOptions_popUp', '.ColorOptionItem.active'));
            var jkBarBasket = jkSlot('.product_page_sticky_button_addToCard', 'button#Basket');
            var jkBarNotify = jkSlot('.product_page_sticky_button_addToCard', 'a#NotAdd.RemindMe');
            if (jkAll(jkBars[0], '.ColorOptionItem.active').length !== jkBarActive.length ||
              jkAll(jkBars[0], 'button#Basket').length !== jkBarBasket.length || jkAll(jkBars[0], '#NotAdd').length !== jkBarNotify.length)
              throw new Error('Unplaced copy in the sticky bar');
            jkActive = jkActive.concat(jkBarActive);
            jkBaskets = jkBaskets.concat(jkBarBasket);
            jkNotify = jkNotify.concat(jkBarNotify);
          }
          if (!jkActive.length || jkAll(document, '.ColorOptionItem.active').length !== jkActive.length ||
            jkAll(document, 'button#Basket').length !== jkBaskets.length || jkAll(document, '#NotAdd').length !== jkNotify.length)
            throw new Error('Unplaced colour or button');
          // The add-to-bag button, or with none on the page, the notify-me link: never both, never neither.
          if (jkBaskets.length ? jkNotify.length : !jkNotify.length) throw new Error('Not one kind of button');
          jkActive.forEach(function(item){var link = jkAll(item, 'a.change-color');
            if (link.length !== 1 || link[0].getAttribute('data-id') !== jkColour || link[0].getAttribute('data-productid') !== jkProduct ||
              jkPlace(link[0].getAttribute('href') || '') !== jkPlace(location.href)) throw new Error('Another colour');});
          var jkCodes = jkBaskets.map(function(b){return b.getAttribute('data-productcode');});
          if (jkNotify.length) {
            if (jkNotify.some(function(n){return n.getAttribute('data-productid') !== jkProduct || n.getAttribute('data-colorid') !== jkColour;})) throw new Error('Another product');
            var jkFavourite = jkAll(jk, 'button.AddToFavorite[data-productcode]');
            if (jkFavourite.length !== 1 || jkAll(document, '.AddToFavorite[data-productcode]').length !== 1 ||
              jkFavourite[0].getAttribute('data-id') !== jkProduct) throw new Error('No product code');
            jkCodes = [jkFavourite[0].getAttribute('data-productcode')];
          }
          if (jkCodes.some(function(c){return String(c || '').toLowerCase() !== jkAddress[1].toLowerCase();}) ||
            jkAll(document, 'input#PID').some(function(p){return p.getAttribute('value') !== jkProduct;})) throw new Error('Another product');
          var jkCanonical = jkAll(document, 'link[rel="canonical"]');
          if (jkCanonical.length !== 1 || jkPlace(jkCanonical[0].getAttribute('href') || '') !== jkPlace(location.href)) throw new Error('Another page');
          var jkList = jkOne('.SizeOptions'), jkSizes = [], jkSoldOut = 0;
          jkAll(jkList, 'a').forEach(function(a) {
            var outer = a.closest('span.outer');
            if (outer) {
              if (!a.classList.contains('NotifyWhen')) return;
              var ids = jkAll(outer, 'input[name="SizeIDs"]'), inner = jkAll(outer, 'span.inner');
              if (ids.length !== 1 || inner.length !== 1 || !jkAll(outer, 'span.noStockLine').length || jkAll(outer, 'a.NotifyWhen').length !== 1) throw new Error('Unclear sold-out size');
              jkSoldOut++;
              jkSizes.push({id:jkId(ids[0].getAttribute('value')),label:jkLabel(inner[0].textContent),available:false});
              return;
            }
            var stock = String(a.getAttribute('data-stock') || '').toLowerCase();
            if (stock !== 'true' && stock !== 'false') throw new Error('Unclear size');
            jkSizes.push({id:jkId(a.getAttribute('data-id')),label:jkLabel(a.getAttribute('data-name')),available:stock === 'true'});
          });
          var jkIds = jkSizes.map(function(s){return s.id;}), jkNames = jkSizes.map(function(s){return s.label.toLowerCase();});
          if (!jkSizes.length || jkSoldOut !== jkAll(jkList, 'span.outer').length || new Set(jkIds).size !== jkIds.length ||
            new Set(jkNames).size !== jkNames.length || jkSizes.some(function(s){return !s.label || s.label.length > 100;})) throw new Error('Ambiguous sizes');
          // The link never marks a size sold out; a size on sale beside it contradicts it.
          if (jkNotify.length && jkSizes.some(function(s){return s.available;})) throw new Error('A size on sale beside the notify-me link');
          payload.variants = jkSizes.map(function(s){return {id:'jimmykey:' + jkProduct + ':' + jkColour + ':' + s.id,title:s.label,available:s.available};});
          payload.variantStatus = 'ready';
        } catch (_) { payload.variantStatus = 'error'; }
        if (location.href !== snapshotUrl) return;
        window.ReactNativeWebView.postMessage(JSON.stringify(payload)); return;
      }
      var model = typeof productDetailModel !== 'undefined' ? productDetailModel : window.productDetailModel;
      if (model && Array.isArray(model.products) && model.products.length > 1) {
        try {
          if (!Number.isSafeInteger(model.productId) || !Array.isArray(model.productVariantData)) throw new Error('Missing variant identity');
          // Some themes include a parent/default row which has no selectable option.
          payload.variants = model.products.filter(function(v){return model.productVariantData.some(function(o){return o.urunID === v.id && o.urunKartID === model.productId;});}).map(function(v) {
            if (!Number.isSafeInteger(v.id) || v.urunKartiId !== model.productId || !Number.isFinite(v.stokAdedi)) throw new Error('Invalid variant');
            var names = model.productVariantData.filter(function(o){return o.urunID === v.id && o.urunKartID === model.productId;})
              .sort(function(a,b){return (a.ekSecenekTipiSira || 0) - (b.ekSecenekTipiSira || 0);})
              .map(function(o){return (o.ekSecenekTipiTanim ? o.ekSecenekTipiTanim + ': ' : '') + o.tanim;});
            if (!names.length) throw new Error('Missing variant label');
            return {id:'ticimax:' + model.productId + ':' + v.id, title:Array.from(new Set(names)).join(' / '), available:v.aktif === true && v.stokAdedi > 0};
          });
          if (!payload.variants.length) throw new Error('No selectable variants');
          payload.variantStatus = 'ready';
        } catch (_) { payload.variantStatus = 'error'; }
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        return;
      }
      if (/^(www\\.)?brandroom\\.com\\.tr$/.test(location.hostname)) {
        try {
          var br = typeof standardProductAttributes !== 'undefined' ? standardProductAttributes : window.standardProductAttributes;
          var attrs = br && br.ProductAttributes;
          if (!Array.isArray(attrs) || attrs.length !== 1) throw new Error('Unsupported options');
          var attr = attrs[0];
          if (attr.HasCondition !== false || attr.IsRequired !== true || attr.AttributeControlType !== 2 || !Array.isArray(attr.Values)) throw new Error('Unsupported options');
          payload.variants = attr.Values.map(function(v) {
            if (v.PriceAdjustmentValue !== 0 || typeof v.Name !== 'string' || !v.Name.trim()) throw new Error('Unsupported option');
            return {id:'brandroom:' + attr.ProductId + ':' + attr.Id + ':' + v.Id,title:v.Name,available:null};
          });
          if (!payload.variants.length) throw new Error('Missing options');
          payload.variantStatus='ready';
        } catch (_) {payload.variantStatus='error';}
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));return;
      }
      if (/^(www\\.)?modanisa\\.com$/.test(location.hostname) && /^\\/[a-z0-9-]+\\.html$/.test(location.pathname)) {
        var modanisaController=new AbortController(), modanisaTimer=setTimeout(function(){modanisaController.abort();},7000);
        try {
          var modanisaSlug=location.pathname.slice(1,-5);
          var mr=await fetch('https://product-detail-pd-bff.modanisa.com/product/slug/'+encodeURIComponent(modanisaSlug),{signal:modanisaController.signal,headers:{'accept-language':'tr','x-shipping-country-code':'TR','x-shipping-country-code-alpha3':'TUR','x-display-currency':'TRY'}});
          if (!mr.ok) throw new Error('Product unavailable');
          var md=await mr.json();
          var mc=md.colors.filter(function(c){return c.productId===md.id && new URL(c.sef).pathname===location.pathname;});
          if(md.price.symbol!=='TL'||mc.length!==1||!Array.isArray(mc[0].sizes))throw new Error('Unverified product');
          payload.variants=mc[0].sizes.map(function(s){if(!Number.isSafeInteger(s.quantity)||s.quantity<0)throw new Error('Unknown stock');return {id:'modanisa:'+md.id+':'+s.sku,title:s.name,available:s.quantity>0};});
          if(!payload.variants.length)throw new Error('No sizes');payload.variantStatus='ready';
        }catch(_){payload.variantStatus='error';}finally{clearTimeout(modanisaTimer);}
        if(location.href!==snapshotUrl)return;
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));return;
      }
      if (/^(www\\.)?lutvelizade\\.com\\.tr$/.test(location.hostname)) {
        // The product block lists every size; a sold-out one has no id there and takes
        // its GUID from the "Gelince Haber Ver" dialog. Anything not stated once and
        // consistently leaves the page without a picker, never with a guessed size.
        var lvBlocks = document.querySelectorAll('div.details'), lvDialogs = document.querySelectorAll('[id="addStockNotificationModal"]');
        if (lvBlocks.length || lvDialogs.length) {
          try {
            var lvGuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
            if (location.protocol !== 'https:' || location.port || lvBlocks.length !== 1 || lvDialogs.length > 1) throw new Error('Unverified product');
            var lvPpv = lvBlocks[0].querySelectorAll('[data-ppv-id]');
            if (lvPpv.length !== 1 || !lvGuid.test(lvPpv[0].getAttribute('data-ppv-id') || '')) throw new Error('Missing product identity');
            var lvLists = lvBlocks[0].querySelectorAll('.variation.size'), lvDialogLists = [];
            Array.from(lvDialogs).forEach(function(d){lvDialogLists = lvDialogLists.concat(Array.from(d.querySelectorAll('.variation.size')));});
            if (lvLists.length || lvDialogLists.length) {
              var lvRead = function(list){return Array.from(list.querySelectorAll('a')).map(function(a){
                var id = a.getAttribute('data-id');
                return {label:String(a.textContent || '').replace(/\\s+/g,' ').trim(),id:id == null ? null : id,disabled:String(a.getAttribute('class') || '').split(/\\s+/).indexOf('disable') >= 0};});};
              if (lvLists.length !== 1 || lvDialogLists.length !== lvDialogs.length) throw new Error('Ambiguous sizes');
              var lvMain = lvRead(lvLists[0]), lvDialog = lvDialogLists.length ? lvRead(lvDialogLists[0]) : [];
              var lvLabels = function(list){return list.map(function(s){return s.label;});};
              var lvUnique = function(values){return new Set(values).size === values.length;};
              var lvSoldOut = lvMain.filter(function(s){return s.disabled;});
              if (!lvMain.length || !lvUnique(lvLabels(lvMain)) || !lvUnique(lvLabels(lvDialog)) ||
                lvMain.some(function(s){return !s.label || s.label.length > 100 || (s.disabled ? s.id !== null : !lvGuid.test(s.id || ''));}) ||
                lvDialog.some(function(s){return !s.label || s.disabled || !lvGuid.test(s.id || '');}) ||
                !lvUnique(lvMain.filter(function(s){return !s.disabled;}).map(function(s){return s.id;}).concat(lvDialog.map(function(s){return s.id;}))) ||
                lvDialog.length !== lvSoldOut.length || lvSoldOut.some(function(s){return lvLabels(lvDialog).indexOf(s.label) < 0;})) throw new Error('Ambiguous sizes');
              var lvProduct = lvPpv[0].getAttribute('data-ppv-id');
              payload.variants = lvMain.map(function(s){
                var id = s.disabled ? lvDialog.filter(function(d){return d.label === s.label;})[0].id : s.id;
                return {id:'lutvelizade:' + lvProduct + ':' + id,title:s.label,available:!s.disabled};
              });
              payload.variantStatus = 'ready';
            }
          } catch (_) { payload.variantStatus = 'error'; }
          if (location.href !== snapshotUrl) return;
          window.ReactNativeWebView.postMessage(JSON.stringify(payload)); return;
        }
      }
      if (document.body && document.body.classList && document.body.classList.contains('woocommerce')) {
        var wooController=new AbortController(),wooTimer=setTimeout(function(){wooController.abort();},7000);
        try {
          var wu=new URL(snapshotUrl),ws=decodeURIComponent(wu.pathname.split('/').filter(Boolean).pop());
          var wr=await fetch(wu.origin+'/wp-json/wc/store/v1/products?slug='+encodeURIComponent(ws),{signal:wooController.signal});
          if(!wr.ok)throw new Error('Product unavailable');var wp=await wr.json();
          var exact=wp.filter(function(p){var u=new URL(p.permalink);return u.origin===wu.origin && u.pathname.replace(/\\/$/,'')===wu.pathname.replace(/\\/$/,'');});
          if(exact.length!==1)throw new Error('Unverified product');
          if(exact[0].type==='variable') {
            if(!Array.isArray(exact[0].variations)||!exact[0].variations.length)throw new Error('No sizes');
            payload.variants=exact[0].variations.map(function(v){var title=v.attributes.map(function(a){return a.name+': '+a.value;}).join(' / ');return {id:'woo:'+exact[0].id+':'+v.id,title:title,available:null};});
            payload.variantStatus='ready';
          }
        }catch(_){payload.variantStatus='error';}finally{clearTimeout(wooTimer);}
        if(location.href!==snapshotUrl)return;
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));return;
      }
      var nextScript = typeof document !== 'undefined' ? document.querySelector('script#__NEXT_DATA__') : null;
      if (nextScript && /^(www\\.)?(machka|ipekyol)\\.com\\.tr$/.test(location.hostname)) {
        var recognizedAymarka = false;
        try {
          var aymarkaData = JSON.parse(nextScript.textContent).props.pageProps.data;
          var aymarka = aymarkaData.response.product;
          if (aymarka && Array.isArray(aymarka.barcodes)) {
            recognizedAymarka = true;
            if (!Number.isSafeInteger(aymarka.id) || aymarka.id <= 0 || decodeURIComponent(location.pathname).replace(/\\/$/,'') !== '/urun/' + aymarka.routePath) throw new Error('Invalid product');
            payload.variants = aymarka.barcodes.map(function(b) {
              if (!Number.isSafeInteger(b.id) || b.id <= 0 || !Array.isArray(b.stockTypeValues)) throw new Error('Invalid barcode');
              var title = b.stockTypeValues.map(function(v){return v.name;}).filter(function(n){return typeof n === 'string' && n.trim();}).join(' / ');
              if (!title) throw new Error('Missing size');
              return {id:'aymarka:' + aymarka.id + ':' + b.id,title:title,available:null};
            });
            if (!payload.variants.length) throw new Error('Missing barcodes');
            payload.variantStatus = 'ready';
            window.ReactNativeWebView.postMessage(JSON.stringify(payload));return;
          }
        } catch (_) {
          if (recognizedAymarka) {payload.variantStatus='error';window.ReactNativeWebView.postMessage(JSON.stringify(payload));return;}
        }
      }
      // IKAS storefronts. Their page data can sit in the __NEXT_DATA__ script, in Next's
      // window.__NEXT_DATA__ or in the modern window.__IKAS_DATA__. Some stores remove the
      // script after the page loads, and after a move inside the store Next's window data still
      // describes the first page loaded, not this one. Every source carrying IKAS page data must
      // describe the product at this address - its slug is the address's last path segment, as
      // the server's reader requires - and all of them must offer the same sizes. Otherwise the
      // page gets no picker and is not saved without a size; no source is chosen over another.
      // After a move inside the store (the document's navigation entry names another address)
      // the page data may be the first page's: then only the page's own head, which the store
      // rewrites on every move, can show that this address has no product - one canonical for
      // this address and no Product in its JSON-LD. Anything else, a Product for this address
      // above all, is answered 'stale': the user may reload the page and choose again. A page
      // loaded at this address keeps the rules above, so a reload never asks for another; there,
      // as without a navigation entry, a Product in the head that no page data describes is
      // an error, never a save without a size.
      var ikasSources = [], ikasBroken = false;
      var ikasAdd = function(props, query){if (props && typeof props === 'object' && 'pageSpecificData' in props) ikasSources.push({props:props,query:query});};
      var ikasScripts = typeof document.querySelectorAll === 'function' ? Array.from(document.querySelectorAll('script#__NEXT_DATA__')) : [];
      if (!ikasScripts.length && nextScript) ikasScripts = [nextScript];
      ikasScripts.forEach(function(script){
        try {var data = JSON.parse(script.textContent);ikasAdd(data && data.props && data.props.pageProps, data && data.query);} catch (_) {ikasBroken = true;}
      });
      var nextWindow = window.__NEXT_DATA__, modernIkas = window.__IKAS_DATA__;
      if (nextWindow && typeof nextWindow === 'object') ikasAdd(nextWindow.props && nextWindow.props.pageProps, nextWindow.query);
      if (modernIkas && typeof modernIkas === 'object' && modernIkas.pageType === 'PRODUCT')
        ikasSources.push({props:{pageType:'PRODUCT',pageSpecificData:modernIkas.pageSpecificData,configJson:modernIkas.storefrontConfig}});
      var ikasShape = function(source){var d = source.props.pageSpecificData;return !!d && typeof d === 'object' && Array.isArray(d.variants) && Array.isArray(d.variantTypes);};
      var ikasProduct = function(source){return ikasShape(source) && source.props.pageSpecificData.variants.length > 1;};
      var ikasUuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i, ikasSlug = '';
      try {ikasSlug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');} catch (_) {}
      var ikasForHere = function(source){var d = source.props.pageSpecificData;
        return ikasShape(source) && (source.props.pageType === undefined || source.props.pageType === 'PRODUCT') && !!ikasSlug && !!d.metaData &&
          d.metaData.slug === ikasSlug && !(source.query && typeof source.query.slug === 'string' && source.query.slug !== ikasSlug);};
      var ikasVerdict = null;
      if (ikasSources.length) {
        var ikasPath = function(href){var u = new URL(href, snapshotUrl), p = u.pathname.replace(/[/]+$/, '');try {p = decodeURIComponent(p);} catch (_) {}return u.origin + p;};
        var ikasAt = function(href){try {return typeof href === 'string' && ikasPath(href) === ikasPath(snapshotUrl);} catch (_) {return false;}};
        var ikasMoved = null;
        try {var ikasNav = performance.getEntriesByType('navigation')[0];if (ikasNav && typeof ikasNav.name === 'string') ikasMoved = !ikasAt(ikasNav.name);} catch (_) {}
        var ikasLd = {count:0, here:0, unknown:false};
        var ikasWalk = function(v){if (Array.isArray(v)) {v.forEach(ikasWalk);return;} if (!v || typeof v !== 'object') return;
          var types = [].concat(v['@type']);
          if (types.indexOf('Product') >= 0 || types.indexOf('ProductGroup') >= 0) {ikasLd.count++;
            var offers = [].concat(v.offers).filter(function(o){return !!o && typeof o === 'object';});
            if (offers.length && offers.every(function(o){return ikasAt(o.url);})) ikasLd.here++;}
          if (v['@graph']) ikasWalk(v['@graph']);};
        Array.from(document.querySelectorAll('script[type="application/ld+json"]')).forEach(function(s){try {ikasWalk(JSON.parse(s.textContent));} catch (_) {ikasLd.unknown = true;}});
        var ikasCanonicals = Array.from(document.querySelectorAll('link[rel="canonical"]'));
        // This address, as the head states it: a page without a product, or one product.
        var ikasPlainPage = !ikasLd.unknown && !ikasLd.count && ikasCanonicals.length === 1 && ikasAt(ikasCanonicals[0].getAttribute('href'));
        var ikasShowsHere = !ikasLd.unknown && ikasLd.count === 1 && ikasLd.here === 1;
        if (ikasSources.some(ikasProduct)) {
          try {
            if (ikasBroken) throw new Error('Unreadable page data');
            var ikasOffers = ikasSources.map(function(source){
              var ikas = source.props.pageSpecificData, locations = source.props.configJson && source.props.configJson.stockLocationIds, seen = {};
              if (!ikasProduct(source) || !ikasForHere(source)) throw new Error('Another page');
              if (!ikasUuid.test(String(ikas.id))) throw new Error('Invalid product');
              var rows = ikas.variants.filter(function(v){return !v || v.deleted !== true;}).map(function(v){
                if (!v || !ikasUuid.test(String(v.id)) || seen[v.id] || v.productId !== ikas.id || !Array.isArray(v.variantValues)) throw new Error('Invalid variant');
                seen[v.id] = true;
                var label = v.variantValues.map(function(o){return o && o.name;}).filter(function(n){return typeof n === 'string' && n.trim();}).join(' / ');
                if (!label) throw new Error('Missing option label');
                var quantity = 0, known = Array.isArray(locations) && locations.length > 0 && Array.isArray(v.stocks);
                if (known) locations.forEach(function(id){var stock=v.stocks.find(function(s){return s && s.stockLocationId===id;});if(!stock || !Number.isFinite(stock.stockCount)) known=false;else quantity+=stock.stockCount;});
                return {id:'ikas:' + ikas.id + ':' + v.id,title:label,available:known ? v.isActive === true && quantity > 0 : null};
              });
              if (!rows.length) throw new Error('No sizes');
              return JSON.stringify(rows);
            });
            if (ikasOffers.some(function(rows){return rows !== ikasOffers[0];})) throw new Error('Page data disagree');
            payload.variants = JSON.parse(ikasOffers[0]);
            ikasVerdict = 'ready';
          } catch (e) {
            // Data of another page after a move is stale, unless this address has no product.
            ikasVerdict = e && e.message === 'Another page' && ikasMoved === true ? (ikasPlainPage ? null : 'stale') : 'error';
          }
        } else if (!ikasSources.some(ikasForHere)) {
          // The home page's, a category's or another product's data: a move to a product page
          // waits for a reload. A product this address shows in its head while no page data
          // describes any product is never saved without its size, moved or not.
          if (ikasMoved === true) ikasVerdict = ikasPlainPage ? null : 'stale';
          else if (ikasShowsHere && !ikasSources.some(ikasShape)) ikasVerdict = 'error';
        }
      }
      if (ikasVerdict) {
        payload.variantStatus = ikasVerdict;
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        return;
      }
      if (typeof document.querySelectorAll === 'function') {
        try {
          var products = [];
          var walk = function(value) {if(Array.isArray(value)){value.forEach(walk);return;}if(!value || typeof value !== 'object')return;if(value['@type'] === 'Product')products.push(value);if(value['@graph'])walk(value['@graph']);};
          Array.from(document.querySelectorAll('script[type="application/ld+json"]')).forEach(function(script){try{walk(JSON.parse(script.textContent));}catch(_) {}});
          var offers = products.length === 1 && products[0].offers;
          var base = new URL(snapshotUrl);
          var same = function(value) {try {var u=new URL(value,base);return u.origin === base.origin && u.pathname.replace(/\\/$/,'') === base.pathname.replace(/\\/$/,'');}catch(_){return false;}};
          var canonicals = Array.from(document.querySelectorAll('link[rel="canonical"]'));
          if(Array.isArray(offers) && offers.length > 1 && offers.length <= 250 && canonicals.length === 1 && same(canonicals[0].href) &&
            offers.every(function(o){return o && o['@type'] === 'Offer' && typeof o.sku === 'string' && /^[A-Za-z0-9_.-]{1,120}$/.test(o.sku) && same(o.url);}) &&
            new Set(offers.map(function(o){return o.sku;})).size === offers.length) {
            var mapped = offers.map(function(o) {
              var u = new URL(o.url,base), labels=[];
              // Shopify's ?variant=<id> is an opaque id, not a label; without a real
              // label the Shopify product data below supplies the size names.
              u.searchParams.forEach(function(value,key){if(!/^(utm_|gclid|fbclid|variant$)/i.test(key))labels.push(key + ': ' + value);});
              var name = labels.join(' / ') || o.name;
              var state = String(o.availability || '').replace(/^https?:\\/\\/schema\\.org\\//i,'');
              return {id:'offer:' + o.sku,title:name,url:u.toString(),available:state === 'InStock' ? true : /^(OutOfStock|SoldOut|Discontinued)$/.test(state) ? false : null};
            });
            if(mapped.every(function(v){return typeof v.title === 'string' && v.title.trim() && v.title.length <= 300;})) {
              payload.variants=mapped;payload.variantStatus='ready';
              window.ReactNativeWebView.postMessage(JSON.stringify(payload));return;
            }
          }
        } catch (_) { /* No complete SKU choices; preserve metadata capture. */ }
      }
      var match = location.pathname.match(/^(.*?)(?:\\/collections\\/[^/]+)?\\/products\\/([^/]+)\\/?$/);
      if (match) {
        var controller = new AbortController();
        var timer = setTimeout(function(){ controller.abort(); }, 5000);
        try {
          var response = await fetch(match[1] + '/products/' + match[2] + '.js', {signal: controller.signal});
          if (!response.ok) throw new Error('Product unavailable');
          var product = await response.json();
          if (!product.id || product.handle !== decodeURIComponent(match[2]) || !Array.isArray(product.variants)) throw new Error('Invalid product');
          payload.variantStatus = 'ready';
          payload.variants = product.variants.map(function(v){return {id:String(v.id),title:v.title,available:v.available};});
        } catch (_) {
          if (window.Shopify) payload.variantStatus = 'error';
        } finally { clearTimeout(timer); }
      }
      if (location.href !== snapshotUrl) return;
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    })();
  `);
}
