import type { ResolvedSubId } from '@affiliate/link-builder';

/**
 * One shape for every network's commission report.
 *
 * Adding a network must mean writing one adapter, never touching the ingest
 * pipeline — so nothing downstream of this file knows that Impact or CJ exist.
 */

export type ConversionStatus = 'pending' | 'approved' | 'reversed' | 'paid';

export interface NormalizedConversion {
  /** The network's own transaction id. Used as the idempotency key. */
  externalId: string;
  networkSlug: string;
  /** SubID exactly as the network reported it, before any resolution. */
  subIdRaw: string | null;
  status: ConversionStatus;
  /** Order value, in minor units, when the network discloses it. */
  saleAmountMinor: number | null;
  commissionAmountMinor: number;
  currency: string;
  /** ISO 8601 timestamp of the conversion. */
  occurredAt: string;
  /** Advertiser or program name, for mapping to an offer. */
  advertiser: string | null;
  /** Resolution of `subIdRaw` back into asset / placement / campaign / variant. */
  resolved?: ResolvedSubId;
}

export interface RowError {
  /** 1-based row number in the source file, for a usable error message. */
  row: number;
  message: string;
  raw?: unknown;
}

export interface ImportResult {
  networkSlug: string;
  conversions: NormalizedConversion[];
  /** Rows that parsed but could not be tied to an asset. Never discarded. */
  unattributed: NormalizedConversion[];
  errors: RowError[];
  stats: {
    rowsTotal: number;
    rowsImported: number;
    rowsFailed: number;
    rowsUnattributed: number;
  };
}

export interface AdapterContext {
  /** Resolves a hashed SubID token via the `subid_map` table. */
  lookupToken?: (token: string) => string | undefined;
}

export interface NetworkAdapter {
  slug: string;
  displayName: string;
  /** Parses a raw report export into the canonical shape. */
  parseReport(input: string, context?: AdapterContext): ImportResult;
}

export class AdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdapterError';
  }
}
