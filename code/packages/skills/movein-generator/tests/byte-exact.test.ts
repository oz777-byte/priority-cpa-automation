import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMoveIn, buildRecord } from '../src/index.js';
import type { CanonicalInvoice, MoveInConfig } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, 'fixtures');

const POC_CONFIG: MoveInConfig = {
  transactionType: 'מ',
  expenseAccount: '502-0',
  vatInputAccount: '205-2',
  currency: 'ILS',
  detailsPrefix: 'קניות',
};

function loadFixture(name: string): CanonicalInvoice {
  const path = resolve(FIXTURES, name);
  return JSON.parse(readFileSync(path, 'utf-8')) as CanonicalInvoice;
}

describe('movein-generator: byte-exact match against POC artifact', () => {
  it('reproduces movein_working.dat byte-for-byte', () => {
    const tzarfati = loadFixture('tzarfati_114390.json');
    const wertheim = loadFixture('wertheim_4427930.json');

    const result = generateMoveIn([tzarfati, wertheim], POC_CONFIG);
    const expected = readFileSync(resolve(FIXTURES, 'movein_working.dat'));

    expect(result.length).toBe(expected.length);
    expect(result.length).toBe(360);
    expect(result.equals(expected)).toBe(true);
  });
});

describe('movein-generator: record structure', () => {
  it('produces a 178-char record (pre-CRLF)', () => {
    const wertheim = loadFixture('wertheim_4427930.json');
    const record = buildRecord(wertheim, POC_CONFIG);
    expect(record).toHaveLength(178);
  });

  it('places each field at the documented column range', () => {
    const wertheim = loadFixture('wertheim_4427930.json');
    const record = buildRecord(wertheim, POC_CONFIG);

    expect(record.slice(0, 3)).toBe('מ  ');
    expect(record.slice(3, 8)).toBe('27930');
    expect(record.slice(8, 14)).toBe('100226');
    expect(record.slice(14, 19)).toBe('    0');
    expect(record.slice(19, 25)).toBe('100226');
    expect(record.slice(25, 28)).toBe('ILS');
    expect(record.slice(28, 50)).toBe('קניות 4427930         ');
    expect(record.slice(50, 58)).toBe('502-0   ');
    expect(record.slice(58, 66)).toBe('205-2   ');
    expect(record.slice(66, 74)).toBe('200087  ');
    expect(record.slice(74, 82)).toBe('        ');
    expect(record.slice(82, 94)).toBe('      484.78');
    expect(record.slice(94, 106)).toBe('       87.22');
    expect(record.slice(106, 118)).toBe('      572.00');
    expect(record.slice(118, 130)).toBe('        0.00');
  });
});

describe('movein-generator: VAT computation policy', () => {
  it('derives VAT from (total - subtotal), ignoring totals.vat_amount in JSON', () => {
    const wertheim = loadFixture('wertheim_4427930.json');
    expect(wertheim.totals.vat_amount).toBe(87.25);

    const record = buildRecord(wertheim, POC_CONFIG);
    expect(record.slice(94, 106).trim()).toBe('87.22');
    expect(record.slice(94, 106).trim()).not.toBe('87.25');
  });
});

describe('movein-generator: encoding & framing', () => {
  it('encodes the buffer as CP1255 with CR+LF every 180 bytes', () => {
    const wertheim = loadFixture('wertheim_4427930.json');
    const buffer = generateMoveIn([wertheim], POC_CONFIG);

    expect(buffer.length).toBe(180);
    expect(buffer[178]).toBe(0x0d);
    expect(buffer[179]).toBe(0x0a);
  });

  it('encodes Hebrew transactionType "מ" as a single CP1255 byte (0xEE)', () => {
    const wertheim = loadFixture('wertheim_4427930.json');
    const buffer = generateMoveIn([wertheim], POC_CONFIG);
    expect(buffer[0]).toBe(0xee);
    expect(buffer[1]).toBe(0x20);
    expect(buffer[2]).toBe(0x20);
  });
});

describe('movein-generator: input validation', () => {
  it('throws on empty invoice list', () => {
    expect(() => generateMoveIn([], POC_CONFIG)).toThrow(/at least one invoice/);
  });

  it('throws on invalid date format', () => {
    const bad = { ...loadFixture('wertheim_4427930.json') };
    bad.invoice = { ...bad.invoice, date: '10/02/2026' };
    expect(() => buildRecord(bad as CanonicalInvoice, POC_CONFIG)).toThrow();
  });
});
