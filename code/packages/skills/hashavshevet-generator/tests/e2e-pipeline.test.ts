import { describe, it, expect } from 'vitest';
import iconv from 'iconv-lite';
import { convertBkmv } from '@priority-cpa/ardeni-parser';
import { pairEntries, generateMoveInShort, generateHeshin } from '../src/index.js';

/**
 * Full-pipeline test: synthetic BKMVDATA bytes -> parse -> group -> pair ->
 * Hashavshevet package. This is the exact chain /api/ardeni runs, verified
 * end to end without any network or database.
 */

const B100_LEN = 236;
const B110_LEN = 340;

function place(buf: string[], start1: number, value: string): void {
  for (let i = 0; i < value.length; i++) buf[start1 - 1 + i] = value[i]!;
}

function agorot(shekels: number): string {
  const sign = shekels < 0 ? '-' : '+';
  return sign + String(Math.round(Math.abs(shekels) * 100)).padStart(14, '0');
}

interface Line {
  recordNo: number;
  batch: string;
  account: string;
  sign: '1' | '2';
  amount: number;
  details?: string;
}

function b100(o: Line): string {
  const buf = Array<string>(B100_LEN).fill(' ');
  place(buf, 1, 'B100');
  place(buf, 5, String(o.recordNo).padStart(9, '0'));
  place(buf, 23, String(o.recordNo).padStart(10, '0'));
  place(buf, 38, o.batch);
  place(buf, 107, o.details ?? 'תנועה');
  place(buf, 157, '20260210');
  place(buf, 165, '20260210');
  place(buf, 173, o.account);
  place(buf, 203, o.sign);
  place(buf, 204, 'ILS');
  place(buf, 207, agorot(o.amount));
  place(buf, 222, agorot(0));
  return buf.join('');
}

function b110(key: string, name: string, taxId = ''): string {
  const buf = Array<string>(B110_LEN).fill(' ');
  place(buf, 1, 'B110');
  place(buf, 23, key);
  place(buf, 38, name);
  place(buf, 327, taxId || '000000000');
  return buf.join('');
}

function a100(): string {
  return 'A100' + '000000001' + '514013937' + '746791864627410' + '&OF1.31&' + ' '.repeat(50);
}

function buildBkmv(): Buffer {
  const lines = [
    a100(),
    // JE 1: pass-through bank + expense vs income (tests netting end to end)
    b100({ recordNo: 1, batch: '1', account: '1010', sign: '1', amount: 250 }),
    b100({ recordNo: 2, batch: '1', account: '1010', sign: '2', amount: 250 }),
    b100({ recordNo: 3, batch: '1', account: '4000', sign: '1', amount: 118 }),
    b100({ recordNo: 4, batch: '1', account: '8000', sign: '2', amount: 118 }),
    // JE 2: negative amount normalized by abs+flip
    b100({ recordNo: 5, batch: '2', account: '170', sign: '1', amount: 590 }),
    b100({ recordNo: 6, batch: '2', account: '8000', sign: '1', amount: -590 }),
    b110('1010', 'בנק לאומי 833-131000/29'),
    b110('4000', 'הוצאות משרד'),
    b110('8000', 'הכנסות'),
    b110('170', 'דניה סיבוס בע"מ', '512569237'),
  ];
  return iconv.encode(lines.join('\r\n') + '\r\n', 'cp1255');
}

describe('BKMV -> Hashavshevet package, end to end', () => {
  const { entries, requiredAccounts, report } = convertBkmv(buildBkmv());
  const { records, unbalancedJeIndexes } = pairEntries(
    entries.map((e) => ({
      index: e.index,
      documentDate: e.documentDate,
      valueDate: e.valueDate,
      details: e.details,
      lines: e.lines.map((l) => ({ account: l.account, side: l.side, amountIls: l.amountIls })),
    })),
  );

  it('report is valid for export (A100, balance, company tax id)', () => {
    expect(report.isOpeningValid).toBe(true);
    expect(report.balanceOk).toBe(true);
    expect(report.company.taxId).toBe('514013937');
    // Batch 1 closes twice (the pass-through pair balances on its own), so
    // grouping yields 3 JEs; the pass-through one nets to zero records below.
    expect(report.jeCount).toBe(3);
  });

  it('pairing nets the pass-through and keeps everything balanced', () => {
    expect(unbalancedJeIndexes).toEqual([]);
    expect(records.every((r) => r.debitAccount !== r.creditAccount)).toBe(true);
    const total = records.reduce((s, r) => s + r.amountIls, 0);
    expect(total).toBeCloseTo(118 + 590, 2);
  });

  it('movein.dat is structurally valid (header count + 88-char records)', () => {
    const buf = generateMoveInShort(records);
    const lines = iconv.decode(buf, 'cp1255').split('\r\n').filter((l) => l !== '');
    expect(lines[0]).toBe(String(records.length));
    for (const l of lines.slice(1)) expect(l).toHaveLength(88);
  });

  it('HESHIN carries names and the B110 tax id for every used account', () => {
    const { dat } = generateHeshin(
      requiredAccounts.map((a) => ({
        accountKey: a.accountKey,
        accountName: a.accountName,
        ...(a.taxId ? { taxId: a.taxId } : {}),
      })),
    );
    const text = iconv.decode(dat, 'cp1255');
    const rows = text.split('\r\n').filter((l) => l.length >= 1544);
    expect(rows).toHaveLength(4);
    const dania = rows.find((r) => r.startsWith('170'));
    expect(dania).toBeDefined();
    expect(dania!.slice(15, 65).trim()).toBe('דניה סיבוס בע"מ');
    expect(dania!.slice(426, 435).trim()).toBe('512569237');
    const bank = rows.find((r) => r.startsWith('1010'));
    expect(bank!.slice(15, 65).trim()).toBe('בנק לאומי 833-131000/29');
    expect(bank!.slice(426, 435).trim()).toBe('');
  });
});
