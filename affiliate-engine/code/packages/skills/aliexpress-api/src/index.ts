export type { SignMethod } from './sign';
export { buildSignatureBase, formatTimestamp, signRequest } from './sign';

export type { AliExpressClient, ClientConfig, Transport } from './client';
export { DEFAULT_GATEWAY, METHODS, PRODUCT_FIELDS, createAliExpressClient } from './client';

export type {
  LinkGenerateResult,
  OrderListResult,
  ProductQueryParams,
  ProductQueryResult,
  ProductSort,
  RawOrder,
  RawProduct,
} from './types';
export { AliExpressApiError, isRetryable } from './types';

export { MOCK_ORDERS, MOCK_PRODUCTS, createMockTransport } from './mock';
