import { describe, it, expect } from 'vitest';
import {
  buildPcn874,
  buildHeader,
  buildInputRecord,
  buildSaleRecord,
  buildTrailer,
  agorot,
  compactDate,
  padN,
  padT,
} from '../src/index.js';
import type { Pcn874Transaction } from '../src/index.js';

describe('PCN874 — primitive helpers', () => {
  it('padN right-aligns and zero-pads integers', () => {
    expect(padN(42, 6)).toBe('000042');
    expect(padN(0, 4)).toBe('0000');
  });

  it('padN throws when value exceeds width', () => {
    expect(() => padN(1234567, 4)).toThrow(/overflow/);
  });

  it('padT left-aligns and space-pads or truncates', () => {
    expect(padT('AB', 5)).toBe('AB   ');
    expect(padT('TOOLONG', 4)).toBe('TOOL');
    expect(padT(null, 3)).toBe('   ');
  });

  it('agorot rounds to nearest integer × 100', () => {
    expect(agorot(484.78)).toBe(48478);
    expect(agorot(484.785)).toBe(48479); // banker rounding edge
    expect(agorot(0)).toBe(0);
  });

  it('compactDate strips dashes', () => {
    expect(compactDate('2026-05-03')).toBe('20260503');
  });
});

describe('PCN874 — header record', () => {
  it('produces a 90-char fixed-width header', () => {
    const h = buildHeader({
      vatId: '516136819',
      year: 2026,
      month: 5,
      totalSalesCount: 12,
      totalInputsCount: 8,
      totalSalesVat: 1234.56,
      totalInputsVat: 789.01,
      totalSalesSubtotal: 6859.77,
      totalInputsSubtotal: 4383.39,
    });
    expect(h.length).toBe(90);
    expect(h.startsWith('O')).toBe(true);
    expect(h.slice(1, 10)).toBe('516136819');
    expect(h.slice(10, 16)).toBe('202605');
  });

  it('encodes counts and VAT in agorot', () => {
    const h = buildHeader({
      vatId: '516136819',
      year: 2026,
      month: 5,
      totalSalesCount: 1,
      totalInputsCount: 1,
      totalSalesVat: 100,
      totalInputsVat: 50,
      totalSalesSubtotal: 555.55,
      totalInputsSubtotal: 277.77,
    });
    // sales count starts at offset 24 (1 type + 9 vat + 6 period + 8 date = 24)
    expect(h.slice(24, 31)).toBe('0000001');
    expect(h.slice(31, 38)).toBe('0000001');
    // sales_vat (11) starts at 38
    expect(h.slice(38, 49)).toBe('00000010000');
    // inputs_vat (11) starts at 49
    expect(h.slice(49, 60)).toBe('00000005000');
  });
});

describe('PCN874 — detail records', () => {
  const sample: Pcn874Transaction = {
    counterpartyVatId: '516789123',
    documentDate: '2026-05-12',
    referenceNumber: '4427930',
    allocationNumber: '1I442793',
    subtotal: 484.78,
    vat: 87.22,
    subType: 'standard',
  };

  it('builds an 80-char input record (T)', () => {
    const r = buildInputRecord(sample);
    expect(r.length).toBe(80);
    expect(r.startsWith('T ')).toBe(true);
    expect(r.slice(2, 11)).toBe('516789123');
    expect(r.slice(11, 19)).toBe('20260512');
  });

  it('builds an 80-char input asset record (Y)', () => {
    const r = buildInputRecord({ ...sample, subType: 'asset' });
    expect(r.startsWith('Y ')).toBe(true);
  });

  it('treats sale to registered counterparty as S2', () => {
    const r = buildSaleRecord(sample);
    expect(r.startsWith('S2')).toBe(true);
  });

  it('treats sale without counterparty VAT as S1', () => {
    const r = buildSaleRecord({ ...sample, counterpartyVatId: null });
    expect(r.startsWith('S1')).toBe(true);
  });

  it('treats petty as L', () => {
    const r = buildSaleRecord({ ...sample, counterpartyVatId: null, subType: 'petty' });
    expect(r.startsWith('L ')).toBe(true);
  });
});

describe('PCN874 — trailer', () => {
  it('encodes vat-to-pay sign', () => {
    const t1 = buildTrailer({ totalRecords: 5, totalVatToPay: 1500 });
    expect(t1.length).toBe(90);
    expect(t1.startsWith('X')).toBe(true);
    expect(t1.slice(10, 11)).toBe('+');
    expect(t1.slice(11, 23)).toBe('000000150000');

    const t2 = buildTrailer({ totalRecords: 5, totalVatToPay: -200 });
    expect(t2.slice(10, 11)).toBe('-');
    expect(t2.slice(11, 23)).toBe('000000020000');
  });
});

describe('PCN874 — full file build', () => {
  it('emits header + sales + inputs + trailer joined by CR+LF', () => {
    const result = buildPcn874({
      vatId: '516136819',
      year: 2026,
      month: 5,
      sales: [
        {
          counterpartyVatId: '987654321',
          documentDate: '2026-05-08',
          referenceNumber: 'INV-1',
          subtotal: 1000,
          vat: 180,
          subType: 'standard',
        },
      ],
      inputs: [
        {
          counterpartyVatId: '516789123',
          documentDate: '2026-05-12',
          referenceNumber: '4427930',
          subtotal: 484.78,
          vat: 87.22,
          subType: 'standard',
        },
      ],
    });

    expect(result.summary.salesCount).toBe(1);
    expect(result.summary.inputsCount).toBe(1);
    expect(result.summary.totalSalesVat).toBe(180);
    expect(result.summary.totalInputsVat).toBe(87.22);
    expect(result.summary.vatToPay).toBe(92.78);

    const lines = result.text.split('\r\n').filter((l) => l.length > 0);
    expect(lines.length).toBe(4); // header + 1 sale + 1 input + trailer
    expect(lines[0]?.startsWith('O')).toBe(true);
    expect(lines[1]?.startsWith('S2')).toBe(true);
    expect(lines[2]?.startsWith('T ')).toBe(true);
    expect(lines[3]?.startsWith('X')).toBe(true);
  });

  it('encodes output buffer in Windows-1255', () => {
    const result = buildPcn874({
      vatId: '516136819',
      year: 2026,
      month: 5,
      sales: [],
      inputs: [],
    });
    expect(result.buffer).toBeInstanceOf(Buffer);
    // Header has no Hebrew, so first byte should be ASCII "O" (0x4F).
    expect(result.buffer[0]).toBe(0x4f);
  });

  it('rejects invalid vatId', () => {
    expect(() =>
      buildPcn874({
        vatId: '12345', // too short
        year: 2026,
        month: 5,
        sales: [],
        inputs: [],
      }),
    ).toThrow(/9 digits/);
  });

  it('rejects invalid month', () => {
    expect(() =>
      buildPcn874({
        vatId: '516136819',
        year: 2026,
        month: 13,
        sales: [],
        inputs: [],
      }),
    ).toThrow(/month/);
  });
});
