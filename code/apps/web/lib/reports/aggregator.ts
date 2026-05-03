/**
 * Shared report data layer — pulls journal_entries + lines + accounts master,
 * aggregates per-account, classifies by Israeli chart-of-accounts conventions.
 *
 * All five reports (Trial Balance, GL, P&L, Balance Sheet, VAT) consume this.
 */

import { getAdminClient } from '@/lib/supabase/admin';

export type AccountType = 'asset' | 'liability' | 'income' | 'expense' | 'equity';

/** Israeli COA convention — first 3 digits map to type. */
export function inferAccountType(code: string): AccountType {
  const prefix = code.replace(/[^0-9]/g, '').slice(0, 3);
  const n = parseInt(prefix, 10);
  if (!Number.isFinite(n)) return 'asset';
  if (n >= 100 && n < 200) return 'asset';      // 100-199 — נכסים שוטפים + קבע
  if (n >= 200 && n < 300) return 'liability';  // 200-299 — ספקים, רשויות, התחייבויות
  if (n >= 300 && n < 400) return 'equity';     // 300-399 — הון
  if (n >= 400 && n < 500) return 'income';     // 400-499 — הכנסות (חלק מהמסחר)
  if (n >= 500 && n < 700) return 'expense';    // 500-699 — הוצאות (כולל COGS, שכר)
  if (n >= 700 && n < 800) return 'income';     // 700-799 — הכנסות מימון/אחר
  if (n >= 800 && n < 900) return 'expense';    // 800-899 — הוצאות חריגות
  if (n >= 900 && n < 1000) return 'equity';    // 900-999 — חשבונות סגירה / יתרות
  return 'asset';
}

/** "Normal balance" — accounts of these types are normally DR (positive when DR > CR). */
export function isDebitNormal(type: AccountType): boolean {
  return type === 'asset' || type === 'expense';
}

export interface JELineRow {
  je_id: string;
  je_status: string;
  je_scenario: string | null;
  document_date: string;
  value_date: string;
  reference1: string;
  details: string | null;
  account: string;
  debit: number;
  credit: number;
  line_details: string | null;
  je_number: number | null;
}

export interface DateRange {
  from: string; // ISO YYYY-MM-DD
  to: string;
}

/**
 * Fetch all JE lines for a company within a date range (by document_date).
 * Excludes status='cancelled' / 'error'.
 */
export async function fetchJELines(
  companyId: string,
  range: DateRange,
): Promise<JELineRow[]> {
  const admin = getAdminClient();

  // Pull JEs in range first.
  const { data: jeRows } = await admin
    .from('journal_entries')
    .select('id, status, scenario, document_date, value_date, reference1, details, je_number')
    .eq('company_id', companyId)
    .gte('document_date', range.from)
    .lte('document_date', range.to)
    .neq('status', 'cancelled')
    .neq('status', 'error');

  const jes = (jeRows ?? []) as Array<{
    id: string;
    status: string;
    scenario: string | null;
    document_date: string;
    value_date: string;
    reference1: string;
    details: string | null;
    je_number: number | null;
  }>;
  if (jes.length === 0) return [];

  const jeMap = new Map(jes.map((j) => [j.id, j]));
  const jeIds = jes.map((j) => j.id);

  // Pull lines in chunks (Supabase 'in' has size limits — ~1000 ok).
  const lines: JELineRow[] = [];
  const CHUNK = 500;
  for (let i = 0; i < jeIds.length; i += CHUNK) {
    const chunk = jeIds.slice(i, i + CHUNK);
    const { data: lineRows } = await admin
      .from('journal_entry_lines')
      .select('je_id, account, debit, credit, details')
      .in('je_id', chunk);
    for (const l of (lineRows ?? []) as Array<{
      je_id: string;
      account: string;
      debit: number;
      credit: number;
      details: string | null;
    }>) {
      const je = jeMap.get(l.je_id);
      if (!je) continue;
      lines.push({
        je_id: l.je_id,
        je_status: je.status,
        je_scenario: je.scenario,
        document_date: je.document_date,
        value_date: je.value_date,
        reference1: je.reference1,
        details: je.details,
        account: l.account,
        debit: Number(l.debit),
        credit: Number(l.credit),
        line_details: l.details,
        je_number: je.je_number,
      });
    }
  }

  return lines;
}

export interface AccountMeta {
  code: string;
  name: string;
  type: AccountType;
  source: 'master' | 'inferred';
}

/**
 * Pull the chart-of-accounts master + return a name/type lookup for a given
 * set of account codes. For codes missing from master, falls back to the
 * Israeli COA prefix convention and uses the code itself as name.
 */
export async function loadAccountMeta(
  companyId: string,
  accountCodes: string[],
): Promise<Map<string, AccountMeta>> {
  const admin = getAdminClient();
  const map = new Map<string, AccountMeta>();
  if (accountCodes.length === 0) return map;

  const { data: rows } = await admin
    .from('accounts')
    .select('code, name, type')
    .eq('company_id', companyId);

  for (const r of (rows ?? []) as Array<{ code: string; name: string; type: AccountType }>) {
    map.set(r.code, { code: r.code, name: r.name, type: r.type, source: 'master' });
  }

  // Fill in any codes that appeared in JEs but aren't in master.
  for (const code of accountCodes) {
    if (map.has(code)) continue;
    map.set(code, {
      code,
      name: prettifyMissingAccount(code),
      type: inferAccountType(code),
      source: 'inferred',
    });
  }
  return map;
}

function prettifyMissingAccount(code: string): string {
  // Supplier/customer sub-accounts: 200xxx / 120xxx are very common.
  if (/^2\d{5,}$/.test(code)) return `ספק (${code})`;
  if (/^1\d{5,}$/.test(code)) return `לקוח (${code})`;
  return code;
}

export interface AccountAggregate {
  code: string;
  name: string;
  type: AccountType;
  source: AccountMeta['source'];
  totalDebit: number;
  totalCredit: number;
  /** balance = DR - CR (positive = debit-side balance, negative = credit-side). */
  balance: number;
  /** Number of distinct JE lines that touched this account. */
  txCount: number;
}

/**
 * Aggregate JE lines per account. Returns entries sorted by code.
 */
export function aggregateByAccount(
  lines: JELineRow[],
  accountMeta: Map<string, AccountMeta>,
): AccountAggregate[] {
  const buckets = new Map<string, { dr: number; cr: number; count: number }>();
  for (const l of lines) {
    const cur = buckets.get(l.account) ?? { dr: 0, cr: 0, count: 0 };
    cur.dr += l.debit;
    cur.cr += l.credit;
    cur.count += 1;
    buckets.set(l.account, cur);
  }

  const out: AccountAggregate[] = [];
  for (const [code, sums] of buckets) {
    const meta = accountMeta.get(code) ?? {
      code,
      name: prettifyMissingAccount(code),
      type: inferAccountType(code),
      source: 'inferred' as const,
    };
    out.push({
      code: meta.code,
      name: meta.name,
      type: meta.type,
      source: meta.source,
      totalDebit: round2(sums.dr),
      totalCredit: round2(sums.cr),
      balance: round2(sums.dr - sums.cr),
      txCount: sums.count,
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ─────────── Date range presets ─────────── */

export interface NamedRange extends DateRange {
  label: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function ytd(year?: number): NamedRange {
  const now = new Date();
  const y = year ?? now.getUTCFullYear();
  return {
    from: `${y}-01-01`,
    to: `${y}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`,
    label: `YTD ${y}`,
  };
}

export function fullYear(year: number): NamedRange {
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    label: `שנת ${year}`,
  };
}

export function singleMonth(year: number, month: number): NamedRange {
  const lastDay = new Date(year, month, 0).getUTCDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
    label: `${pad(month)}/${year}`,
  };
}

export function resolveRangeFromQuery(
  sp: { from?: string; to?: string; preset?: string },
): NamedRange {
  if (sp.from && sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) {
    return { from: sp.from, to: sp.to, label: `${sp.from} → ${sp.to}` };
  }
  if (sp.preset?.startsWith('y_')) {
    const y = Number(sp.preset.slice(2));
    if (Number.isFinite(y)) return fullYear(y);
  }
  if (sp.preset?.startsWith('m_')) {
    const m = sp.preset.slice(2).split('-');
    const y = Number(m[0]);
    const mo = Number(m[1]);
    if (Number.isFinite(y) && Number.isFinite(mo)) return singleMonth(y, mo);
  }
  return ytd();
}
