import type { RawProduct } from '@affiliate/aliexpress-api';
import { toMinor } from '@affiliate/offer-schema';

/**
 * Canonical product shape for the storefront.
 *
 * The gateway hands back prices as decimal strings, commission as a percentage
 * string that may or may not carry a `%`, and order volume under a misspelled
 * key. Every one of those is normalised exactly once, here, so nothing
 * downstream has to know what the wire looks like.
 */

export interface CatalogProduct {
  productId: string;
  title: string;
  imageUrl: string | null;
  detailUrl: string;
  /** Affiliate link, when the gateway returned one. */
  promotionLink: string | null;

  salePriceMinor: number | null;
  originalPriceMinor: number | null;
  currency: string;
  discountPercent: number | null;

  /** Commission as a ratio, so 9% is 0.09. */
  commissionRate: number | null;
  /** Estimated commission on one sale, in minor units. */
  estimatedCommissionMinor: number | null;

  categoryId: string | null;
  categoryName: string | null;

  shopId: string | null;
  shopName: string | null;
  /** Positive-feedback percentage, 0-100. */
  shopRating: number | null;
  recentOrders: number;

  isChoice: boolean;
  tags: string[];
}

export class NormalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NormalizeError';
  }
}

export interface NormalizeOptions {
  /** Currency to assume when the gateway omits it. */
  defaultCurrency?: string;
  /**
   * Tag values that mark a listing as part of the Choice programme.
   *
   * Kept configurable and case-insensitive because the marker has moved
   * between fields and spellings before. If it moves again, the fix is a
   * config change rather than a code change — and `isChoice` returning false
   * for everything is the visible symptom, not silent bad data.
   */
  choiceTags?: string[];
}

export const DEFAULT_CHOICE_TAGS = ['choice', 'aechoice', 'ae_choice', 'choicedelivery'];

export function normalizeProduct(raw: RawProduct, options: NormalizeOptions = {}): CatalogProduct {
  const productId = raw.product_id !== undefined ? String(raw.product_id) : '';
  if (!productId) {
    throw new NormalizeError('product is missing product_id, so it cannot be tracked or deduplicated');
  }

  const title = (raw.product_title ?? '').trim();
  if (!title) {
    throw new NormalizeError(`product ${productId} has no title`);
  }

  const detailUrl = raw.product_detail_url ?? '';
  if (!detailUrl) {
    throw new NormalizeError(`product ${productId} has no detail url, so no link can be built`);
  }

  const currency = (
    raw.target_sale_price_currency ??
    raw.sale_price_currency ??
    raw.original_price_currency ??
    options.defaultCurrency ??
    'USD'
  ).toUpperCase();

  const salePriceMinor = parsePrice(raw.target_sale_price ?? raw.sale_price, currency);
  const originalPriceMinor = parsePrice(raw.target_original_price ?? raw.original_price, currency);
  const commissionRate = parsePercent(raw.commission_rate);

  const tags = parseTags(raw.product_tags);
  const choiceTags = (options.choiceTags ?? DEFAULT_CHOICE_TAGS).map((tag) => tag.toLowerCase());

  return {
    productId,
    title,
    imageUrl: raw.product_main_image_url ?? null,
    detailUrl,
    promotionLink: raw.promotion_link ?? null,

    salePriceMinor,
    originalPriceMinor,
    currency,
    discountPercent: computeDiscount(raw.discount, salePriceMinor, originalPriceMinor),

    commissionRate,
    estimatedCommissionMinor:
      salePriceMinor !== null && commissionRate !== null
        ? Math.round(salePriceMinor * commissionRate)
        : null,

    categoryId: raw.first_level_category_id !== undefined ? String(raw.first_level_category_id) : null,
    categoryName: raw.first_level_category_name ?? null,

    shopId: raw.shop_id !== undefined ? String(raw.shop_id) : null,
    shopName: raw.shop_name ?? null,
    shopRating: parseDecimal(raw.evaluate_rate),
    recentOrders: parseDecimal(raw.lastest_volume) ?? 0,

    isChoice: tags.some((tag) => choiceTags.includes(tag.toLowerCase())),
    tags,
  };
}

/**
 * Normalises a batch, collecting failures rather than aborting. A single
 * malformed listing in a page of fifty must not cost the other forty-nine.
 */
export function normalizeProducts(
  raws: RawProduct[],
  options: NormalizeOptions = {},
): { products: CatalogProduct[]; errors: Array<{ index: number; message: string }> } {
  const products: CatalogProduct[] = [];
  const errors: Array<{ index: number; message: string }> = [];

  raws.forEach((raw, index) => {
    try {
      products.push(normalizeProduct(raw, options));
    } catch (err) {
      errors.push({ index, message: err instanceof Error ? err.message : String(err) });
    }
  });

  return { products, errors };
}

function parsePrice(value: string | undefined, currency: string): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const cleaned = String(value).replace(/[^\d.-]/g, '');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return toMinor(parsed, currency);
}

/** "9.0%" and "9.0" both mean nine percent, and both appear. */
function parsePercent(value: string | undefined): number | null {
  if (value === undefined || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace('%', '').trim());
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed / 100;
}

function parseDecimal(value: string | number | undefined): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace('%', '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTags(value: RawProduct['product_tags']): string[] {
  if (Array.isArray(value)) return value.map((tag) => String(tag)).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Prefers a discount recomputed from the prices over the one the gateway
 * reports, which is frequently stale relative to the price beside it.
 */
function computeDiscount(
  reported: string | undefined,
  saleMinor: number | null,
  originalMinor: number | null,
): number | null {
  if (saleMinor !== null && originalMinor !== null && originalMinor > 0 && originalMinor >= saleMinor) {
    return Math.round(((originalMinor - saleMinor) / originalMinor) * 100);
  }
  const parsed = parseDecimal(reported);
  return parsed !== null ? Math.round(parsed) : null;
}
