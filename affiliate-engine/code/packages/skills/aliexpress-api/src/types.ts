/**
 * Wire types for the AliExpress affiliate gateway.
 *
 * Field names mirror the API exactly, including its inconsistencies — the
 * order-volume field really is spelled `lastest_volume`. Correcting spellings
 * here would break every lookup, so normalisation happens one layer up in the
 * catalog skill instead.
 *
 * Everything is optional: the gateway omits fields rather than nulling them,
 * and which fields appear varies by method, locale and product.
 */

export interface RawProduct {
  product_id?: string | number;
  product_title?: string;
  product_main_image_url?: string;
  product_small_image_urls?: { string?: string[] } | string[];
  product_video_url?: string;
  product_detail_url?: string;
  promotion_link?: string;

  /** Price before discount, as a decimal string. */
  original_price?: string;
  /** Current price, as a decimal string. */
  sale_price?: string;
  target_sale_price?: string;
  target_original_price?: string;
  original_price_currency?: string;
  sale_price_currency?: string;
  target_sale_price_currency?: string;
  discount?: string;

  /** Commission as a percentage string, e.g. "8.0%" or "8.0". */
  commission_rate?: string;
  hot_product_commission_rate?: string;
  relevant_market_commission_rate?: string;

  first_level_category_id?: string | number;
  first_level_category_name?: string;
  second_level_category_id?: string | number;
  second_level_category_name?: string;

  shop_id?: string | number;
  shop_name?: string;
  shop_url?: string;
  /** Store rating, typically a percentage string such as "96.5". */
  evaluate_rate?: string;

  /** Orders in the recent window. The misspelling is the gateway's. */
  lastest_volume?: number | string;

  /** Product rating out of five, as a decimal string. */
  evaluation_rate?: string;
  avg_evaluation_rating?: string;

  ship_to_days?: string;
  /** Free-form tag list; where a Choice marker appears, it appears here. */
  product_tags?: string[] | string;
}

export interface ProductQueryParams {
  keywords?: string;
  categoryIds?: Array<string | number>;
  page?: number;
  pageSize?: number;
  /** ISO-3166 alpha-2, e.g. 'IL'. Drives localised pricing and shipping. */
  shipToCountry?: string;
  targetCurrency?: string;
  targetLanguage?: string;
  sort?: ProductSort;
  minSalePrice?: number;
  maxSalePrice?: number;
  /** Restricts results to a delivery programme, e.g. the Choice selection. */
  deliveryDays?: number;
}

export type ProductSort =
  | 'SALE_PRICE_ASC'
  | 'SALE_PRICE_DESC'
  | 'LAST_VOLUME_ASC'
  | 'LAST_VOLUME_DESC'
  | 'COMMISSION_RATE_ASC'
  | 'COMMISSION_RATE_DESC';

export interface ProductQueryResult {
  products: RawProduct[];
  currentPage: number;
  pageSize: number;
  totalRecords: number;
}

export interface LinkGenerateResult {
  links: Array<{ sourceValue: string; promotionLink: string }>;
}

export interface RawOrder {
  order_id?: string | number;
  /** Our SubID, echoed back. This is the whole point of the integration. */
  sub_id?: string;
  order_status?: string;
  paid_amount?: string;
  estimated_paid_commission?: string;
  commission_rate?: string;
  currency?: string;
  paid_time?: string;
  created_time?: string;
  product_id?: string | number;
  product_title?: string;
}

export interface OrderListResult {
  orders: RawOrder[];
  currentPage: number;
  totalRecords: number;
}

/**
 * A gateway failure. `code` and `subCode` are what actually distinguish a
 * transient rate limit from a permanently misconfigured app, so both are kept
 * rather than flattened into a message.
 */
export class AliExpressApiError extends Error {
  readonly code: string;
  readonly subCode: string | undefined;
  readonly requestId: string | undefined;

  constructor(args: { message: string; code: string; subCode?: string; requestId?: string }) {
    super(args.message);
    this.name = 'AliExpressApiError';
    this.code = args.code;
    this.subCode = args.subCode;
    this.requestId = args.requestId;
  }
}

/**
 * Codes worth retrying. Anything else — a bad app key, a method the account is
 * not provisioned for — will fail identically on every attempt, and retrying
 * only delays the point at which someone reads the error.
 */
const RETRYABLE_CODES = new Set(['7', '15', '22', '23', 'ServiceUnavailable', 'isp.top-remote-connection-timeout']);

export function isRetryable(error: unknown): boolean {
  if (!(error instanceof AliExpressApiError)) return false;
  if (RETRYABLE_CODES.has(error.code)) return true;
  const subCode = error.subCode ?? '';
  return /rate.?limit|flow.?control|timeout|busy/i.test(`${error.message} ${subCode}`);
}
