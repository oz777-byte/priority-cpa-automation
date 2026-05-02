import { z } from 'zod';
import { CurrencySchema, ISO_DATE_REGEX } from './canonical.js';

/* ──────────────────────────────────────────────────────────────────
 * Sales (AR) schema — mirror of supplier/AP CanonicalInvoice.
 * Used for issuing invoices to customers (sales side).
 * ──────────────────────────────────────────────────────────────── */

export const SalesScenarioSchema = z.enum([
  /** חשבונית מס B2B — DR customer / CR revenue + output VAT */
  'AR_STANDARD',
  /** חשבונית מס-קבלה — combined invoice + receipt; payment received immediately */
  'AR_INVOICE_RECEIPT',
  /** חשבונית עסקה (proforma) — DR customer / CR מקדמות; not yet revenue */
  'AR_PROFORMA',
  /** קבלה — receipt against an existing invoice; DR bank/cash / CR customer */
  'AR_RECEIPT',
  /** זיכוי לקוח — credit note; reversed direction */
  'AR_CREDIT_NOTE',
  /** עסקה במזומן — direct cash sale; DR cash / CR revenue + VAT */
  'AR_CASH_SALE',
  /** עסקה באשראי — DR clearing / CR revenue + VAT; settlement to bank later */
  'AR_CARD_SALE',
  /** צ'ק דחוי — post-dated check; DR צ'קים לגבייה / CR customer (or revenue) */
  'AR_POSTDATED_CHECK',
  /** תשלומים (3, 6, 12) — single invoice + scheduled receipts */
  'AR_INSTALLMENTS',
  /** ייצוא — 0% VAT export sale; DR foreign customer / CR revenue */
  'AR_EXPORT',
  /** מכירה לפטור מע"מ (אילת, תיירים) — 0% VAT, reportable separately */
  'AR_VAT_EXEMPT',
  /** מט"ח — sale in foreign currency with FX rate */
  'AR_FOREIGN_CURRENCY',
  /** ניכוי במקור מלקוח (B2G) — customer deducts withholding */
  'AR_WITH_WITHHOLDING',
  /** מקדמה מלקוח — DR bank / CR מקדמות (liability) before invoice issued */
  'AR_ADVANCE',
  /** חוב אבוד — DR חובות אבודים / CR customer; reverses revenue */
  'AR_BAD_DEBT',
]);
export type SalesScenario = z.infer<typeof SalesScenarioSchema>;

const isoDate = z.string().regex(ISO_DATE_REGEX, 'date must be YYYY-MM-DD');

export const CustomerSchema = z
  .object({
    name: z.string().min(1),
    /** Israeli ע.מ (9 digits) for B2B; or customer's ת.ז for individuals; or empty for cash sales. */
    tax_id: z.string(),
    /** Customer's account code in Priority (typically 100-199 for sub-accounts of 120-0). */
    internal_code_priority: z.string().min(1),
    country: z.string().default('IL').optional(),
  })
  .passthrough();
export type Customer = z.infer<typeof CustomerSchema>;

export const SalesLineSchema = z
  .object({
    item_code: z.string().optional(),
    description: z.string(),
    qty: z.number().positive().default(1),
    unit_price: z.number(),
    line_total: z.number(),
    /** Override the customer's / item's default revenue account. */
    revenue_account: z.string().optional(),
    /** Per-line VAT category. Defaults to 'standard' for the invoice. */
    vat_category: z.enum(['standard', 'zero', 'exempt']).optional(),
    cost_center: z.string().optional(),
  })
  .passthrough();
export type SalesLine = z.infer<typeof SalesLineSchema>;

export const SalesTotalsSchema = z
  .object({
    subtotal: z.number(),
    total: z.number(),
    vat_rate: z.number().optional(),
    vat_amount: z.number().optional(),
    discount_amount: z.number().optional(),
  })
  .passthrough();
export type SalesTotals = z.infer<typeof SalesTotalsSchema>;

export const SalesInvoiceHeaderSchema = z
  .object({
    number: z.string().min(1),
    date: isoDate,
    value_date: isoDate.optional(),
    currency: CurrencySchema.default('ILS'),
    /** Document type drives the primary scenario. */
    document_type: z
      .enum([
        'tax_invoice',           // חשבונית מס
        'invoice_receipt',       // חשבונית מס-קבלה
        'proforma',              // חשבונית עסקה
        'receipt',               // קבלה
        'credit_note',           // זיכוי
      ])
      .default('tax_invoice'),
    payment_terms: z.string().optional(),
    /** How the customer paid (or will pay). */
    payment_method: z
      .enum(['credit', 'cash', 'card', 'transfer', 'check_postdated', 'installments'])
      .optional(),
    /** For AR_WITH_WITHHOLDING — percentage the customer (B2G) deducts. */
    customer_withholding_percent: z.number().min(0).max(100).optional(),
    /** For AR_INSTALLMENTS — number of equal payments. */
    installments_count: z.number().int().min(2).max(36).optional(),
    /** Allocation number issued by tax authority (חוק 2024+). */
    allocation_number: z.string().nullable().optional(),
    /** Cost center / project tag. */
    cost_center: z.string().optional(),
    /** FX rate for non-ILS sales (units of ILS per unit of foreign currency). */
    fx_rate: z.number().positive().optional(),
    /** AR_EXPORT only: destination country code. */
    export_country: z.string().length(2).optional(),
    /** AR_VAT_EXEMPT only: exempt reason (אילת / תיירים / fundraising). */
    vat_exempt_reason: z.string().optional(),
    /** AR_BAD_DEBT only: reference to original invoice being written off. */
    bad_debt_original_invoice: z.string().optional(),
  })
  .passthrough();
export type SalesInvoiceHeader = z.infer<typeof SalesInvoiceHeaderSchema>;

export const SalesInvoiceSchema = z
  .object({
    invoice: SalesInvoiceHeaderSchema,
    customer: CustomerSchema,
    totals: SalesTotalsSchema,
    line_items: z.array(SalesLineSchema).optional(),
    metadata: z
      .object({
        source: z.string().optional(),
        ingested_at: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type SalesInvoice = z.infer<typeof SalesInvoiceSchema>;
