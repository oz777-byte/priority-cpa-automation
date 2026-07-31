import type { MetadataRoute } from 'next';
import { publishablePages } from '../lib/catalog';
import { MIN_PRODUCTS_TO_INDEX, isPreview, site } from '../lib/site';

// Required by `output: export`: these routes are emitted as files at build time.
export const dynamic = 'force-static';

/**
 * Only pages that are actually indexable reach the sitemap. Listing a page that
 * carries a noindex tag asks search engines to crawl something we have already
 * told them to ignore, which wastes crawl budget on the pages that matter.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date(process.env.BUILD_DATE ?? '2026-07-31T00:00:00Z');

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${site.baseUrl}/`, lastModified, changeFrequency: 'daily', priority: 1 },
    { url: `${site.baseUrl}/disclosure`, lastModified, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${site.baseUrl}/privacy`, lastModified, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${site.baseUrl}/terms`, lastModified, changeFrequency: 'monthly', priority: 0.3 },
  ];

  if (isPreview) return staticPages;

  const pages = publishablePages();
  const catalogPages: MetadataRoute.Sitemap = pages
    .filter((entry) => entry.products.length >= MIN_PRODUCTS_TO_INDEX)
    .map((entry) => ({
      url: `${site.baseUrl}/${entry.page.category.slug}/${entry.page.model?.slug ?? entry.page.brand.slug}`,
      lastModified,
      changeFrequency: 'daily' as const,
      priority: entry.page.model ? 0.8 : 0.6,
    }));

  return [...staticPages, ...catalogPages];
}
