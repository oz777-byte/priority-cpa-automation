import type { CatalogProduct } from './normalize.ts';

/**
 * Admission and ranking for the storefront.
 *
 * The store's promise to a visitor is a narrow one — Choice listings, from
 * stores with a real track record — and a promise that only holds most of the
 * time is worse than no promise, because a single bad order costs the trust
 * that every other listing depends on. So admission is a hard filter and every
 * rejection carries a reason.
 */

export interface CurationRules {
  /** Choice listings only. The store's entire premise. */
  requireChoice: boolean;
  /** Minimum positive-feedback percentage for the seller. */
  minShopRating: number;
  /** Minimum recent order volume, as evidence the listing actually ships. */
  minRecentOrders: number;
  /** Below this, the commission cannot repay the click that earned it. */
  minCommissionRate: number;
  /** Guards against listings that are cheap because they are junk. */
  minSalePriceMinor: number;
  /** Guards against a price so high the conversion rate collapses. */
  maxSalePriceMinor: number;
}

export const DEFAULT_CURATION_RULES: CurationRules = {
  requireChoice: true,
  minShopRating: 95,
  minRecentOrders: 300,
  minCommissionRate: 0.05,
  minSalePriceMinor: 300, // $3.00
  maxSalePriceMinor: 15000, // $150.00
};

export type RejectReason =
  | 'not_choice'
  | 'shop_rating_too_low'
  | 'too_few_orders'
  | 'commission_too_low'
  | 'price_out_of_range'
  | 'missing_price';

export interface CurationVerdict {
  product: CatalogProduct;
  admitted: boolean;
  reasons: RejectReason[];
}

export function curateProduct(
  product: CatalogProduct,
  rules: CurationRules = DEFAULT_CURATION_RULES,
): CurationVerdict {
  const reasons: RejectReason[] = [];

  if (rules.requireChoice && !product.isChoice) reasons.push('not_choice');

  if (product.shopRating === null || product.shopRating < rules.minShopRating) {
    reasons.push('shop_rating_too_low');
  }
  if (product.recentOrders < rules.minRecentOrders) reasons.push('too_few_orders');

  if (product.commissionRate === null || product.commissionRate < rules.minCommissionRate) {
    reasons.push('commission_too_low');
  }

  if (product.salePriceMinor === null) {
    reasons.push('missing_price');
  } else if (
    product.salePriceMinor < rules.minSalePriceMinor ||
    product.salePriceMinor > rules.maxSalePriceMinor
  ) {
    reasons.push('price_out_of_range');
  }

  return { product, admitted: reasons.length === 0, reasons };
}

export interface CurationResult {
  admitted: CatalogProduct[];
  rejected: CurationVerdict[];
  /** Rejections by reason, so a filter that is quietly eating the catalog shows up. */
  rejectionCounts: Record<RejectReason, number>;
}

export function curateCatalog(
  products: CatalogProduct[],
  rules: CurationRules = DEFAULT_CURATION_RULES,
): CurationResult {
  const admitted: CatalogProduct[] = [];
  const rejected: CurationVerdict[] = [];
  const rejectionCounts = {
    not_choice: 0,
    shop_rating_too_low: 0,
    too_few_orders: 0,
    commission_too_low: 0,
    price_out_of_range: 0,
    missing_price: 0,
  } satisfies Record<RejectReason, number>;

  for (const product of products) {
    const verdict = curateProduct(product, rules);
    if (verdict.admitted) {
      admitted.push(verdict.product);
    } else {
      rejected.push(verdict);
      for (const reason of verdict.reasons) rejectionCounts[reason] += 1;
    }
  }

  return { admitted, rejected, rejectionCounts };
}

/**
 * Expected earnings from one listing per hundred visitors, in minor units.
 *
 * Ranking on commission alone promotes expensive items nobody buys; ranking on
 * order volume alone promotes cheap items that earn nothing. The product of
 * the two is what a listing is actually worth on a page, and order volume is
 * damped with a logarithm so a single viral item cannot bury the rest of the
 * catalog beneath it.
 */
export function listingValue(product: CatalogProduct): number {
  if (product.estimatedCommissionMinor === null) return 0;
  const demand = Math.log10(Math.max(product.recentOrders, 1) + 1);
  const trust = product.shopRating !== null ? product.shopRating / 100 : 0.9;
  return product.estimatedCommissionMinor * demand * trust;
}

/** Ranks by expected value, breaking ties on order volume then id for stability. */
export function rankProducts(products: CatalogProduct[]): CatalogProduct[] {
  return [...products].sort((a, b) => {
    const diff = listingValue(b) - listingValue(a);
    if (diff !== 0) return diff;
    if (b.recentOrders !== a.recentOrders) return b.recentOrders - a.recentOrders;
    return a.productId.localeCompare(b.productId);
  });
}

/**
 * Collapses near-duplicate listings.
 *
 * Marketplace search returns the same accessory from a dozen resellers, and a
 * page showing all twelve reads as spam. Grouping on the title's distinctive
 * words keeps the best-ranked one and drops the rest.
 */
export function dedupeProducts(products: CatalogProduct[]): CatalogProduct[] {
  const seen = new Map<string, CatalogProduct>();

  for (const product of rankProducts(products)) {
    const key = titleFingerprint(product.title);
    if (!seen.has(key)) seen.set(key, product);
  }

  return [...seen.values()];
}

const STOPWORDS = new Set([
  'for', 'the', 'and', 'with', 'new', 'hot', 'pcs', 'pack', 'free', 'shipping',
  'high', 'quality', 'original', 'universal', 'fashion', 'luxury', 'case',
]);

export function titleFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word))
    .slice(0, 6)
    .sort()
    .join('-');
}
