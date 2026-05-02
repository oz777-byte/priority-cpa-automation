import { describe, it, expect } from 'vitest';
import iconv from 'iconv-lite';
import {
  generateMoveInFlex,
  FLEXIBLE_COLUMNS,
  type FlexibleLineInput,
} from '../src/index.js';

const baseLine: FlexibleLineInput = {
  transactionType: 'מ',
  reference1: '4427930',
  documentDate: '2026-02-10',
  valueDate: '2026-02-10',
  currency: 'ILS',
  account: '502-0',
  side: 'D',
  amountIls: 484.78,
};

function decodeDoc(doc: Buffer): string[][] {
  const text = iconv.decode(doc, 'cp1255');
  return text
    .split('\r\n')
    .filter((l) => l.length > 0)
    .map((l) => l.split('\t'));
}

describe('generateMoveInFlex — basic structure', () => {
  it('produces non-empty doc + prm buffers', () => {
    const r = generateMoveInFlex([baseLine]);
    expect(r.doc.length).toBeGreaterThan(0);
    expect(r.prm.length).toBeGreaterThan(0);
  });

  it('throws on empty input', () => {
    expect(() => generateMoveInFlex([])).toThrow(/at least one/);
  });

  it('one line in → one row in doc', () => {
    const r = generateMoveInFlex([baseLine]);
    const rows = decodeDoc(r.doc);
    expect(rows).toHaveLength(1);
  });

  it('three lines in → three rows in doc', () => {
    const r = generateMoveInFlex([baseLine, baseLine, baseLine]);
    expect(decodeDoc(r.doc)).toHaveLength(3);
  });
});

describe('generateMoveInFlex — column layout', () => {
  it('row has the same column count as FLEXIBLE_COLUMNS', () => {
    const r = generateMoveInFlex([baseLine]);
    const rows = decodeDoc(r.doc);
    expect(rows[0]!.length).toBe(FLEXIBLE_COLUMNS.length);
  });

  it('positional fields match expected indexes', () => {
    const r = generateMoveInFlex([baseLine]);
    const cells = decodeDoc(r.doc)[0]!;
    expect(cells[0]).toBe('מ');           // transaction_type
    expect(cells[1]).toBe('4427930');     // reference1 (no truncation)
    expect(cells[2]).toBe('');            // reference2 (empty)
    expect(cells[3]).toBe('100226');      // document_date DDMMYY
    expect(cells[4]).toBe('100226');      // value_date
    expect(cells[5]).toBe('ILS');         // currency
    expect(cells[6]).toBe('502-0');       // account
    expect(cells[7]).toBe('D');           // side
    expect(cells[8]).toBe('484.78');      // amount_ils
    expect(cells[9]).toBe('0.00');        // amount_fx
  });

  it('writes long allocation_number without truncation (vs 180-format)', () => {
    const r = generateMoveInFlex([
      { ...baseLine, allocationNumber: '1I44279301234567890A' },
    ]);
    const cells = decodeDoc(r.doc)[0]!;
    expect(cells[11]).toBe('1I44279301234567890A');
  });

  it('writes cost_center', () => {
    const r = generateMoveInFlex([{ ...baseLine, costCenter: 'PROJ-A' }]);
    const cells = decodeDoc(r.doc)[0]!;
    expect(cells[10]).toBe('PROJ-A');
  });

  it('encodes Hebrew details in CP1255 (single-byte per char)', () => {
    const r = generateMoveInFlex([
      { ...baseLine, details: 'קניות חומרים' },
    ]);
    const cells = decodeDoc(r.doc)[0]!;
    expect(cells[12]).toBe('קניות חומרים');
  });
});

describe('generateMoveInFlex — prm parameters file', () => {
  it('starts with HASH-FLEX header line and column count', () => {
    const r = generateMoveInFlex([baseLine]);
    const prmText = iconv.decode(r.prm, 'cp1255');
    const firstLine = prmText.split('\r\n')[0];
    expect(firstLine).toBe(`HASH-FLEX|TAB|${FLEXIBLE_COLUMNS.length}`);
  });

  it('declares one row per column with name|width|type', () => {
    const r = generateMoveInFlex([baseLine]);
    const prmText = iconv.decode(r.prm, 'cp1255');
    const lines = prmText.split('\r\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(1 + FLEXIBLE_COLUMNS.length);
    expect(lines[1]).toBe('transaction_type|3|alpha');
    expect(lines[lines.length - 1]).toBe('details|60|alpha');
  });
});

describe('generateMoveInFlex — multi-line balanced JE', () => {
  it('a 4-line JE (DR/DR/CR/CR) — perfectly representable in FLEXIBLE', () => {
    const lines: FlexibleLineInput[] = [
      { ...baseLine, account: '504-0', side: 'D', amountIls: 1000 },
      { ...baseLine, account: '205-2', side: 'D', amountIls: 180 },
      { ...baseLine, account: '200087', side: 'C', amountIls: 1130 },
      { ...baseLine, account: '175-0', side: 'C', amountIls: 50 },
    ];
    const r = generateMoveInFlex(lines);
    const rows = decodeDoc(r.doc);
    expect(rows).toHaveLength(4);
    const drSum = rows
      .filter((r) => r[7] === 'D')
      .reduce((s, r) => s + Number.parseFloat(r[8]!), 0);
    const crSum = rows
      .filter((r) => r[7] === 'C')
      .reduce((s, r) => s + Number.parseFloat(r[8]!), 0);
    expect(drSum).toBeCloseTo(crSum, 2);
  });
});
