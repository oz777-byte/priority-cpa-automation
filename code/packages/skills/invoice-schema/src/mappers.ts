import type { CanonicalInvoice } from './canonical.js';

/**
 * Stub mappers — full implementations land in M5 (Phase 1) when Azure DI integrates.
 * The signature is locked now so downstream skills can depend on it.
 */

export interface AzureDIInvoiceFields {
  VendorName?: { content: string; confidence: number };
  VendorTaxId?: { content: string; confidence: number };
  InvoiceId?: { content: string; confidence: number };
  InvoiceDate?: { valueDate: string; confidence: number };
  SubTotal?: { valueCurrency: { amount: number; currencyCode: string }; confidence: number };
  TotalTax?: { valueCurrency: { amount: number; currencyCode: string }; confidence: number };
  InvoiceTotal?: { valueCurrency: { amount: number; currencyCode: string }; confidence: number };
  Items?: ReadonlyArray<{
    Description?: { content: string };
    Quantity?: { valueNumber: number };
    UnitPrice?: { valueCurrency: { amount: number } };
    Amount?: { valueCurrency: { amount: number } };
  }>;
}

export interface AzureDIResult {
  fields: AzureDIInvoiceFields;
  confidence: number;
}

export function fromAzureDI(_input: AzureDIResult): CanonicalInvoice {
  throw new Error('fromAzureDI: not implemented yet — see roadmap M5');
}

export interface GoogleDIResult {
  entities: ReadonlyArray<{ type: string; mentionText: string; confidence: number }>;
}

export function fromGoogleDI(_input: GoogleDIResult): CanonicalInvoice {
  throw new Error('fromGoogleDI: not implemented yet — see roadmap M5');
}
