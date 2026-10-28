import { describe, expect, test } from 'bun:test';
import { canonicalizeProductUrl } from './canonicalize-url';

describe('canonicalizeProductUrl', () => {
  test('removes generic tracking parameters', () => {
    const result = canonicalizeProductUrl(
      'https://example.com/product?id=15&utm_source=instagram&fbclid=test',
    );

    expect(result.canonicalUrl).toBe(
      'https://example.com/product?id=15',
    );

    expect(result.domain).toBe('example.com');
    expect(result.sourceProductId).toBeNull();
  });

  test('preserves potentially meaningful product parameters', () => {
    const result = canonicalizeProductUrl(
      'https://example.com/product?variant=black&utm_campaign=test',
    );

    expect(result.canonicalUrl).toBe(
      'https://example.com/product?variant=black',
    );
  });

  test('normalizes a Zara product URL', () => {
    const result = canonicalizeProductUrl(
      'https://www.zara.com/tr/tr/80-kaz-tuyu---20-tuy-karisimli-su-gecirmez-mont-p03411001.html?v1=?v1=551082768&v2=2732942',
    );

    expect(result.canonicalUrl).toBe(
      'https://www.zara.com/tr/tr/80-kaz-tuyu---20-tuy-karisimli-su-gecirmez-mont-p03411001.html',
    );

    expect(result.domain).toBe('zara.com');
    expect(result.sourceProductId).toBe('03411001');
  });

  test('removes fragments', () => {
    const result = canonicalizeProductUrl(
      'https://example.com/product#reviews',
    );

    expect(result.canonicalUrl).toBe(
      'https://example.com/product',
    );
  });

  test('rejects invalid URLs', () => {
    expect(() => canonicalizeProductUrl('not-a-url')).toThrow();
  });
});