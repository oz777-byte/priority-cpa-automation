import { describe, it, expect } from 'vitest';
import { extractInvoiceFields } from '../src/index.js';

describe('extractInvoiceFields — mock mode', () => {
  it('returns deterministic data for the same buffer', async () => {
    const buf = Buffer.from('test-pdf-data');
    const a = await extractInvoiceFields(buf);
    const b = await extractInvoiceFields(buf);
    expect(a).toEqual(b);
    expect(a.source).toBe('mock');
  });

  it('returns different invoice numbers for different buffers', async () => {
    const a = await extractInvoiceFields(Buffer.from('one'));
    const b = await extractInvoiceFields(Buffer.from('two'));
    expect(a.invoice?.number).not.toBe(b.invoice?.number);
  });

  it('always returns a Wirthheim-shaped supplier in mock mode', async () => {
    const r = await extractInvoiceFields(Buffer.from('any'));
    expect(r.supplier?.name).toBe('וירטהיים בע"מ');
    expect(r.supplier?.tax_id).toBe('510847064');
  });

  it('returns subtotal+vat=total within rounding tolerance', async () => {
    const r = await extractInvoiceFields(Buffer.from('amounts'));
    const sum =
      Math.round(((r.totals?.subtotal ?? 0) + (r.totals?.vat_amount ?? 0)) * 100) / 100;
    expect(sum).toBeCloseTo(r.totals?.total ?? 0, 2);
  });

  it('VAT mock follows 18% rate', async () => {
    const r = await extractInvoiceFields(Buffer.from('vat-rate-check'));
    const subtotal = r.totals?.subtotal ?? 0;
    const expected = Math.round(subtotal * 0.18 * 100) / 100;
    expect(r.totals?.vat_amount).toBe(expected);
  });

  it('returns ISO date format', async () => {
    const r = await extractInvoiceFields(Buffer.from('date-shape'));
    expect(r.invoice?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns ILS currency by default in mock', async () => {
    const r = await extractInvoiceFields(Buffer.from('currency'));
    expect(r.invoice?.currency).toBe('ILS');
  });
});

describe('extractInvoiceFields — config gating', () => {
  it('uses mock when endpoint is empty', async () => {
    const r = await extractInvoiceFields(Buffer.from('x'), { endpoint: '', key: 'kkk' });
    expect(r.source).toBe('mock');
  });

  it('uses mock when key is empty', async () => {
    const r = await extractInvoiceFields(Buffer.from('x'), {
      endpoint: 'https://example.com',
      key: '',
    });
    expect(r.source).toBe('mock');
  });
});
