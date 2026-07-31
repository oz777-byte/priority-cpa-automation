import { formatTimestamp, signRequest } from './sign';
import type { SignMethod } from './sign';
import type {
  LinkGenerateResult,
  OrderListResult,
  ProductQueryParams,
  ProductQueryResult,
  RawOrder,
  RawProduct,
} from './types';
import { AliExpressApiError } from './types';

export const DEFAULT_GATEWAY = 'https://api-sg.aliexpress.com/sync';

/** Method names the affiliate programme exposes. */
export const METHODS = {
  productQuery: 'aliexpress.affiliate.product.query',
  productDetail: 'aliexpress.affiliate.productdetail.get',
  hotProductQuery: 'aliexpress.affiliate.hotproduct.query',
  linkGenerate: 'aliexpress.affiliate.link.generate',
  orderList: 'aliexpress.affiliate.order.list',
} as const;

export interface Transport {
  (url: string, body: string): Promise<unknown>;
}

export interface ClientConfig {
  appKey: string;
  appSecret: string;
  /** Affiliate tracking id. Without it, commissions are not attributed at all. */
  trackingId: string;
  gateway?: string;
  signMethod?: SignMethod;
  /** Injected so a signature is reproducible in a test. */
  now: () => number;
  /** Injected so tests never touch the network. */
  transport: Transport;
  defaults?: {
    shipToCountry?: string;
    targetCurrency?: string;
    targetLanguage?: string;
  };
}

export interface AliExpressClient {
  queryProducts(params: ProductQueryParams): Promise<ProductQueryResult>;
  getProductDetail(productIds: Array<string | number>, params?: ProductQueryParams): Promise<RawProduct[]>;
  generateLinks(urls: string[], subId: string): Promise<LinkGenerateResult>;
  listOrders(params: {
    startTime: string;
    endTime: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<OrderListResult>;
  /** Exposed for tests and for debugging signature rejections. */
  buildParams(method: string, payload: Record<string, string | undefined>): Record<string, string>;
}

export function createAliExpressClient(config: ClientConfig): AliExpressClient {
  const gateway = config.gateway ?? DEFAULT_GATEWAY;
  const signMethod: SignMethod = config.signMethod ?? 'sha256';

  function buildParams(
    method: string,
    payload: Record<string, string | undefined>,
  ): Record<string, string> {
    const params: Record<string, string> = {
      app_key: config.appKey,
      method,
      format: 'json',
      v: '2.0',
      sign_method: signMethod,
      timestamp: formatTimestamp(config.now()),
    };

    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined && value !== '') params[key] = value;
    }

    params.sign = signRequest(params, config.appSecret, signMethod);
    return params;
  }

  async function call(method: string, payload: Record<string, string | undefined>): Promise<unknown> {
    const params = buildParams(method, payload);
    const body = new URLSearchParams(params).toString();
    const response = await config.transport(gateway, body);
    return unwrap(response, method);
  }

  function commonParams(params: ProductQueryParams): Record<string, string | undefined> {
    return {
      tracking_id: config.trackingId,
      ship_to_country: params.shipToCountry ?? config.defaults?.shipToCountry,
      target_currency: params.targetCurrency ?? config.defaults?.targetCurrency,
      target_language: params.targetLanguage ?? config.defaults?.targetLanguage,
    };
  }

  return {
    buildParams,

    async queryProducts(params) {
      const result = await call(METHODS.productQuery, {
        ...commonParams(params),
        keywords: params.keywords,
        category_ids: params.categoryIds?.join(','),
        page_no: params.page ? String(params.page) : undefined,
        page_size: params.pageSize ? String(params.pageSize) : undefined,
        sort: params.sort,
        min_sale_price: params.minSalePrice !== undefined ? String(params.minSalePrice) : undefined,
        max_sale_price: params.maxSalePrice !== undefined ? String(params.maxSalePrice) : undefined,
        delivery_days: params.deliveryDays !== undefined ? String(params.deliveryDays) : undefined,
        fields: PRODUCT_FIELDS,
      });

      const body = asRecord(result);
      return {
        products: asArray<RawProduct>(pathValue(body, ['products', 'product'])),
        currentPage: toNumber(body.current_page_no) ?? params.page ?? 1,
        pageSize: toNumber(body.page_size) ?? params.pageSize ?? 20,
        totalRecords: toNumber(body.total_record_count) ?? 0,
      };
    },

    async getProductDetail(productIds, params = {}) {
      if (productIds.length === 0) return [];
      const result = await call(METHODS.productDetail, {
        ...commonParams(params),
        product_ids: productIds.join(','),
        fields: PRODUCT_FIELDS,
      });
      return asArray<RawProduct>(pathValue(asRecord(result), ['products', 'product']));
    },

    async generateLinks(urls, subId) {
      if (urls.length === 0) return { links: [] };
      const result = await call(METHODS.linkGenerate, {
        promotion_link_type: '0',
        source_values: urls.join(','),
        tracking_id: config.trackingId,
        // Our SubID rides here. If this parameter is dropped or renamed, every
        // click becomes unattributable, which is exactly what the end-to-end
        // check in the validation sprint exists to catch.
        sub_id: subId,
      });

      const links = asArray<{ source_value?: string; promotion_link?: string }>(
        pathValue(asRecord(result), ['promotion_links', 'promotion_link']),
      );

      return {
        links: links.map((link) => ({
          sourceValue: String(link.source_value ?? ''),
          promotionLink: String(link.promotion_link ?? ''),
        })),
      };
    },

    async listOrders(params) {
      const result = await call(METHODS.orderList, {
        start_time: params.startTime,
        end_time: params.endTime,
        status: params.status,
        page_no: params.page ? String(params.page) : undefined,
        page_size: params.pageSize ? String(params.pageSize) : undefined,
      });

      const body = asRecord(result);
      return {
        orders: asArray<RawOrder>(pathValue(body, ['orders', 'order'])),
        currentPage: toNumber(body.current_page_no) ?? params.page ?? 1,
        totalRecords: toNumber(body.total_record_count) ?? 0,
      };
    },
  };
}

/**
 * Requested explicitly because the gateway returns a thin projection by
 * default, and the store-quality fields the catalog ranks on are among the
 * ones it omits.
 */
export const PRODUCT_FIELDS = [
  'product_id',
  'product_title',
  'product_main_image_url',
  'product_small_image_urls',
  'product_detail_url',
  'promotion_link',
  'original_price',
  'sale_price',
  'target_sale_price',
  'target_original_price',
  'sale_price_currency',
  'target_sale_price_currency',
  'discount',
  'commission_rate',
  'first_level_category_id',
  'first_level_category_name',
  'second_level_category_id',
  'second_level_category_name',
  'shop_id',
  'shop_name',
  'shop_url',
  'evaluate_rate',
  'lastest_volume',
  'product_tags',
].join(',');

/**
 * The gateway wraps every success in `<method>_response` and every failure in
 * `error_response`, and returns HTTP 200 for both — so the error has to be
 * dug out of the body rather than read off the status code.
 */
function unwrap(response: unknown, method: string): unknown {
  const root = asRecord(response);

  const error = root.error_response;
  if (error) {
    const record = asRecord(error);
    throw new AliExpressApiError({
      message: String(record.sub_msg ?? record.msg ?? 'AliExpress gateway error'),
      code: String(record.code ?? 'unknown'),
      subCode: record.sub_code ? String(record.sub_code) : undefined,
      requestId: record.request_id ? String(record.request_id) : undefined,
    });
  }

  const envelopeKey = `${method.replace(/\./g, '_')}_response`;
  const envelope = root[envelopeKey] ?? root[`${envelopeKey}_response`];
  const inner = envelope !== undefined ? asRecord(envelope) : root;

  // Result nesting varies by method; `resp_result` appears on some, and its
  // own `resp_code` carries a second, independent failure channel.
  const respResult = inner.resp_result;
  if (respResult !== undefined) {
    const wrapper = asRecord(respResult);
    const respCode = toNumber(wrapper.resp_code);
    if (respCode !== undefined && respCode !== 200) {
      throw new AliExpressApiError({
        message: String(wrapper.resp_msg ?? 'AliExpress request rejected'),
        code: String(respCode),
      });
    }
    return wrapper.result ?? wrapper;
  }

  return inner.result ?? inner;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** The gateway sometimes wraps a list in a single-key object; both are handled. */
function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') return [value as T];
  return [];
}

function pathValue(root: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
