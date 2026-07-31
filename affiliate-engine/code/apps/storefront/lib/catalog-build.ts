import { createAliExpressClient, createMockTransport } from '@affiliate/aliexpress-api';
import type { RawProduct } from '@affiliate/aliexpress-api';
import {
  curateCatalog,
  dedupeProducts,
  enumeratePages,
  normalizeProducts,
  rankProducts,
} from '@affiliate/catalog';
import type { CatalogProduct, CategoryBrandPage } from '@affiliate/catalog';
import { dataMode } from './site.ts';

/**
 * Builds the whole storefront catalog once, in the sync step.
 *
 * The same code path serves both modes: with credentials it queries the live
 * gateway, without them it queries the fixture transport. Nothing downstream
 * knows which, which is what lets the site be built, styled and deployed
 * before the affiliate account is approved.
 *
 * This module runs in the sync script only, never at request time. The site
 * and the redirect both read the artifact it writes — so a click costs one
 * lookup in a preloaded map rather than a call to the marketplace.
 */

const transport =
  dataMode === 'live' && process.env.ALIEXPRESS_APP_KEY
    ? liveTransport()
    : createMockTransport();

const client = createAliExpressClient({
  appKey: process.env.ALIEXPRESS_APP_KEY ?? 'preview',
  appSecret: process.env.ALIEXPRESS_APP_SECRET ?? 'preview',
  trackingId: process.env.ALIEXPRESS_TRACKING_ID ?? 'preview',
  now: () => Date.now(),
  transport,
  defaults: { shipToCountry: 'IL', targetCurrency: 'USD', targetLanguage: 'HE' },
});

function liveTransport() {
  return async (url: string, body: string): Promise<unknown> => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    return response.json();
  };
}

export interface BuiltPage {
  page: CategoryBrandPage;
  products: CatalogProduct[];
  /** Rejection tally, surfaced in the console so a broken filter is visible. */
  rejectionCounts: Record<string, number>;
}

let cache: Map<string, BuiltPage> | null = null;

export async function buildCatalog(): Promise<Map<string, BuiltPage>> {
  if (cache) return cache;

  const built = new Map<string, BuiltPage>();

  for (const page of enumeratePages()) {
    const raws: RawProduct[] = [];

    for (const term of page.queryTerms) {
      const result = await client.queryProducts({ keywords: term, pageSize: 40 });
      raws.push(...result.products);
    }

    // The same listing answers several search terms, so it arrives more than
    // once; keep the first sighting of each id before anything else runs.
    const unique = new Map<string, RawProduct>();
    for (const raw of raws) {
      const id = raw.product_id !== undefined ? String(raw.product_id) : '';
      if (id && !unique.has(id)) unique.set(id, raw);
    }

    const { products } = normalizeProducts([...unique.values()]);
    const curated = curateCatalog(products);
    const ranked = rankProducts(dedupeProducts(curated.admitted));

    built.set(page.slug, {
      page,
      products: ranked,
      rejectionCounts: curated.rejectionCounts,
    });
  }

  cache = built;
  return built;
}

