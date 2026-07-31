import { getNetworkProfile, resolveSubId } from '@affiliate/link-builder';
import { toMinor } from '@affiliate/offer-schema';
import { pick, toTable } from './csv';
import type {
  AdapterContext,
  ConversionStatus,
  ImportResult,
  NetworkAdapter,
  NormalizedConversion,
  RowError,
} from './types';
import { AdapterError } from './types';

/**
 * Column aliases seen across network exports. Networks rename columns without
 * notice, so an adapter that hard-codes one spelling breaks on a Tuesday.
 */
export interface ColumnMap {
  externalId: string[];
  subId: string[];
  status: string[];
  saleAmount: string[];
  commission: string[];
  currency: string[];
  occurredAt: string[];
  advertiser: string[];
}

export const DEFAULT_COLUMNS: ColumnMap = {
  externalId: ['action_id', 'transaction_id', 'order_id', 'id', 'conversion_id'],
  subId: ['subid1', 'sub_id1', 'subid', 'sub_id', 'sid', 'clickref', 'afftrack', 'ps_xid', 'ascsubtag'],
  status: ['status', 'action_status', 'state', 'transaction_status'],
  saleAmount: ['sale_amount', 'order_amount', 'amount', 'revenue', 'order_value'],
  commission: ['commission', 'payout', 'earnings', 'commission_amount', 'publisher_commission'],
  currency: ['currency', 'currency_code', 'curr'],
  occurredAt: ['event_date', 'transaction_date', 'action_date', 'date', 'created_at', 'occurred_at'],
  advertiser: ['advertiser', 'campaign', 'merchant', 'program', 'brand'],
};

const STATUS_MAP: Readonly<Record<string, ConversionStatus>> = {
  pending: 'pending',
  open: 'pending',
  new: 'pending',
  awaiting: 'pending',
  approved: 'approved',
  confirmed: 'approved',
  locked: 'approved',
  validated: 'approved',
  reversed: 'reversed',
  declined: 'reversed',
  rejected: 'reversed',
  cancelled: 'reversed',
  canceled: 'reversed',
  refunded: 'reversed',
  paid: 'paid',
  cleared: 'paid',
};

export interface GenericCsvOptions {
  networkSlug: string;
  displayName?: string;
  columns?: Partial<ColumnMap>;
  /** Currency assumed when a report omits the column. */
  defaultCurrency?: string;
}

/**
 * Builds an adapter for any network whose export is a flat CSV. Networks with
 * an unusual export shape get their own adapter module instead.
 */
export function createGenericCsvAdapter(options: GenericCsvOptions): NetworkAdapter {
  const columns: ColumnMap = { ...DEFAULT_COLUMNS, ...options.columns };
  const profile = getNetworkProfile(options.networkSlug);
  const defaultCurrency = options.defaultCurrency ?? 'USD';

  return {
    slug: options.networkSlug,
    displayName: options.displayName ?? profile.displayName,

    parseReport(input: string, context: AdapterContext = {}): ImportResult {
      const table = toTable(input);
      const conversions: NormalizedConversion[] = [];
      const unattributed: NormalizedConversion[] = [];
      const errors: RowError[] = [];

      table.records.forEach((record, index) => {
        const rowNumber = index + 2; // header is row 1
        try {
          const externalId = pick(record, columns.externalId);
          if (!externalId) {
            throw new AdapterError(
              `no transaction id column found (looked for: ${columns.externalId.join(', ')})`,
            );
          }

          const occurredAt = pick(record, columns.occurredAt);
          if (!occurredAt) {
            throw new AdapterError('no conversion date column found');
          }

          const currency = (pick(record, columns.currency) ?? defaultCurrency).toUpperCase();
          const commissionRaw = pick(record, columns.commission);
          if (commissionRaw === undefined) {
            throw new AdapterError('no commission column found');
          }

          const subIdRaw = pick(record, columns.subId) ?? null;
          const resolved = resolveSubId(subIdRaw, profile, context.lookupToken);

          const conversion: NormalizedConversion = {
            externalId,
            networkSlug: options.networkSlug,
            subIdRaw,
            status: mapStatus(pick(record, columns.status)),
            saleAmountMinor: parseMoney(pick(record, columns.saleAmount), currency),
            commissionAmountMinor: parseMoney(commissionRaw, currency) ?? 0,
            currency,
            occurredAt: parseDate(occurredAt),
            advertiser: pick(record, columns.advertiser) ?? null,
            resolved,
          };

          // A row we cannot attribute is still a real commission. It goes to a
          // separate bucket to be investigated, never silently dropped.
          if (resolved.ok) {
            conversions.push(conversion);
          } else {
            unattributed.push(conversion);
          }
        } catch (err) {
          errors.push({
            row: rowNumber,
            message: err instanceof Error ? err.message : String(err),
            raw: record,
          });
        }
      });

      return {
        networkSlug: options.networkSlug,
        conversions,
        unattributed,
        errors,
        stats: {
          rowsTotal: table.records.length,
          rowsImported: conversions.length,
          rowsFailed: errors.length,
          rowsUnattributed: unattributed.length,
        },
      };
    },
  };
}

export function mapStatus(raw: string | undefined): ConversionStatus {
  if (!raw) return 'pending';
  const key = raw.trim().toLowerCase();
  const mapped = STATUS_MAP[key];
  if (mapped) return mapped;
  // An unknown status must not be optimistically read as approved — that
  // would inflate EPC and drive the wrong decisions.
  return 'pending';
}

/**
 * Parses money out of a report cell. Handles currency symbols, thousands
 * separators, and parenthesised negatives, all of which appear in the wild.
 */
export function parseMoney(raw: string | undefined, currency: string): number | null {
  if (raw === undefined || raw.trim() === '') return null;

  let text = raw.trim();
  let negative = false;

  if (text.startsWith('(') && text.endsWith(')')) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  }

  text = text.replace(/[^\d.,]/g, '');

  // Decide which separator is decimal by looking at the last one present.
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma > lastDot) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else {
    text = text.replace(/,/g, '');
  }

  const value = Number(text);
  if (!Number.isFinite(value)) {
    throw new AdapterError(`cannot parse money value: ${JSON.stringify(raw)}`);
  }
  return toMinor(negative ? -value : value, currency);
}

/** Normalises a report date to an ISO 8601 timestamp. */
export function parseDate(raw: string): string {
  const text = raw.trim();

  // Date-only values are anchored to UTC midnight so that a report imported
  // from a different timezone cannot shift a conversion into another month.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return `${text}T00:00:00.000Z`;
  }

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    // Ambiguous by nature. Networks export US order, so month comes first;
    // an adapter for a network that does otherwise must override this.
    const [, month, day, year] = slashMatch;
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}T00:00:00.000Z`;
  }

  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) {
    throw new AdapterError(`cannot parse date: ${JSON.stringify(raw)}`);
  }
  return new Date(parsed).toISOString();
}
