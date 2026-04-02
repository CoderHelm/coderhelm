/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  experimental: {
    inlineCss: true,
  },
  turbopack: {
    resolveAlias: {
      "../build/polyfills/polyfill-module": "./src/empty-polyfill.js",
      "../build/polyfills/polyfill-module.js": "./src/empty-polyfill.js",
    },
  },
};

module.exports = nextConfig;
