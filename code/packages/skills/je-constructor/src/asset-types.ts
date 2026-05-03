/**
 * Fixed-asset JE scenarios — three builders:
 *   ASSET_PURCHASE     — capitalize purchase (DR asset / DR vat / CR supplier-or-payment)
 *   ASSET_DEPRECIATION — monthly straight-line (DR expense / CR accumulated)
 *   ASSET_SALE         — disposal with proceeds (DR bank + DR accumulated / CR asset + CR/DR gain/loss)
 */

export type AssetScenario =
  | 'ASSET_PURCHASE'
  | 'ASSET_DEPRECIATION'
  | 'ASSET_SALE';

export interface AssetJELine {
  account: string;
  debit: number;
  credit: number;
  details?: string;
  costCenter?: string;
}

export interface AssetJERecord {
  reference1: string;
  documentDate: string;     // YYYY-MM-DD
  valueDate: string;
  details: string;
  transactionType: string;
  scenario: AssetScenario;
  lines: AssetJELine[];
  notes: string[];
}

/* ──────────────── ASSET_PURCHASE ──────────────── */

export interface AssetPurchaseInput {
  /** Display label for the JE details. */
  assetName: string;
  /** Reference1 — typically the source invoice number. */
  invoiceNumber: string;
  /** Document date (purchase date). */
  documentDate: string;
  /** Subtotal (before VAT) — capitalized to the asset account. */
  subtotal: number;
  /** VAT amount — claimed as input VAT. */
  vat: number;
  /** Counterparty: supplier (creates AP balance) OR payment account (immediate). */
  counterpartyAccount: string;
  /** True if counterparty is a payment account (bank/card/cash). */
  isImmediatePayment: boolean;
  /** Asset DR account — e.g. '140-2' for computers. */
  assetAccount: string;
  /** VAT input account — e.g. '205-2'. */
  vatInputAccount: string;
  /** Optional cost-center tag. */
  costCenter?: string;
  transactionType: string;
}

/* ──────────────── ASSET_DEPRECIATION ──────────────── */

export interface AssetDepreciationInput {
  /** Asset id — used as reference1 for the JE. */
  assetId: string;
  /** Display name — used in details. */
  assetName: string;
  /** Last day of the month being depreciated (YYYY-MM-DD). */
  monthEndDate: string;
  /** Monthly depreciation amount (already calculated by caller). */
  monthlyAmount: number;
  /** Depreciation expense account — e.g. '610-0'. */
  depreciationExpenseAccount: string;
  /** Accumulated depreciation contra-account — e.g. '149-2'. */
  accumulatedDepreciationAccount: string;
  costCenter?: string;
  transactionType: string;
}

/* ──────────────── ASSET_SALE ──────────────── */

export interface AssetSaleInput {
  /** Asset id (db PK). */
  assetId: string;
  /** Asset display name. */
  assetName: string;
  /** Sale date (YYYY-MM-DD). */
  saleDate: string;
  /** Asset account where the original cost is held — to be reversed. */
  assetAccount: string;
  /** Original purchase amount (will be CR'd to clear the asset). */
  purchaseAmount: number;
  /** Accumulated depreciation balance to reverse (DR). */
  accumulatedDepreciation: number;
  /** Accumulated depreciation contra-account. */
  accumulatedDepreciationAccount: string;
  /** Net proceeds received (subtotal). 0 if disposed/scrapped. */
  proceedsSubtotal: number;
  /** VAT charged on the sale (output VAT). 0 if disposed or non-taxable buyer. */
  proceedsVat: number;
  /** Account where proceeds land (bank/customer). */
  proceedsAccount: string;
  /** Output VAT liability account — e.g. '220-0'. */
  outputVatAccount: string;
  /** Gain on sale account — e.g. '744-0'. */
  gainAccount: string;
  /** Loss on sale account — e.g. '625-0'. */
  lossAccount: string;
  transactionType: string;
}

export interface AssetConstructResult {
  scenario: AssetScenario;
  records: AssetJERecord[];
  warnings: string[];
}
