import { createGenericCsvAdapter } from './generic-csv.ts';
import type { NetworkAdapter } from './types.ts';
import { AdapterError } from './types.ts';

/**
 * Adapters shipped out of the box. Each one is a column mapping over the
 * generic CSV reader until a network's export proves it needs more.
 *
 * Column names below are starting points taken from typical exports — confirm
 * against a real download before trusting an import.
 */
const ADAPTERS: NetworkAdapter[] = [
  createGenericCsvAdapter({
    networkSlug: 'impact',
    columns: {
      externalId: ['action_id', 'id'],
      subId: ['subid1', 'sub_id1', 'shared_id'],
      status: ['action_status', 'status'],
      saleAmount: ['sale_amount', 'amount'],
      commission: ['payout', 'commission'],
      occurredAt: ['event_date', 'action_date', 'date'],
      advertiser: ['campaign', 'advertiser'],
    },
  }),
  createGenericCsvAdapter({
    networkSlug: 'partnerstack',
    columns: {
      externalId: ['transaction_id', 'id'],
      subId: ['ps_xid', 'custom_key', 'subid'],
      status: ['status'],
      commission: ['commission', 'partner_earnings', 'earnings'],
      occurredAt: ['created_at', 'date'],
      advertiser: ['product', 'company'],
    },
  }),
  createGenericCsvAdapter({
    networkSlug: 'cj',
    columns: {
      externalId: ['commission_id', 'order_id', 'id'],
      subId: ['sid', 'shopper_id'],
      status: ['action_status', 'status'],
      saleAmount: ['sale_amount', 'order_discount'],
      commission: ['pub_commission_amount_usd', 'commission'],
      occurredAt: ['event_date', 'posting_date', 'date'],
      advertiser: ['advertiser_name', 'advertiser'],
    },
  }),
  createGenericCsvAdapter({
    networkSlug: 'awin',
    columns: {
      externalId: ['transaction_id', 'id'],
      subId: ['clickref', 'click_ref'],
      status: ['transaction_status', 'status'],
      saleAmount: ['sale_amount', 'order_value'],
      commission: ['commission_amount', 'commission'],
      occurredAt: ['transaction_date', 'date'],
      advertiser: ['advertiser_name', 'advertiser'],
    },
  }),
  createGenericCsvAdapter({
    networkSlug: 'aliexpress',
    columns: {
      externalId: ['order_id', 'orderid', 'transaction_id', 'id'],
      subId: ['aff_sub1', 'sub_id', 'subid', 'tracking_id', 'sid'],
      status: ['order_status', 'status', 'settlement_status'],
      saleAmount: ['order_amount', 'paid_amount', 'sale_amount'],
      commission: ['estimated_commission', 'commission', 'estimated_paid_commission'],
      occurredAt: ['order_time', 'paid_time', 'created_at', 'date'],
      advertiser: ['product_name', 'category', 'product'],
    },
  }),
  createGenericCsvAdapter({
    networkSlug: 'direct',
    displayName: 'Direct advertiser agreement',
    defaultCurrency: 'ILS',
  }),
];

const BY_SLUG = new Map(ADAPTERS.map((adapter) => [adapter.slug, adapter]));

export function getAdapter(slug: string): NetworkAdapter {
  const adapter = BY_SLUG.get(slug.toLowerCase());
  if (!adapter) {
    throw new AdapterError(
      `no adapter for network "${slug}". Known: ${[...BY_SLUG.keys()].join(', ')}`,
    );
  }
  return adapter;
}

export function listAdapters(): NetworkAdapter[] {
  return [...ADAPTERS];
}

export function registerAdapter(adapter: NetworkAdapter): void {
  BY_SLUG.set(adapter.slug.toLowerCase(), adapter);
}
