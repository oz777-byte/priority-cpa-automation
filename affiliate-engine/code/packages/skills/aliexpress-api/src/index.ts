export type { SignMethod } from './sign.ts';
export { buildSignatureBase, formatTimestamp, signRequest } from './sign.ts';

export type { AliExpressClient, ClientConfig, Transport } from './client.ts';
export { DEFAULT_GATEWAY, METHODS, PRODUCT_FIELDS, createAliExpressClient } from './client.ts';

export type {
  LinkGenerateResult,
  OrderListResult,
  ProductQueryParams,
  ProductQueryResult,
  ProductSort,
  RawOrder,
  RawProduct,
} from './types.ts';
export { AliExpressApiError, isRetryable } from './types.ts';

export { MOCK_ORDERS, MOCK_PRODUCTS, createMockTransport } from './mock.ts';
