/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static: a few hundred accessory pages have no per-request logic, and
  // static files keep hosting free and time-to-first-byte flat.
  // Not a static export: the redirect at /go/[slug] needs a runtime. Every
  // catalog page is still prerendered, so hosting stays a static file read
  // for all the pages a visitor actually browses.
  // output: 'export',
  trailingSlash: true,

  // Workspace packages ship as TypeScript source rather than built output.
  transpilePackages: ['@affiliate/catalog', '@affiliate/aliexpress-api', '@affiliate/offer-schema'],

  images: { unoptimized: true },

};

export default nextConfig;
