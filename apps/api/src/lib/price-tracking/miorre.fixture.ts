// A trimmed Miorre product page, keeping the DOM relations the reader depends on
// from the page saved 2026-09-21 (/p/48150): the main product-detail-box holding the
// product-code and the product-prices block, the add-to-basket box that is a
// product-detail-box as well and repeats the code in its hidden form fields, the
// mobile bar that states the old price in a span and the current price as its own
// text, the social-links box, and the single empty variant-prodCode field that marks
// this page as the variant-less shape the reader was written for.
export type MiorrePageOptions = {
  code?: string;
  old?: string | null;
  sale?: string | null;
  saleInner?: string;
  saleCount?: number;
  priceBlocks?: number;
  mobileOld?: string | null;
  mobileSale?: string | null;
  mobileInner?: string;
  mobileBars?: number;
  postedCode?: string | null;
  baseType?: string | null;
  variantField?: string | null;
  variantFields?: number;
  inMainBox?: string;
  extra?: string;
  bodyClass?: string;
};

export const MIORRE_URL = 'https://www.miorre.com.tr/K%C4%B0%C5%9E%C4%B0SEL-BAKIM/C%C4%B0LT-BAKIM/'
  + 'G%C3%BCne%C5%9F-%C3%9Cr%C3%BCnleri/Pierre-Cardin-G%C3%BCne%C5%9F-Ya%C4%9F%C4%B1---125-ML/p/48150';

export function miorrePage(options: MiorrePageOptions = {}): string {
  const { code = '48150', old = '191,00 TL', sale = '153,00 TL', saleInner, saleCount = 1, priceBlocks = 1,
    mobileOld = '191,00 TL', mobileSale = '153,00 TL', mobileInner, mobileBars = 1,
    postedCode = code, baseType = '00', variantField = '', variantFields = 1, inMainBox = '', extra = '',
    bodyClass = 'page-productDetails pageType-ProductPage template-pages-product-productLayout1Page  language-tr current-site-MITR' } = options;
  // The page writes every amount across three lines; the reader has to tolerate it.
  const spread = (amount: string) => amount.replace(' ', '\n                ');
  const crossed = old === null ? '' : `<div class="pi-price-cross"><span>${spread(old)}\n            </span></div>`;
  const inner = saleInner ?? (sale === null ? null : `<span>${spread(sale)}\n            </span>`);
  const current = inner === null ? '' : `<div class="pi-price-sale">${inner}</div>`;
  const prices = `<div class="product-prices js-variant-price-update">
            ${crossed}
            ${current.repeat(saleCount)}
        </div>`;
  // The two hidden fields the add-to-basket forms post, in both layouts.
  const posted = `${postedCode === null ? '' : `<input type="hidden" name="productCodePost" value="${postedCode}"/>`}
    ${baseType === null ? '' : `<input type="hidden" name="baseType" value="${baseType}"/>`}`;
  const form = (action: string) => `<form id="configureForm" class="configure_form" action="${action}" method="post">
  ${posted}
          <button type="submit" class="btn btn-primary btn-block js-add-to-cart" disabled="disabled">Sepete Ekle</button>
          </form>`;
  const counter = `<div class="add-to-basket-counter">
            <div class="form-group atb-counter js-qty-selector"><input class="form-control js-qty-selector-input " type="number" value="1"  max="253" min="1" name="pdpAddtoCartInput"/></div>
        </div>`;
  const bar = `<div class="fixed-bottom hidden-md hidden-lg">
                    <div class="add-to-basket">
                        <div class="fixed-bottom-price js-variant-price-update-mobile">${mobileInner ?? `
                                ${mobileOld === null ? '' : `<span>${spread(mobileOld)}\n            </span>`}
                                        ${mobileSale === null ? '' : spread(mobileSale)}
            `}</div>
                        ${counter}
    <div class="add-to-basket-button">${form(`/tr/Pierre-Cardin/p/${code}`)}</div>
                    </div></div>`;
  return `<!DOCTYPE html><html lang="tr"><head><title>Pierre Cardin Güneş Yağı - 125 ML</title></head>
<body class="${bodyClass}"><div class="row">
                <div class="product-detail-box">
                    <div class="product-code" data-product-code="${code}">
                        ${code}<a class="tab-selector" href="#" rel="product-tab-comments">
                            <div class="product-comment-box">Yorum: &nbsp;<span>0</span></div>
                        </a>
                    </div>
                    <div class="product-title">Pierre Cardin Güneş Yağı - 125 ML</div>
                    ${prices.repeat(priceBlocks)}
                    ${inMainBox}
                </div>

                <div class="yCmsContentSlot product-detail-box hidden-xs hidden-sm">
<div class="yCmsComponent add-to-basket">
${counter}
    <div class="add-to-basket-button">${form(`/tr/Pierre-Cardin/p/${code}`)}</div>
<hr /></div></div>${bar.repeat(mobileBars)}

                <!-- SOCIAL-MEDIA BUTTONS START -->
                <div class="product-detail-box">
                    <ul class="social-area">
                        <li><a href="https://www.facebook.com/sharer.php?u=${encodeURIComponent(MIORRE_URL)}" class="im im-facebook"><span></span></a></li>
                        <li><a href="https://twitter.com/intent/tweet?text=Miorre" data-size="large" class="im im-twitter"><span></span></a></li>
                    </ul>
                </div>
                <!-- SOCIAL-MEDIA BUTTONS END -->
            </div>
${extra}
<div class="modal fade" id="stockModal"><div class="modal-body">Ürün stokta bulunmamaktadır.</div></div>
${(variantField === null ? '' : `<input type="hidden" id="variant-prodCode"${variantField === '' ? '' : ` value="${variantField}"`}/>`).repeat(variantFields)}
</body></html>`;
}

// A recommended product of the store, as the carousels below the page render it.
export function miorreRecommendation(code: string | null, sale: string | null, boxClass = 'product-item'): string {
  return `<div class="${boxClass}">
  ${code === null ? '' : `<div class="product-code" data-product-code="${code}">${code}</div>`}
  ${sale === null ? '' : `<div class="product-prices"><div class="pi-price-sale"><span>${sale}</span></div></div>`}
</div>`;
}
