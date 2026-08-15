import { describe, it, expect } from 'vitest';
import iconv from 'iconv-lite';
import { convertBkmv, groupToJournalEntries, requiredAccounts } from '../src/index.js';
import { parseBkmv } from '../src/index.js';

const RECORD_LEN = 236;

function place(buf: string[], start1: number, value: string): void {
  for (let i = 0; i < value.length; i++) buf[start1 - 1 + i] = value[i]!;
}

function agorot(shekels: number): string {
  const sign = shekels < 0 ? '-' : '+';
  const cents = Math.round(Math.abs(shekels) * 100);
  return sign + String(cents).padStart(14, '0');
}

interface Line {
  recordNo: number;
  batch: string;
  account: string;
  sign: '1' | '2';
  amount: number;
  fxCurr?: string;
  fxAmount?: number;
  details?: string;
}

function b100(o: Line): string {
  const buf = Array(RECORD_LEN).fill(' ');
  place(buf, 1, 'B100');
  place(buf, 5, String(o.recordNo).padStart(9, '0'));
  place(buf, 23, String(o.recordNo).padStart(10, '0'));
  place(buf, 38, o.batch);
  place(buf, 107, o.details ?? 'תנועה');
  place(buf, 157, '20260210');
  place(buf, 165, '20260210');
  place(buf, 173, o.account);
  place(buf, 203, o.sign);
  place(buf, 204, o.fxCurr ?? 'ILS');
  place(buf, 207, agorot(o.amount));
  place(buf, 222, agorot(o.fxAmount ?? 0));
  return buf.join('');
}

function b110(key: string, name: string): string {
  const buf = Array(RECORD_LEN).fill(' ');
  place(buf, 1, 'B110');
  place(buf, 23, key);
  place(buf, 38, name);
  return buf.join('');
}

function a100(): string {
  const buf = Array(RECORD_LEN).fill(' ');
  place(buf, 1, 'A100');
  return buf.join('');
}

function file(lines: string[]): Buffer {
  return iconv.encode(lines.join('\r\n') + '\r\n', 'cp1255');
}

describe('groupToJournalEntries', () => {
  it('emits one JE when a batch balances and merges across transactions', () => {
    const lines = [
      b100({ recordNo: 1, batch: '00000001', account: '4000', sign: '1', amount: 100 }),
      b100({ recordNo: 2, batch: '00000001', account: '4100', sign: '1', amount: 50 }),
      b100({ recordNo: 3, batch: '00000001', account: '8000', sign: '2', amount: 150 }),
    ];
    const parsed = parseBkmv(file([a100(), ...lines]));
    const { entries, stats } = groupToJournalEntries(parsed.jeLines, new Map());
    expect(entries).toHaveLength(1);
    expect(entries[0]!.lines).toHaveLength(3);
    expect(stats.netImbalance).toBeCloseTo(0, 2);
  });

  it('normalizes a negative amount by flipping the side', () => {
    const parsed = parseBkmv(
      file([
        a100(),
        // credit line carried as a negative debit → must become a real credit
        b100({ recordNo: 1, batch: '1', account: '4000', sign: '1', amount: 200 }),
        b100({ recordNo: 2, batch: '1', account: '8000', sign: '1', amount: -200 }),
      ]),
    );
    const { entries } = groupToJournalEntries(parsed.jeLines, new Map());
    const sides = entries[0]!.lines.map((l) => l.side).sort();
    expect(sides).toEqual(['C', 'D']);
  });
});

describe('requiredAccounts', () => {
  it('keeps only accounts that are actually posted to', () => {
    const parsed = parseBkmv(
      file([
        a100(),
        b100({ recordNo: 1, batch: '1', account: '4000', sign: '1', amount: 100 }),
        b100({ recordNo: 2, batch: '1', account: '8000', sign: '2', amount: 100 }),
        b110('4000', 'הוצאות'),
        b110('8000', 'הכנסות'),
        b110('9999', 'כרטיס יתום'),
      ]),
    );
    const { entries } = groupToJournalEntries(parsed.jeLines, new Map());
    const req = requiredAccounts(entries, parsed.accounts);
    expect(req.map((a) => a.accountKey).sort()).toEqual(['4000', '8000']);
  });
});

describe('convertBkmv', () => {
  it('produces flex lines and a balanced, exportable report', () => {
    const { flexLines, report } = convertBkmv(
      file([
        a100(),
        b100({ recordNo: 1, batch: '1', account: '4000', sign: '1', amount: 484.78, details: 'ספק' }),
        b100({ recordNo: 2, batch: '1', account: '8000', sign: '2', amount: 484.78 }),
      ]),
    );
    expect(report.isOpeningValid).toBe(true);
    expect(report.balanceOk).toBe(true);
    expect(report.jeCount).toBe(1);
    expect(flexLines).toHaveLength(2);
    expect(flexLines[0]!.reference1).toBe('1');
    expect(flexLines[0]!.transactionType).toBe('מ');
  });

  it('flags a non-A100 opening record', () => {
    const { report } = convertBkmv(
      file([
        b100({ recordNo: 1, batch: '1', account: '4000', sign: '1', amount: 10 }),
        b100({ recordNo: 2, batch: '1', account: '8000', sign: '2', amount: 10 }),
      ]),
    );
    expect(report.isOpeningValid).toBe(false);
  });
});
