type Scope = { type: string; parent?: Scope; props: Record<string, string[]> };
export type StockMetadata = { products: Scope[]; offers: Scope[]; canonicals: string[]; complete: boolean };

// Use Bun's HTML parser, not a page-wide regex that mixes recommended products.
export function readStockMicrodata(html: string): StockMetadata {
  const scopes: Scope[] = [], stack: Scope[] = [], canonicals: string[] = [];
  let templateDepth = 0;
  let urlCapture: { scope: Scope; value: string } | null = null;
  const add = (scope: Scope, key: string, value: string) => (scope.props[key] ??= []).push(value);
  new HTMLRewriter().on('template', { element(el) { templateDepth++; el.onEndTag(() => { templateDepth--; }); } }).on('[itemscope]', {
    element(el) {
      if (templateDepth) return;
      const scope: Scope = { type: (el.getAttribute('itemtype') ?? '').replace(/^https?:\/\/schema.org\//, ''), parent: stack.at(-1), props: {} };
      scopes.push(scope); stack.push(scope);
      el.onEndTag(() => { if (stack.at(-1) === scope) stack.pop(); });
    },
  }).on('[itemprop]', {
    element(el) {
      if (templateDepth) return;
      const scope = stack.at(-1), key = el.getAttribute('itemprop') ?? '';
      if (!scope || !['price', 'priceCurrency', 'availability', 'url'].includes(key)) return;
      const value = el.getAttribute('content') ?? el.getAttribute('href');
      if (value !== null) { add(scope, key, value); return; }
      if (key === 'url' && el.canHaveContent) {
        const capture = { scope, value: '' }; urlCapture = capture;
        el.onEndTag(() => { add(scope, key, capture.value.trim()); if (urlCapture === capture) urlCapture = null; });
      }
    },
  }).on('[itemprop="url"]', { text(chunk) { if (urlCapture && !templateDepth) urlCapture.value += chunk.text; } })
    .on('link[rel="canonical"]', { element(el) { const href = el.getAttribute('href'); if (href && !templateDepth) canonicals.push(href); } })
    .transform(html);
  return { products: scopes.filter(s => s.type === 'Product'), offers: scopes.filter(s => s.type === 'Offer'), canonicals, complete: stack.length === 0 };
}
