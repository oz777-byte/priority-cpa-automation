import type { CatalogProduct, CategoryBrandPage } from '@affiliate/catalog';
import { findBrand, findCategory } from '@affiliate/catalog';
import catalogData from '../data/catalog.json';
import linkData from '../data/links.json';

/**
 * Read side of the catalog: the site and the redirect both load the artifact
 * the sync step wrote. Nothing here talks to the marketplace.
 */

export interface StoredProduct extends CatalogProduct {
  placement: string;
  linkToken: string;
  /** Precomputed so a card never has to reconstruct it from its position. */
  subId: string;
}

interface StoredPage {
  slug: string;
  categorySlug: string;
  brandSlug: string;
  modelSlug: string | null;
  titleHe: string;
  rejectionCounts: Record<string, number>;
  products: StoredProduct[];
}

export interface LinkEntry {
  token: string;
  assetSlug: string;
  placement: string;
  productId: string;
  subId: string;
  targetUrl: string;
}

export interface BuiltPage {
  page: CategoryBrandPage;
  products: StoredProduct[];
  rejectionCounts: Record<string, number>;
}

const stored = catalogData as { pages: StoredPage[] };
export const links = linkData as Record<string, LinkEntry>;

/**
 * Rebuilds the taxonomy objects the renderer wants from the slugs the artifact
 * stores. Storing slugs rather than the whole taxonomy keeps the artifact small
 * and means a wording change in a category name does not require a resync.
 */
function hydrate(page: StoredPage): BuiltPage | null {
  const category = findCategory(page.categorySlug);
  const brand = findBrand(page.brandSlug);
  if (!category || !brand) return null;

  const model = page.modelSlug
    ? brand.models.find((candidate) => candidate.slug === page.modelSlug)
    : undefined;

  return {
    page: {
      slug: page.slug,
      titleHe: page.titleHe,
      category,
      brand,
      ...(model ? { model } : {}),
      queryTerms: [],
    },
    products: page.products,
    rejectionCounts: page.rejectionCounts,
  };
}

const bySlug = new Map<string, BuiltPage>();
for (const page of stored.pages) {
  const built = hydrate(page);
  if (built) bySlug.set(page.slug, built);
}

export function publishablePages(): BuiltPage[] {
  return [...bySlug.values()];
}

export function getPage(categorySlug: string, targetSlug: string): BuiltPage | undefined {
  return bySlug.get(`${categorySlug}-${targetSlug}`);
}

export function getLink(token: string): LinkEntry | undefined {
  return links[token];
}
