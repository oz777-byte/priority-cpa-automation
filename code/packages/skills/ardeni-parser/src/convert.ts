import type { FlexibleLineInput } from '@priority-cpa/movein-generator';
import { parseBkmv, type ParsedBkmv, type BkmvAccount } from './parse-bkmv.js';
import { groupToJournalEntries } from './group-to-jes.js';
import { toFlexLines, requiredAccounts } from './to-flex-lines.js';

/** Net debit/credit gap above which export is forbidden. */
export const EXPORT_TOLERANCE = 0.05;

/** Opening record code mandated by the unified-format standard. */
export const OPENING_RECORD = 'A100';

export interface ConversionReport {
  company: { taxId: string; name: string };
  openingRecordType: string;
  isOpeningValid: boolean; // first record === 'A100'
  sourceLineCount: number; // B100
  sourceAccountCount: number; // B110
  requiredAccountCount: number; // B110 actually posted to
  jeCount: number;
  outputLineCount: number;
  drSum: number;
  crSum: number;
  netImbalance: number;
  balanceOk: boolean; // |netImbalance| <= EXPORT_TOLERANCE
  currencyCounts: Record<string, number>;
  periods: string[]; // distinct YYYY-MM — periods the CPA must open
  mergedJeCount: number;
  singleTransJeCount: number;
  unbalancedTrailerCount: number;
  warnings: string[];
}

export interface ConversionResult {
  flexLines: FlexibleLineInput[];
  requiredAccounts: BkmvAccount[];
  parsed: ParsedBkmv;
  report: ConversionReport;
}

/**
 * Full pipeline: parse a unified-format buffer, group into balanced JEs, and
 * produce FlexibleLineInput[] plus a Hebrew-presentable report. Never throws
 * on imbalance — the report carries balanceOk so the UI can block export
 * gracefully instead of surfacing a stack trace.
 */
export function convertBkmv(input: Buffer | string): ConversionResult {
  const parsed = parseBkmv(input);
  const accountNames = new Map(
    parsed.accounts.map((a) => [a.accountKey, a.accountName] as const),
  );
  const grouped = groupToJournalEntries(parsed.jeLines, accountNames);
  const flexLines = toFlexLines(grouped.entries);
  const reqAccounts = requiredAccounts(grouped.entries, parsed.accounts);

  const balanceOk = Math.abs(grouped.stats.netImbalance) <= EXPORT_TOLERANCE;

  const report: ConversionReport = {
    company: parsed.company,
    openingRecordType: parsed.openingRecordType,
    isOpeningValid: parsed.openingRecordType === OPENING_RECORD,
    sourceLineCount: parsed.stats.totalB100,
    sourceAccountCount: parsed.stats.totalB110,
    requiredAccountCount: reqAccounts.length,
    jeCount: grouped.stats.jeCount,
    outputLineCount: grouped.stats.lineCount,
    drSum: grouped.stats.drSum,
    crSum: grouped.stats.crSum,
    netImbalance: grouped.stats.netImbalance,
    balanceOk,
    currencyCounts: grouped.stats.currencyCounts,
    periods: grouped.stats.periods,
    mergedJeCount: grouped.stats.mergedJeCount,
    singleTransJeCount: grouped.stats.singleTransJeCount,
    unbalancedTrailerCount: grouped.stats.unbalancedTrailerCount,
    warnings: grouped.warnings,
  };

  return { flexLines, requiredAccounts: reqAccounts, parsed, report };
}
