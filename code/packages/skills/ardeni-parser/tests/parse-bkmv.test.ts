import { describe, it, expect } from 'vitest';
import iconv from 'iconv-lite';
import { parseBkmv } from '../src/index.js';

/**
 * Synthetic fixture: hand-built fixed-width records that exercise every
 * documented offset, the CP1255 Hebrew round-trip, the +/- amount sign, the
 * agorot→shekel scaling, ILS normalization and FX passthrough. This anchors
 * the byte offsets ported from extract-ardeni-bkmv.ps1.
 *
 * A byte-exact regression test on the real 4,492-line Ardeni POC file is
 * added separately once that sample is committed as a fixture.
 */

const RECORD_LEN = 236;

/** Place a value at a 1-based start position inside a fixed-width buffer. */
function place(buf: string[], start1: number, value: string): void {
  for (let i = 0; i < value.length; i++) buf[start1 - 1 + i] = value[i]!;
}

interface B100Opts {
  recordNo: string;
  transNum: string;
  batch: string;
  details: string;
  valueDate: string;
  docDate: string;
  account: string;
  sign: string;
  fxCurr: string;
  amount: string; // 15-char signed agorot field
  fxAmount: string; // 15-char signed agorot field
}

function b100(o: B100Opts): string {
  const buf = Array(RECORD_LEN).fill(' ');
  place(buf, 1, 'B100');
  place(buf, 5, o.recordNo);
  place(buf, 23, o.transNum);
  place(buf, 38, o.batch);
  place(buf, 107, o.details);
  place(buf, 157, o.valueDate);
  place(buf, 165, o.docDate);
  place(buf, 173, o.account);
  place(buf, 203, o.sign);
  place(buf, 204, o.fxCurr);
  place(buf, 207, o.amount);
  place(buf, 222, o.fxAmount);
  return buf.join('');
}

function b110(accountKey: string, accountName: string): string {
  const buf = Array(RECORD_LEN).fill(' ');
  place(buf, 1, 'B110');
  place(buf, 23, accountKey);
  place(buf, 38, accountName);
  return buf.join('');
}

function a100(): string {
  const buf = Array(RECORD_LEN).fill(' ');
  place(buf, 1, 'A100');
  return buf.join('');
}

function buildFile(): Buffer {
  const lines = [
    a100(),
    b100({
      recordNo: '000000001',
      transNum: '0000012345',
      batch: '00000001',
      details: 'תשלום ספק',
      valueDate: '20260210',
      docDate: '20260210',
      account: '4000',
      sign: '1',
      fxCurr: 'ILS',
      amount: '+00000000048478', // 484.78
      fxAmount: '+00000000000000',
    }),
    b100({
      recordNo: '000000002',
      transNum: '0000012345',
      batch: '00000001',
      details: 'תשלום ספק',
      valueDate: '20260210',
      docDate: '20260210',
      account: '5000',
      sign: '2',
      fxCurr: 'ILS',
      amount: '+00000000048478', // 484.78
      fxAmount: '+00000000000000',
    }),
    b100({
      recordNo: '000000003',
      transNum: '0000099999',
      batch: '00000002',
      details: 'החזר',
      valueDate: '20260315',
      docDate: '20260315',
      account: '4000',
      sign: '1',
      fxCurr: 'GBP',
      amount: '-00000000010000', // -100.00
      fxAmount: '+00000000002000', // 20.00
    }),
    b110('4000', 'הוצאות משרד'),
    b110('5000', 'בנק לאומי'),
  ];
  return iconv.encode(lines.join('\r\n') + '\r\n', 'cp1255');
}

describe('parseBkmv', () => {
  const result = parseBkmv(buildFile());

  it('detects the opening record type for the A100 guard', () => {
    expect(result.openingRecordType).toBe('A100');
  });

  it('parses every B100 journal line', () => {
    expect(result.jeLines).toHaveLength(3);
  });

  it('reads fixed-width fields at the documented offsets', () => {
    const l = result.jeLines[0]!;
    expect(l.recordNo).toBe(1);
    expect(l.transNum).toBe('0000012345');
    expect(l.batch).toBe('00000001');
    expect(l.account).toBe('4000');
    expect(l.sign).toBe('1');
    expect(l.valueDate).toBe('20260210');
    expect(l.docDate).toBe('20260210');
  });

  it('round-trips Hebrew text through CP1255', () => {
    expect(result.jeLines[0]!.details).toBe('תשלום ספק');
    expect(result.accounts[0]!.accountName).toBe('הוצאות משרד');
  });

  it('parses the signed agorot amount field into shekels', () => {
    expect(result.jeLines[0]!.amount).toBeCloseTo(484.78, 2);
    expect(result.jeLines[2]!.amount).toBeCloseTo(-100, 2);
  });

  it('normalizes ILS to blank and passes FX through', () => {
    expect(result.jeLines[0]!.fxCurr).toBe('');
    expect(result.jeLines[0]!.fxAmount).toBe(0);
    expect(result.jeLines[2]!.fxCurr).toBe('GBP');
    expect(result.jeLines[2]!.fxAmount).toBeCloseTo(20, 2);
  });

  it('parses B110 account cards', () => {
    expect(result.accounts).toHaveLength(2);
    expect(result.accounts[0]!.accountKey).toBe('4000');
  });

  it('computes file-level balance stats', () => {
    expect(result.stats.totalB100).toBe(3);
    expect(result.stats.totalB110).toBe(2);
    expect(result.stats.signedDrSum).toBeCloseTo(384.78, 2);
    expect(result.stats.signedCrSum).toBeCloseTo(484.78, 2);
    expect(result.stats.signedDiff).toBeCloseTo(-100, 2);
  });
});
