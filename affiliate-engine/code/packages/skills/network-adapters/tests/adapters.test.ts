import { describe, it, expect } from 'vitest';
import { hashToken } from '@affiliate/link-builder';
import {
  AdapterError,
  createGenericCsvAdapter,
  getAdapter,
  listAdapters,
  mapStatus,
  parseCsv,
  parseDate,
  parseMoney,
  toTable,
} from '../src/index';

describe('parseCsv', () => {
  it('handles quoted commas and embedded newlines', () => {
    const rows = parseCsv('a,b\n"x, y","line1\nline2"\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'line1\nline2'],
    ]);
  });

  it('handles escaped quotes', () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([['a'], ['say "hi"']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips a BOM so the first header stays usable', () => {
    const table = toTable('﻿Action Id,Payout\n123,10.00\n');
    expect(table.headers[0]).toBe('action_id');
  });

  it('rejects an unterminated quoted field', () => {
    expect(() => parseCsv('a\n"unterminated')).toThrow(AdapterError);
  });
});

describe('parseMoney', () => {
  it('parses plain and symbol-prefixed amounts', () => {
    expect(parseMoney('12.34', 'USD')).toBe(1234);
    expect(parseMoney('$1,234.56', 'USD')).toBe(123456);
    expect(parseMoney('₪99.90', 'ILS')).toBe(9990);
  });

  it('parses European decimal commas', () => {
    expect(parseMoney('1.234,56', 'EUR')).toBe(123456);
  });

  it('parses negatives in both notations, as reversals appear that way', () => {
    expect(parseMoney('-25.00', 'USD')).toBe(-2500);
    expect(parseMoney('(25.00)', 'USD')).toBe(-2500);
  });

  it('returns null for an empty cell', () => {
    expect(parseMoney('', 'USD')).toBeNull();
    expect(parseMoney(undefined, 'USD')).toBeNull();
  });

  it('respects zero-decimal currencies', () => {
    expect(parseMoney('1500', 'JPY')).toBe(1500);
  });
});

describe('parseDate', () => {
  it('anchors date-only values to UTC midnight', () => {
    expect(parseDate('2026-03-15')).toBe('2026-03-15T00:00:00.000Z');
  });

  it('reads slash dates in US order', () => {
    expect(parseDate('03/15/2026')).toBe('2026-03-15T00:00:00.000Z');
  });

  it('passes through full timestamps', () => {
    expect(parseDate('2026-03-15T10:30:00Z')).toBe('2026-03-15T10:30:00.000Z');
  });

  it('throws on junk rather than inventing a date', () => {
    expect(() => parseDate('last tuesday')).toThrow(AdapterError);
  });
});

describe('mapStatus', () => {
  it('maps known network vocabularies', () => {
    expect(mapStatus('Approved')).toBe('approved');
    expect(mapStatus('declined')).toBe('reversed');
    expect(mapStatus('PAID')).toBe('paid');
  });

  it('treats an unknown status as pending, never approved', () => {
    // Optimism here would inflate EPC and drive the wrong decisions.
    expect(mapStatus('some_new_state')).toBe('pending');
    expect(mapStatus(undefined)).toBe('pending');
  });
});

describe('generic csv adapter', () => {
  const adapter = createGenericCsvAdapter({ networkSlug: 'impact' });

  const report = [
    'Action Id,SubId1,Action Status,Sale Amount,Payout,Currency,Event Date,Campaign',
    'A-1,guide.hero-cta.organic,Approved,"$400.00","$100.00",USD,2026-03-15,Acme SaaS',
    'A-2,guide.table-row-2,Pending,"$250.00","$62.50",USD,2026-03-16,Acme SaaS',
    'A-3,,Approved,"$100.00","$25.00",USD,2026-03-17,Acme SaaS',
    'A-4,GarbageValue,Approved,"$100.00","$25.00",USD,2026-03-18,Acme SaaS',
  ].join('\n');

  it('normalises rows it can attribute', () => {
    const result = adapter.parseReport(report);
    expect(result.stats.rowsTotal).toBe(4);
    expect(result.stats.rowsImported).toBe(2);

    const first = result.conversions[0]!;
    expect(first.externalId).toBe('A-1');
    expect(first.status).toBe('approved');
    expect(first.commissionAmountMinor).toBe(10000);
    expect(first.saleAmountMinor).toBe(40000);
    expect(first.occurredAt).toBe('2026-03-15T00:00:00.000Z');
    expect(first.resolved?.parts).toEqual({
      asset: 'guide',
      placement: 'hero-cta',
      campaign: 'organic',
    });
  });

  it('buckets unattributable rows instead of dropping them', () => {
    const result = adapter.parseReport(report);
    expect(result.stats.rowsUnattributed).toBe(2);
    expect(result.unattributed.map((c) => c.resolved?.reason)).toEqual([
      'missing_subid',
      'unparsable',
    ]);
    // The commission is still known, so the money is never lost from the books.
    expect(result.unattributed[0]!.commissionAmountMinor).toBe(2500);
  });

  it('resolves hashed subids through the map lookup', () => {
    const canonical = 'israeli-accounting-software-comparison.table-row-2.organic';
    const token = hashToken(canonical);
    const hashedReport = [
      'Action Id,SubId1,Action Status,Payout,Currency,Event Date',
      `A-9,${token},Approved,"$40.00",USD,2026-03-20`,
    ].join('\n');

    const result = adapter.parseReport(hashedReport, {
      lookupToken: (t) => (t === token ? canonical : undefined),
    });
    expect(result.stats.rowsImported).toBe(1);
    expect(result.conversions[0]!.resolved?.parts?.asset).toBe(
      'israeli-accounting-software-comparison',
    );
  });

  it('reports an unknown token rather than guessing', () => {
    const orphan = [
      'Action Id,SubId1,Action Status,Payout,Currency,Event Date',
      `A-10,${hashToken('never.stored')},Approved,"$40.00",USD,2026-03-20`,
    ].join('\n');

    const result = adapter.parseReport(orphan, { lookupToken: () => undefined });
    expect(result.unattributed[0]!.resolved?.reason).toBe('unknown_token');
  });

  it('collects row errors without aborting the whole import', () => {
    const broken = [
      'Action Id,SubId1,Action Status,Payout,Currency,Event Date',
      'A-1,guide.hero-cta,Approved,"$100.00",USD,2026-03-15',
      'A-2,guide.hero-cta,Approved,"$100.00",USD,not-a-date',
      'A-3,guide.hero-cta,Approved,"$100.00",USD,2026-03-17',
    ].join('\n');

    const result = adapter.parseReport(broken);
    expect(result.stats.rowsImported).toBe(2);
    expect(result.stats.rowsFailed).toBe(1);
    expect(result.errors[0]!.row).toBe(3);
    expect(result.errors[0]!.message).toMatch(/cannot parse date/);
  });

  it('fails a row that has no transaction id, since idempotency depends on it', () => {
    const noId = [
      'SubId1,Action Status,Payout,Currency,Event Date',
      'guide.hero-cta,Approved,"$100.00",USD,2026-03-15',
    ].join('\n');

    const result = adapter.parseReport(noId);
    expect(result.stats.rowsFailed).toBe(1);
    expect(result.errors[0]!.message).toMatch(/no transaction id column/);
  });

  it('handles a report with no data rows', () => {
    const result = adapter.parseReport('Action Id,SubId1,Payout,Event Date\n');
    expect(result.stats).toMatchObject({ rowsTotal: 0, rowsImported: 0, rowsFailed: 0 });
  });

  it('applies the network subid separator when resolving', () => {
    const psAdapter = getAdapter('partnerstack');
    const psReport = [
      'Transaction Id,ps_xid,Status,Commission,Currency,Created At',
      'T-1,guide_hero-cta_organic,approved,"$30.00",USD,2026-03-15',
    ].join('\n');

    const result = psAdapter.parseReport(psReport);
    expect(result.conversions[0]!.resolved?.parts).toEqual({
      asset: 'guide',
      placement: 'hero-cta',
      campaign: 'organic',
    });
  });
});

describe('registry', () => {
  it('exposes the shipped adapters', () => {
    expect(listAdapters().map((a) => a.slug)).toContain('partnerstack');
  });

  it('names the known networks when asked for one that does not exist', () => {
    expect(() => getAdapter('nope')).toThrow(/no adapter for network "nope"/);
  });
});
