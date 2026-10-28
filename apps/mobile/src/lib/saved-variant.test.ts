import { describe, expect, test } from 'bun:test';
// Saf TypeScript — `bun test` çalıştırabilir. Beden okuma betiği sahte bir
// mağaza sayfasında gerçekten çalıştırılır; gönderdiği mesaj doğrulanır.
import { variantCaptureScript } from './saved-variant';

const SEND = 'window.ReactNativeWebView.postMessage(JSON.stringify(payload));';
const METADATA = `var payload = { url: location.href }; ${SEND}`;

type Page = {
  url: string;
  ldJson?: unknown;
  canonical?: string;
  shopify?: boolean;
  // Shopify'ın /products/<handle>.js yanıtı
  productJs?: unknown;
};

type Payload = { variants?: unknown; variantStatus?: string };

function capture(page: Page): Promise<Payload> {
  return new Promise((resolve, reject) => {
    const loc = new URL(page.url);
    const location = { href: page.url, hostname: loc.hostname, pathname: loc.pathname };
    const scripts = page.ldJson ? [{ textContent: JSON.stringify(page.ldJson) }] : [];
    const links = page.canonical ? [{ href: page.canonical }] : [];
    const document = {
      body: { classList: { contains: () => false } },
      querySelector: () => null,
      querySelectorAll: (selector: string) =>
        selector.includes('ld+json') ? scripts : selector.includes('canonical') ? links : [],
    };
    const window: Record<string, unknown> = {
      ReactNativeWebView: { postMessage: (message: string) => resolve(JSON.parse(message)) },
    };
    if (page.shopify) window.Shopify = { shop: `${loc.hostname}` };
    const fetch = async (url: string) =>
      page.productJs && url === `${loc.pathname}.js`
        ? { ok: true, json: async () => page.productJs }
        : { ok: false, json: async () => ({}) };
    setTimeout(() => reject(new Error('betik mesaj göndermedi')), 2000);
    new Function('window', 'document', 'location', 'fetch', variantCaptureScript(METADATA, 'r1'))(
      window,
      document,
      location,
      fetch,
    );
  });
}

describe('variantCaptureScript', () => {
  // ACE NAYMAN (Shopify): JSON-LD tekliflerinde beden adı yok, adreslerde yalnız
  // Shopify'ın ?variant=<numara> parametresi var. Beden adları Shopify ürün verisinde.
  test('Shopify sayfasında beden adlarını numara yerine Shopify verisinden alır', async () => {
    const payload = await capture({
      url: 'https://acenayman.com/products/252352',
      canonical: 'https://acenayman.com/products/252352',
      shopify: true,
      ldJson: {
        '@context': 'http://schema.org/',
        '@type': 'Product',
        name: 'Stacy Grey Graphic Swimsuit',
        url: 'https://acenayman.com/products/252352',
        offers: [
          {
            '@type': 'Offer',
            sku: '102_252352',
            availability: 'http://schema.org/OutOfStock',
            price: 1507.5,
            priceCurrency: 'TRY',
            url: 'https://acenayman.com/products/252352?variant=46296369561814',
          },
          {
            '@type': 'Offer',
            sku: '103_252352',
            availability: 'http://schema.org/InStock',
            price: 1507.5,
            priceCurrency: 'TRY',
            url: 'https://acenayman.com/products/252352?variant=46317981466838',
          },
          {
            '@type': 'Offer',
            sku: '104_252352',
            availability: 'http://schema.org/OutOfStock',
            price: 1507.5,
            priceCurrency: 'TRY',
            url: 'https://acenayman.com/products/252352?variant=46317981499606',
          },
        ],
      },
      productJs: {
        id: 8765432109876,
        handle: '252352',
        variants: [
          { id: 46296369561814, title: 'XS', available: false },
          { id: 46317981466838, title: 'S', available: true },
          { id: 46317981499606, title: 'M', available: false },
        ],
      },
    });

    expect(payload.variantStatus).toBe('ready');
    expect(payload.variants).toEqual([
      { id: '46296369561814', title: 'XS', available: false },
      { id: '46317981466838', title: 'S', available: true },
      { id: '46317981499606', title: 'M', available: false },
    ]);
  });

  test('Shopify olmayan sitede anlamlı adres parametresini beden etiketi yapar', async () => {
    const payload = await capture({
      url: 'https://ornek-butik.com/urun/elbise',
      canonical: 'https://ornek-butik.com/urun/elbise',
      ldJson: {
        '@type': 'Product',
        name: 'Elbise',
        offers: [
          {
            '@type': 'Offer',
            sku: 'EL-1',
            availability: 'https://schema.org/InStock',
            url: 'https://ornek-butik.com/urun/elbise?renk=kirmizi',
          },
          {
            '@type': 'Offer',
            sku: 'EL-2',
            availability: 'https://schema.org/OutOfStock',
            url: 'https://ornek-butik.com/urun/elbise?renk=mavi',
          },
        ],
      },
    });

    expect(payload.variantStatus).toBe('ready');
    expect(payload.variants).toEqual([
      {
        id: 'offer:EL-1',
        title: 'renk: kirmizi',
        url: 'https://ornek-butik.com/urun/elbise?renk=kirmizi',
        available: true,
      },
      {
        id: 'offer:EL-2',
        title: 'renk: mavi',
        url: 'https://ornek-butik.com/urun/elbise?renk=mavi',
        available: false,
      },
    ]);
  });
});
