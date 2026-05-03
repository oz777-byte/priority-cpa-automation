import { z } from 'zod';

export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const CurrencySchema = z.enum(['ILS', 'USD', 'EUR', 'GBP']);
export type Currency = z.infer<typeof CurrencySchema>;

export const ScenarioSchema = z.enum([
  'STANDARD',
  'FOREIGN_CURRENCY',
  'WITH_ALLOCATION',
  'MULTI_EXPENSE',
  'WITH_COST_CENTER',
  'MIXED_DEDUCTION',
  'WITH_DISCOUNT',
  'CREDIT_NOTE',
  'WITH_WITHHOLDING',
  'IMMEDIATE_PAYMENT',
  'DIFFERENT_DATES',
  'AGGREGATOR',
  'MISSING_ALLOCATION',
  /** Self-invoice (חשבונית עצמית) — Israeli business buying a service from a
   * non-Israeli supplier. The buyer reports VAT both as input AND output
   * (net effect zero, but reflected in PCN874). 4-line JE. */
  'SELF_INVOICE',
  /** Private supplier (יחיד בלי ע.מ) — individual without business id.
   * Triggers automatic 30% withholding. */
  'PRIVATE_SUPPLIER',
  /** Prepaid expense (הוצאה לתקופות) — amount goes to a prepaid asset
   * account at payment, recognized monthly over the period. */
  'PREPAID',
]);
export type Scenario = z.infer<typeof ScenarioSchema>;

const isoDate = z.string().regex(ISO_DATE_REGEX, 'date must be YYYY-MM-DD');

export const InvoiceLineSchema = z
  .object({
    description: z.string(),
    qty: z.number().optional(),
    unit_price: z.number().optional(),
    line_total: z.number().optional(),
    category: z.string().optional(),
  })
  .passthrough();
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>;

export const InvoiceMetaSchema = z
  .object({
    ocr_confidence: z.number().min(0).max(1).optional(),
    source: z.string().optional(),
    ingested_at: z.string().optional(),
    extraction_method: z.string().optional(),
  })
  .passthrough();
export type InvoiceMeta = z.infer<typeof InvoiceMetaSchema>;

export const SupplierSchema = z
  .object({
    name: z.string(),
    tax_id: z.string(),
    internal_code_priority: z.string().min(1),
    country: z.string().default('IL').optional(),
  })
  .passthrough();
export type Supplier = z.infer<typeof SupplierSchema>;

export const InvoiceTotalsSchema = z
  .object({
    subtotal: z.number(),
    total: z.number(),
    vat_rate: z.number().optional(),
    vat_amount: z.number().optional(),
    line_sum: z.number().optional(),
    discount_amount: z.number().optional(),
  })
  .passthrough();
export type InvoiceTotals = z.infer<typeof InvoiceTotalsSchema>;

export const InvoiceHeaderSchema = z
  .object({
    number: z.string().min(1),
    date: isoDate,
    value_date: isoDate.optional(),
    currency: CurrencySchema.default('ILS'),
    allocation_number: z.string().nullable().optional(),
    document_type: z.string().optional(),
    payment_terms: z.string().optional(),
    is_credit_note: z.boolean().optional(),
    payment_method: z.enum(['credit', 'cash', 'card', 'transfer']).optional(),
    /** Withholding-tax percent (0-100). Triggers WITH_WITHHOLDING scenario. */
    withholding_percent: z.number().min(0).max(100).optional(),
    /** Mixed-deduction category (Israeli law). Triggers MIXED_DEDUCTION scenario. */
    mixed_deduction_category: z
      .enum([
        'vehicle',
        'meals',
        'non_deductible',
        'commercial_vehicle',
        'motorcycle_small',
        'motorcycle_large',
        'mobile_phone_full_business',
        'mobile_phone_partial',
        'mobile_phone_personal_majority',
        'gifts_above_threshold',
        'late_meals',
        'foreign_trip',
      ])
      .optional(),
    /** Cost center / project tag. Triggers WITH_COST_CENTER scenario. */
    cost_center: z.string().optional(),
    /** FX rate for non-ILS currencies (units of ILS per unit of foreign currency). */
    fx_rate: z.number().positive().optional(),
    /**
     * For MULTI_EXPENSE scenarios — explicit splits of the subtotal across
     * different expense accounts. If 2+ splits, MULTI_EXPENSE is triggered.
     * Total of split amounts should equal the invoice subtotal.
     */
    expense_splits: z
      .array(
        z.object({
          account: z.string().min(1).max(8),
          amount: z.number().positive(),
          label: z.string().optional(),
          cost_center: z.string().optional(),
        }),
      )
      .optional(),
    /** SELF_INVOICE: this is a self-invoice for a foreign service import. */
    is_self_invoice: z.boolean().optional(),
    /** PREPAID: months over which to recognize this expense (1 = current month only). */
    prepaid_period_months: z.number().int().positive().optional(),
    /** PRIVATE_SUPPLIER: invoice from an individual without a business tax id. */
    is_private_supplier: z.boolean().optional(),
  })
  .passthrough();
export type InvoiceHeader = z.infer<typeof InvoiceHeaderSchema>;

export const CanonicalInvoiceSchema = z
  .object({
    invoice: InvoiceHeaderSchema,
    supplier: SupplierSchema,
    totals: InvoiceTotalsSchema,
    line_items: z.array(InvoiceLineSchema).optional(),
    metadata: InvoiceMetaSchema.optional(),
  })
  .passthrough();
export type CanonicalInvoice = z.infer<typeof CanonicalInvoiceSchema>;

export const JELineSchema = z
  .object({
    account: z.string().min(1),
    debit: z.number().nonnegative().optional(),
    credit: z.number().nonnegative().optional(),
    debit_fx: z.number().nonnegative().optional(),
    credit_fx: z.number().nonnegative().optional(),
    reference1: z.string().optional(),
    reference2: z.string().optional(),
    details: z.string().optional(),
  })
  .refine((line) => (line.debit ?? 0) > 0 || (line.credit ?? 0) > 0, {
    message: 'JE line must have either debit or credit > 0',
  });
export type JELine = z.infer<typeof JELineSchema>;

export const JournalEntrySchema = z
  .object({
    invoice_id: z.string().optional(),
    company_id: z.string().optional(),
    transaction_type: z.string().min(1).max(3),
    reference1: z.string().min(1),
    reference2: z.string().optional(),
    document_date: isoDate,
    value_date: isoDate,
    currency: CurrencySchema,
    fx_rate: z.number().positive().optional(),
    details: z.string(),
    scenario: ScenarioSchema.optional(),
    lines: z.array(JELineSchema).min(2),
  })
  .superRefine((je, ctx) => {
    const drSum = je.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const crSum = je.lines.reduce((s, l) => s + (l.credit ?? 0), 0);
    if (Math.abs(drSum - crSum) > 0.05) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `JE not balanced: DR=${drSum.toFixed(2)} CR=${crSum.toFixed(2)} diff=${(drSum - crSum).toFixed(2)}`,
      });
    }
  });
export type JournalEntry = z.infer<typeof JournalEntrySchema>;
