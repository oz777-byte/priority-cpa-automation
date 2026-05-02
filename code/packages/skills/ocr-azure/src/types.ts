/**
 * Result of extracting structured fields from an invoice PDF.
 * All fields are optional — Azure may fail to identify any one of them.
 */
export interface ExtractedInvoice {
  supplier?: {
    name?: string | undefined;
    tax_id?: string | undefined;
  };
  invoice?: {
    number?: string | undefined;
    /** ISO YYYY-MM-DD */
    date?: string | undefined;
    currency?: string | undefined;
  };
  totals?: {
    subtotal?: number | undefined;
    vat_amount?: number | undefined;
    total?: number | undefined;
  };
  /** 0-1, Azure's averaged confidence across the matched fields. */
  confidence: number;
  /** Which engine produced this result. */
  source: 'azure' | 'mock';
  /** Raw response (debugging). Stripped in production responses. */
  raw?: unknown;
}

export interface ExtractConfig {
  /** Azure Document Intelligence endpoint URL. If omitted, falls back to mock. */
  endpoint?: string;
  /** Azure Document Intelligence subscription key. */
  key?: string;
  /** Optional: override the model. Defaults to 'prebuilt-invoice'. */
  modelId?: string;
}
