import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CanonicalInvoiceSchema,
  JournalEntrySchema,
  ScenarioSchema,
} from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POC_FIXTURES = resolve(
  __dirname,
  '../../movein-generator/tests/fixtures',
);

describe('CanonicalInvoiceSchema', () => {
  it('parses POC wertheim invoice', () => {
    const json = JSON.parse(
      readFileSync(resolve(POC_FIXTURES, 'wertheim_4427930.json'), 'utf-8'),
    );
    const result = CanonicalInvoiceSchema.safeParse(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.invoice.number).toBe('4427930');
      expect(result.data.invoice.currency).toBe('ILS');
      expect(result.data.supplier.internal_code_priority).toBe('200087');
      expect(result.data.totals.total).toBe(572.0);
    }
  });

  it('parses POC tzarfati invoice', () => {
    const json = JSON.parse(
      readFileSync(resolve(POC_FIXTURES, 'tzarfati_114390.json'), 'utf-8'),
    );
    const result = CanonicalInvoiceSchema.safeParse(json);
    expect(result.success).toBe(true);
  });

  it('rejects malformed date', () => {
    const bad = {
      invoice: {
        number: '1',
        date: '2026/01/01',
        currency: 'ILS',
      },
      supplier: {
        name: 'X',
        tax_id: '111111111',
        internal_code_priority: '999',
      },
      totals: { subtotal: 1, total: 1.18 },
    };
    expect(CanonicalInvoiceSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown currency', () => {
    const bad = {
      invoice: { number: '1', date: '2026-01-01', currency: 'XXX' },
      supplier: { name: 'X', tax_id: '111111111', internal_code_priority: '999' },
      totals: { subtotal: 1, total: 1.18 },
    };
    expect(CanonicalInvoiceSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts unknown extra fields (passthrough)', () => {
    const ok = {
      invoice: { number: '1', date: '2026-01-01', currency: 'ILS' },
      supplier: { name: 'X', tax_id: '111111111', internal_code_priority: '999' },
      totals: { subtotal: 1, total: 1.18 },
      extra_unknown_field: { foo: 'bar' },
    };
    expect(CanonicalInvoiceSchema.safeParse(ok).success).toBe(true);
  });
});

describe('JournalEntrySchema', () => {
  it('accepts a balanced 3-line JE', () => {
    const je = {
      transaction_type: 'מ',
      reference1: '4427930',
      document_date: '2026-02-10',
      value_date: '2026-02-10',
      currency: 'ILS',
      details: 'קניות 4427930',
      lines: [
        { account: '502-0', debit: 484.78 },
        { account: '205-2', debit: 87.22 },
        { account: '200087', credit: 572.0 },
      ],
    };
    const r = JournalEntrySchema.safeParse(je);
    expect(r.success).toBe(true);
  });

  it('rejects unbalanced JE (diff > 0.05)', () => {
    const je = {
      transaction_type: 'מ',
      reference1: '1',
      document_date: '2026-02-10',
      value_date: '2026-02-10',
      currency: 'ILS',
      details: 'x',
      lines: [
        { account: '502-0', debit: 100 },
        { account: '200000', credit: 110 },
      ],
    };
    const r = JournalEntrySchema.safeParse(je);
    expect(r.success).toBe(false);
  });

  it('accepts tolerable rounding (diff ≤ 0.05)', () => {
    const je = {
      transaction_type: 'מ',
      reference1: '1',
      document_date: '2026-02-10',
      value_date: '2026-02-10',
      currency: 'ILS',
      details: 'x',
      lines: [
        { account: '502-0', debit: 100.0 },
        { account: '200000', credit: 100.04 },
      ],
    };
    const r = JournalEntrySchema.safeParse(je);
    expect(r.success).toBe(true);
  });
});

describe('ScenarioSchema', () => {
  it('contains the core scenarios from the playbook', () => {
    const list = ScenarioSchema.options;
    expect(list).toContain('STANDARD');
    expect(list).toContain('FOREIGN_CURRENCY');
    expect(list).toContain('WITH_ALLOCATION');
    expect(list).toContain('MISSING_ALLOCATION');
    // Schema grew over time — playbook started at 13, now includes
    // SELF_INVOICE, PRIVATE_SUPPLIER, PREPAID. Allow ≥13.
    expect(list.length).toBeGreaterThanOrEqual(13);
  });
});
