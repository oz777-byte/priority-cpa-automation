import { describe, it, expect } from 'vitest';
import iconv from 'iconv-lite';
import {
  buildShortRecord,
  generateMoveInShort,
  pairEntries,
  generateHeshin,
  generateHeshinPrm,
  SHORT_RECORD_LENGTH,
  HESHIN_RECORD_LENGTH,
  type JeForPairing,
} from '../src/index.js';

const BASE = {
  debitAccount: '1010',
  creditAccount: '101589',
  reference: 1,
  documentDate: '2026-01-06',
  valueDate: '2026-01-07',
  amountIls: 902.7,
  details: 'ועד בית רפאל איתן 36',
};

describe('buildShortRecord', () => {
  it('produces an 88-char record with fields at the reference offsets', () => {
    const r = buildShortRecord(BASE);
    expect(r).toHaveLength(SHORT_RECORD_LENGTH);
    expect(r.slice(0, 8)).toBe('1010    ');
    expect(r.slice(8, 16)).toBe('101589  ');
    expect(r.slice(16, 21)).toBe('1    ');
    expect(r.slice(21, 27)).toBe('060126');
    expect(r.slice(27, 32)).toBe('0    ');
    expect(r.slice(32, 38)).toBe('070126');
    expect(r.slice(38, 53)).toBe('902.70         ');
    expect(r.slice(53, 75)).toBe('ועד בית רפאל איתן 36  ');
    expect(r.slice(75, 88)).toBe('.00          ');
  });

  it('rejects debit === credit (SAME ACCOUNTS guard)', () => {
    expect(() =>
      buildShortRecord({ ...BASE, creditAccount: '1010' }),
    ).toThrow(/SAME ACCOUNTS/);
  });

  it('emits 000000 for an unknown date instead of crashing', () => {
    const r = buildShortRecord({ ...BASE, documentDate: '', valueDate: '' });
    expect(r.slice(21, 27)).toBe('000000');
    expect(r.slice(32, 38)).toBe('000000');
  });
});

describe('generateMoveInShort', () => {
  it('writes a count header, CP1255 + CRLF, no BOM', () => {
    const buf = generateMoveInShort([BASE, { ...BASE, reference: 2 }]);
    const text = iconv.decode(buf, 'cp1255');
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('2');
    expect(lines[1]).toHaveLength(88);
    expect(lines[2]).toHaveLength(88);
    expect(buf[0]).not.toBe(0xef);
    const roundtrip = iconv.decode(buf, 'cp1255');
    expect(roundtrip).toContain('ועד בית רפאל איתן 36');
  });
});

describe('pairEntries', () => {
  it('nets a pass-through account so no SAME ACCOUNTS record is emitted', () => {
    const je: JeForPairing = {
      index: 7,
      documentDate: '2026-02-10',
      valueDate: '2026-02-10',
      details: 'pass-through',
      lines: [
        { account: '1010', side: 'D', amountIls: 100 },
        { account: '1010', side: 'C', amountIls: 100 },
        { account: '4000', side: 'D', amountIls: 50 },
        { account: '8000', side: 'C', amountIls: 50 },
      ],
    };
    const { records, unbalancedJeIndexes } = pairEntries([je]);
    expect(unbalancedJeIndexes).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0]!.debitAccount).toBe('4000');
    expect(records[0]!.creditAccount).toBe('8000');
    expect(records[0]!.amountIls).toBe(50);
  });

  it('splits a multi-line JE into balanced pairs summing to the JE total', () => {
    const je: JeForPairing = {
      index: 3,
      documentDate: '2026-03-01',
      valueDate: '2026-03-01',
      lines: [
        { account: 'A', side: 'D', amountIls: 70 },
        { account: 'B', side: 'D', amountIls: 30 },
        { account: 'C', side: 'C', amountIls: 100 },
      ],
    };
    const { records } = pairEntries([je]);
    const total = records.reduce((s, r) => s + r.amountIls, 0);
    expect(total).toBeCloseTo(100, 2);
    expect(records.every((r) => r.debitAccount !== r.creditAccount)).toBe(true);
  });

  it('reports an unbalanced JE instead of emitting bad records', () => {
    const je: JeForPairing = {
      index: 9,
      documentDate: '2026-01-01',
      valueDate: '2026-01-01',
      lines: [
        { account: 'A', side: 'D', amountIls: 10 },
        { account: 'B', side: 'C', amountIls: 9.99 },
      ],
    };
    const { records, unbalancedJeIndexes } = pairEntries([je]);
    expect(records).toEqual([]);
    expect(unbalancedJeIndexes).toEqual([9]);
  });

  it('is immune to float drift (integer-agorot accumulation)', () => {
    const lines: JeForPairing['lines'] = [];
    for (let i = 0; i < 300; i++) lines.push({ account: 'X', side: 'D', amountIls: 0.1 });
    lines.push({ account: 'Y', side: 'C', amountIls: 30 });
    const { records, unbalancedJeIndexes } = pairEntries([
      { index: 1, documentDate: '2026-01-01', valueDate: '2026-01-01', lines },
    ]);
    expect(unbalancedJeIndexes).toEqual([]);
    expect(records.reduce((s, r) => s + r.amountIls, 0)).toBeCloseTo(30, 2);
  });
});

describe('generateHeshin', () => {
  it('produces 1544-char records with key, name, VAT flag and tax id at reference offsets', () => {
    const { dat, prm } = generateHeshin([
      { accountKey: '170', accountName: 'דניה סיבוס בע"מ', taxId: '512569237' },
      { accountKey: '1010', accountName: 'בנק לאומי 833-131000/29' },
    ]);
    const text = iconv.decode(dat, 'cp1255');
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('2');
    const r = lines[1]!;
    expect(r).toHaveLength(HESHIN_RECORD_LENGTH);
    expect(r.slice(0, 15).trim()).toBe('170');
    expect(r.slice(15, 65).trim()).toBe('דניה סיבוס בע"מ');
    expect(r.slice(613, 614)).toBe('0');
    expect(r.slice(426, 435).trim()).toBe('512569237');
    expect(r.slice(1400, 1411).trim()).toBe('512569237');
    const r2 = lines[2]!;
    expect(r2.slice(426, 435).trim()).toBe('');

    const prmText = iconv.decode(prm, 'cp1255');
    expect(prmText.startsWith('1545\r\n')).toBe(true);
    expect(prmText).toContain('1\t15\tמפתח חשבון;\t\tשורה 1');
    expect(prmText).toContain('614\t614\tפטור ממע"מ;');
  });

  it('ignores an all-zero tax id', () => {
    const { dat } = generateHeshin([
      { accountKey: '99', accountName: 'x', taxId: '000000000' },
    ]);
    const r = iconv.decode(dat, 'cp1255').split('\r\n')[1]!;
    expect(r.slice(426, 435).trim()).toBe('');
  });
});

describe('generateHeshinPrm', () => {
  it('is stable and CP1255-encodable', () => {
    const a = generateHeshinPrm();
    const b = generateHeshinPrm();
    expect(a.equals(b)).toBe(true);
  });
});
