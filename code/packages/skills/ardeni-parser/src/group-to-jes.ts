import type { BkmvJournalLine } from './parse-bkmv.js';

/**
 * Groups raw BKMV journal lines into balanced journal entries (JEs).
 *
 * Ported from scripts/convert-ardeni-to-hashavshevet.ts and generalized off
 * any vendor. Two locked decisions live here:
 *   1. Negative amounts → abs() + flip side. Preserves the file's balance
 *      equation (A + D = B + C) with zero data loss.
 *   2. The source transaction number is NOT a reliable JE boundary (~22% of
 *      them are individually unbalanced). The invariant that holds is the
 *      batch: walk lines in recordNo order, accumulate until debit == credit,
 *      then emit one JE.
 */

// All accumulation is done in integer agorot (cents): a JE closes when the
// running debit and credit cent totals are exactly equal. Float drift can
// therefore never split or merge a grouping.
function toCents(v: number): number {
  return Math.round(v * 100);
}

export interface JeGroupLine {
  account: string;
  side: 'D' | 'C';
  amountIls: number;
  amountFx: number;
  currency: string;
  details: string;
}

export interface JournalEntry {
  index: number; // sequential id, unique within the output
  batch: string;
  transNums: string[]; // source transaction numbers merged into this JE
  documentDate: string; // ISO YYYY-MM-DD
  valueDate: string; // ISO YYYY-MM-DD
  currency: string; // first non-ILS currency in the group, else ILS
  details: string;
  reference2: string;
  lines: JeGroupLine[];
  balanced: boolean; // false when emitted as an unbalanced batch trailer
}

export interface GroupStats {
  jeCount: number;
  lineCount: number;
  singleTransJeCount: number;
  mergedJeCount: number;
  unbalancedTrailerCount: number;
  drSum: number;
  crSum: number;
  netImbalance: number;
  currencyCounts: Record<string, number>;
  periods: string[]; // distinct YYYY-MM present — "periods the CPA must open"
}

export interface GroupResult {
  entries: JournalEntry[];
  stats: GroupStats;
  warnings: string[];
}

/** Decision 1: abs() + flip side when the source amount is negative. */
function normalizeLine(r: BkmvJournalLine, details: string): JeGroupLine {
  const isNegative = r.amount < 0;
  const absAmount = Math.abs(r.amount);
  const effectiveSign = isNegative ? (r.sign === '1' ? '2' : '1') : r.sign;
  const side: 'D' | 'C' = effectiveSign === '1' ? 'D' : 'C';
  const currency = r.fxCurr.trim() !== '' ? r.fxCurr.trim().toUpperCase() : 'ILS';
  const amountFx = currency !== 'ILS' ? Math.abs(r.fxAmount) : 0;
  return { account: r.account, side, amountIls: absAmount, amountFx, currency, details };
}

/** Effective debit/credit side of a raw line after negative-amount handling. */
function effectiveDebit(r: BkmvJournalLine): boolean {
  const isNegative = r.amount < 0;
  const effectiveSign = isNegative ? (r.sign === '1' ? '2' : '1') : r.sign;
  return effectiveSign === '1';
}

function isoDate(yyyymmdd: string): string | null {
  if (!/^\d{8}$/.test(yyyymmdd)) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/**
 * Build account-name lookup so the JE details can carry human context.
 * Accepts the parsed accounts list; missing names degrade to ''.
 */
export function groupToJournalEntries(
  jeLines: BkmvJournalLine[],
  accountNames: Map<string, string>,
): GroupResult {
  const warnings: string[] = [];

  // Group by batch, preserving recordNo order.
  const byBatch = new Map<string, BkmvJournalLine[]>();
  for (const r of jeLines) {
    const arr = byBatch.get(r.batch) ?? [];
    arr.push(r);
    byBatch.set(r.batch, arr);
  }

  const entries: JournalEntry[] = [];
  let jeIndex = 0;
  let singleTransJeCount = 0;
  let mergedJeCount = 0;
  let unbalancedTrailerCount = 0;
  let drSum = 0;
  let crSum = 0;
  const currencyCounts: Record<string, number> = {};
  const periods = new Set<string>();

  const flush = (lines: BkmvJournalLine[], balanced: boolean): void => {
    if (lines.length === 0) return;
    jeIndex += 1;
    const first = lines[0]!;

    // Fall back across the batch when a single line lacks a valid date.
    const docDate =
      isoDate(first.docDate) ?? isoDate(first.valueDate) ?? findBatchDate(lines);
    const valueDate =
      isoDate(first.valueDate) ?? isoDate(first.docDate) ?? docDate;
    if (docDate) periods.add(docDate.slice(0, 7));

    const transNums = Array.from(new Set(lines.map((l) => l.transNum).filter(Boolean)));
    if (transNums.length > 1) mergedJeCount += 1;
    else singleTransJeCount += 1;

    let currency = 'ILS';
    for (const l of lines) {
      const c = l.fxCurr.trim();
      if (c !== '' && c.toUpperCase() !== 'ILS') {
        currency = c.toUpperCase();
        break;
      }
    }

    const detailsBase = first.details.trim();
    const groupLines: JeGroupLine[] = lines.map((l) => {
      const norm = normalizeLine(l, '');
      currencyCounts[norm.currency] = (currencyCounts[norm.currency] ?? 0) + 1;
      if (norm.side === 'D') drSum += toCents(norm.amountIls);
      else crSum += toCents(norm.amountIls);

      const accountDisplay = accountNames.get(l.account) ?? '';
      const lineDetails = detailsBase
        ? accountDisplay
          ? `${detailsBase} | ${accountDisplay}`.slice(0, 60)
          : detailsBase.slice(0, 60)
        : accountDisplay.slice(0, 60);
      return { ...norm, details: lineDetails };
    });

    entries.push({
      index: jeIndex,
      batch: first.batch,
      transNums,
      documentDate: docDate ?? '',
      valueDate: valueDate ?? docDate ?? '',
      currency,
      details: detailsBase,
      reference2: (first.transNum || String(jeIndex)).slice(0, 10),
      lines: groupLines,
      balanced,
    });
  };

  for (const [batchNum, batchLines] of byBatch) {
    batchLines.sort((a, b) => a.recordNo - b.recordNo);

    let acc: BkmvJournalLine[] = [];
    let accDr = 0;
    let accCr = 0;

    for (const r of batchLines) {
      acc.push(r);
      const absCents = Math.abs(toCents(r.amount));
      if (effectiveDebit(r)) accDr += absCents;
      else accCr += absCents;

      if (accDr === accCr && accDr > 0) {
        flush(acc, true);
        acc = [];
        accDr = 0;
        accCr = 0;
      }
    }

    if (acc.length > 0) {
      unbalancedTrailerCount += 1;
      warnings.push(
        `batch ${batchNum}: ${acc.length} unbalanced trailing lines ` +
          `(DR=${(accDr / 100).toFixed(2)}, CR=${(accCr / 100).toFixed(2)}) — manual review`,
      );
      flush(acc, false);
    }
  }

  return {
    entries,
    stats: {
      jeCount: jeIndex,
      lineCount: entries.reduce((n, e) => n + e.lines.length, 0),
      singleTransJeCount,
      mergedJeCount,
      unbalancedTrailerCount,
      drSum: drSum / 100,
      crSum: crSum / 100,
      netImbalance: (drSum - crSum) / 100,
      currencyCounts,
      periods: Array.from(periods).sort(),
    },
    warnings,
  };
}

function findBatchDate(lines: BkmvJournalLine[]): string | null {
  for (const l of lines) {
    const d = isoDate(l.docDate) ?? isoDate(l.valueDate);
    if (d) return d;
  }
  return null;
}
