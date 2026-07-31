import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTrackingLink } from '@affiliate/link-builder';
import { buildCatalog } from '../lib/catalog-build.ts';

/**
 * Catalog sync.
 *
 * Runs once before the site is built, queries the marketplace, applies the
 * curation rules, and writes two artifacts:
 *
 *   catalog.json — what every page renders
 *   links.json   — token to destination, read by the redirect
 *
 * Splitting sync from render is what keeps a click cheap. If the redirect
 * resolved links by calling the marketplace, every visitor would pay for a
 * round trip on the way out, and an API outage or rate limit would break
 * outbound links across the whole site rather than just delaying a refresh.
 *
 * It also mirrors the shape this takes once Supabase is connected: a job
 * writes the catalog, the site reads it.
 */

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');

const NETWORK_SLUG = 'aliexpress';

interface LinkEntry {
  token: string;
  assetSlug: string;
  placement: string;
  productId: string;
  subId: string;
  targetUrl: string;
}

async function main(): Promise<void> {
  const catalog = await buildCatalog();
  const links: Record<string, LinkEntry> = {};

  const pages = [...catalog.values()]
    .filter((entry) => entry.products.length > 0)
    .map((entry) => ({
      slug: entry.page.slug,
      categorySlug: entry.page.category.slug,
      brandSlug: entry.page.brand.slug,
      modelSlug: entry.page.model?.slug ?? null,
      titleHe: entry.page.titleHe,
      rejectionCounts: entry.rejectionCounts,
      products: entry.products.map((product, index) => {
        const placement = `table-row-${index + 1}`;

        const link = buildTrackingLink({
          destinationUrl: product.promotionLink ?? product.detailUrl,
          networkSlug: NETWORK_SLUG,
          parts: { asset: entry.page.slug, placement },
        });

        // Token is derived from page and product, so it survives a reorder:
        // a link that changed identity every sync would orphan the clicks
        // already recorded against it.
        const token = link.subId.mapToken ?? shortToken(`${entry.page.slug}.${product.productId}`);

        links[token] = {
          token,
          assetSlug: entry.page.slug,
          placement,
          productId: product.productId,
          subId: link.subId.canonical,
          targetUrl: link.url,
        };

        return { ...product, placement, linkToken: token, subId: link.subId.canonical };
      }),
    }));

  const totalProducts = pages.reduce((sum, page) => sum + page.products.length, 0);

  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, 'catalog.json'), `${JSON.stringify({ pages }, null, 2)}\n`);
  await writeFile(join(dataDir, 'links.json'), `${JSON.stringify(links, null, 2)}\n`);

  console.log(
    `sync: ${pages.length} pages, ${totalProducts} products, ${Object.keys(links).length} links`,
  );

  if (pages.length === 0) {
    // An empty catalog builds a site with nothing on it, which looks identical
    // to a successful build until someone opens it.
    console.error('sync: catalog is empty — refusing to write a site with no products');
    process.exit(1);
  }
}

/** FNV-1a, matching the link-builder token format. */
function shortToken(input: string): string {
  const hash = (seed: string): string => {
    let value = 0x811c9dc5;
    for (let i = 0; i < seed.length; i += 1) {
      value ^= seed.charCodeAt(i);
      value = Math.imul(value, 0x01000193) >>> 0;
    }
    return (value >>> 0).toString(36).padStart(7, '0');
  };
  return `hx${hash(input)}${hash(`${input}#salt`)}`;
}

await main();
