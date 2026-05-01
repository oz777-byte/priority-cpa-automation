import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateInvoice, invoiceFingerprint } from '../src/index.js';
import type { ValidationContext } from '../src/index.js';
import type { CanonicalInvoice } from '@priority-cpa/invoice-schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POC = resolve(__dirname, '../../movein-generator/tests/fixtures');

function loadInvoice(name: string): CanonicalInvoice {
  return JSON.parse(readFileSync(resolve(POC, name), 'utf-8'));
}

const FULL_TARI_CONTEXT: ValidationContext = {
  companyId: 'tari',
  expenseAccount: '502-0',
  vatInputAccount: '205-2',
  knownAccounts: new Set(['502-0', '205-2', '200087', '200037']),
  knownSupplierCodes: new Set(['200087', '200037']),
  todayIso: '2026-05-02',
};

describe('validateInvoice — happy path on POC fixtures', () => {
  it('passes wertheim with the configured Tari chart', () => {
    const inv = loadInvoice('wertheim_4427930.json');
    const r = validateInvoice(inv, FULL_TARI_CONTEXT);
    expect(r.errors).toEqual([]);
    expect(r.passed).toBe(true);
  });

  it('passes tzarfati with the configured Tari chart', () => {
    const inv = loadInvoice('tzarfati_114390.json');
    const r = validateInvoice(inv, FULL_TARI_CONTEXT);
    expect(r.errors).toEqual([]);
    expect(r.passed).toBe(true);
  });

  it('emits VAT_RATE_DEVIATION warning on wertheim (87.25 stated → 87.22 reconciled)', () => {
    const inv = loadInvoice('wertheim_4427930.json');
    const r = validateInvoice(inv, FULL_TARI_CONTEXT);
    expect(r.warnings.some((w) => w.code === 'VAT_RATE_DEVIATION')).toBe(true);
  });
});

describe('validateInvoice — error paths', () => {
  it('TOTALS_INCONSISTENT when stated VAT is wildly off', () => {
    const inv = loadInvoice('wertheim_4427930.json');
    const broken = { ...inv, totals: { ...inv.totals, total: 1000, vat_amount: 200 } };
    const r = validateInvoice(broken as CanonicalInvoice, FULL_TARI_CONTEXT);
    expect(r.passed).toBe(false);
    expect(r.errors.some((e) => e.code === 'TOTALS_INCONSISTENT')).toBe(true);
  });

  it('VAT_RATE_MISMATCH when invoice declares 17% post-2025', () => {
    const inv = loadInvoice('wertheim_4427930.json');
    const broken = { ...inv, totals: { ...inv.totals, vat_rate: 17 } };
    const r = validateInvoice(broken as CanonicalInvoice, FULL_TARI_CONTEXT);
    expect(r.errors.some((e) => e.code === 'VAT_RATE_MISMATCH')).toBe(true);
  });

  it('SUPPLIER_UNKNOWN when supplier code not in master', () => {
    const inv = loadInvoice('wertheim_4427930.json');
    const ctx: ValidationContext = {
      ...FULL_TARI_CONTEXT,
      knownSupplierCodes: new Set(['200037']), // wertheim missing
    };
    const r = validateInvoice(inv, ctx);
    expect(r.errors.some((e) => e.code === 'SUPPLIER_UNKNOWN')).toBe(true);
  });

  it('EXPENSE_ACCOUNT_NOT_FOUND when expense account missing from chart', () => {
    const inv = loadInvoice('wertheim_4427930.json');
    const ctx: ValidationContext = {
      ...FULL_TARI_CONTEXT,
      knownAccounts: new Set(['205-2', '200087', '200037']), // 502-0 missing
    };
    const r = validateInvoice(inv, ctx);
    expect(r.errors.some((e) => e.code === 'EXPENSE_ACCOUNT_NOT_FOUND')).toBe(true);
  });

  it('DATE_OUT_OF_RANGE when invoice is more than 30 days in the future', () => {
    const inv = loadInvoice('wertheim_4427930.json');
    const broken = { ...inv, invoice: { ...inv.invoice, date: '2026-12-31' } };
    const r = validateInvoice(broken as CanonicalInvoice, {
      ...FULL_TARI_CONTEXT,
      todayIso: '2026-05-02',
    });
    expect(r.errors.some((e) => e.code === 'DATE_OUT_OF_RANGE')).toBe(true);
  });

  it('DATE_FAR_PAST warning when invoice older than 1 year', () => {
    const inv = loadInvoice('wertheim_4427930.json');
    const old = { ...inv, invoice: { ...inv.invoice, date: '2024-01-01' } };
    const r = validateInvoice(old as CanonicalInvoice, FULL_TARI_CONTEXT);
    expect(r.warnings.some((w) => w.code === 'DATE_FAR_PAST')).toBe(true);
  });

  it('ALLOCATION_REQUIRED for high-value 2026 invoice without allocation_number', () => {
    const inv = loadInvoice('wertheim_4427930.json');
    const big = {
      ...inv,
      invoice: { ...inv.invoice, allocation_number: null },
      totals: { ...inv.totals, subtotal: 50000, total: 59000, vat_amount: 9000 },
    };
    const r = validateInvoice(big as CanonicalInvoice, FULL_TARI_CONTEXT);
    expect(r.errors.some((e) => e.code === 'ALLOCATION_REQUIRED')).toBe(true);
  });

  it('DUPLICATE_INVOICE when fingerprint is in the known set', () => {
    const inv = loadInvoice('wertheim_4427930.json');
    const fp = invoiceFingerprint(inv);
    const r = validateInvoice(inv, {
      ...FULL_TARI_CONTEXT,
      knownInvoiceFingerprints: new Set([fp]),
    });
    expect(r.errors.some((e) => e.code === 'DUPLICATE_INVOICE')).toBe(true);
  });

  it('OCR_LOW_CONFIDENCE warning when below threshold', () => {
    const inv = loadInvoice('wertheim_4427930.json');
    const lowConf = {
      ...inv,
      metadata: { ...(inv.metadata ?? {}), ocr_confidence: 0.6 },
    };
    const r = validateInvoice(lowConf as CanonicalInvoice, FULL_TARI_CONTEXT);
    expect(r.warnings.some((w) => w.code === 'OCR_LOW_CONFIDENCE')).toBe(true);
  });

  it('NON_ILS_CURRENCY warning on USD invoice', () => {
    const inv = loadInvoice('wertheim_4427930.json');
    const fx = { ...inv, invoice: { ...inv.invoice, currency: 'USD' as const } };
    const r = validateInvoice(fx as CanonicalInvoice, FULL_TARI_CONTEXT);
    expect(r.warnings.some((w) => w.code === 'NON_ILS_CURRENCY')).toBe(true);
  });
});

describe('invoiceFingerprint', () => {
  it('is stable for identical invoices', () => {
    const a = loadInvoice('wertheim_4427930.json');
    const b = loadInvoice('wertheim_4427930.json');
    expect(invoiceFingerprint(a)).toBe(invoiceFingerprint(b));
  });
  it('differs for different invoices', () => {
    const a = loadInvoice('wertheim_4427930.json');
    const b = loadInvoice('tzarfati_114390.json');
    expect(invoiceFingerprint(a)).not.toBe(invoiceFingerprint(b));
  });
});
