import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: ['@butika/design-tokens', '@butika/types'],
  images: {
    // Dev'de tüm CDN'lere izin ver — bazı butik siteleri (örn. Shopify
    // tabanlı love-onfriday) OG image'larını http:// üzerinden veriyor.
    // Prod'da admin.butika.app whitelist'i daha dar olur.
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
};

export default config;
