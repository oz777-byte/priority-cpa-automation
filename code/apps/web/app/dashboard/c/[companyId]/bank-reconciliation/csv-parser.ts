/**
 * Generic CSV parser for Israeli bank statements.
 *
 * Supports the most common shapes:
 *   - 4 columns: date, description, amount, balance
 *   - 5 columns: date, description, debit, credit, balance (Hapoalim-style)
 *
 * Auto-detects header row by looking for known Hebrew column names and
 * skips it; otherwise treats the first row as data.
 */

export interface ParsedTxn {
  date: string;        // ISO YYYY-MM-DD
  description: string;
  reference: string | null;
  amount: number;      // signed: negative = outflow, positive = inflow
  balance: number | null;
}

export interface ParseResult {
  rows: ParsedTxn[];
  rejected: Array<{ line: number; raw: string; reason: string }>;
}

const HEADER_KEYWORDS = ['תאריך', 'date', 'פרטים', 'תיאור', 'description', 'סכום', 'amount', 'יתרה', 'balance', 'חובה', 'זכות'];

export function parseBankCsv(text: string): ParseResult {
  // Strip BOM, normalize line endings.
  const stripped = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = stripped.split('\n').filter((l) => l.trim().length > 0);

  const rows: ParsedTxn[] = [];
  const rejected: Array<{ line: number; raw: string; reason: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const cells = parseCsvLine(raw);

    // Skip header row.
    if (i === 0 && looksLikeHeader(cells)) continue;

    if (cells.length < 3) {
      rejected.push({ line: i + 1, raw, reason: 'פחות משלוש עמודות' });
      continue;
    }

    const [dateRaw, descRaw, amountOrDebit, creditOrBalance, maybeBalance] = cells;
    const date = parseDate(dateRaw ?? '');
    if (!date) {
      rejected.push({ line: i + 1, raw, reason: `תאריך לא תקין: ${dateRaw}` });
      continue;
    }
    const description = (descRaw ?? '').trim();
    if (!description) {
      rejected.push({ line: i + 1, raw, reason: 'תיאור ריק' });
      continue;
    }

    let amount: number | null = null;
    let balance: number | null = null;

    if (cells.length === 5 && maybeBalance !== undefined) {
      // 5-col layout: date | description | debit | credit | balance
      const debit = parseNumber(amountOrDebit ?? '');
      const credit = parseNumber(creditOrBalance ?? '');
      balance = parseNumber(maybeBalance);
      if (debit !== null && debit !== 0) amount = -debit;
      else if (credit !== null && credit !== 0) amount = credit;
      else amount = 0;
    } else if (cells.length >= 3) {
      // 4-col (or 3-col): date | description | amount [| balance]
      amount = parseNumber(amountOrDebit ?? '');
      balance = creditOrBalance ? parseNumber(creditOrBalance) : null;
    }

    if (amount === null) {
      rejected.push({ line: i + 1, raw, reason: `סכום לא תקין: ${amountOrDebit}` });
      continue;
    }

    rows.push({
      date,
      description,
      reference: null,
      amount: Math.round(amount * 100) / 100,
      balance: balance !== null ? Math.round(balance * 100) / 100 : null,
    });
  }

  return { rows, rejected };
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function looksLikeHeader(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase();
  return HEADER_KEYWORDS.some((kw) => joined.includes(kw.toLowerCase()));
}

function parseDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  // ISO YYYY-MM-DD (already canonical)
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  // DD/MM/YYYY or DD-MM-YYYY
  const m = t.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (m) {
    const [, dd, mm, yy] = m;
    const day = String(Number(dd)).padStart(2, '0');
    const month = String(Number(mm)).padStart(2, '0');
    let year = Number(yy);
    if (year < 100) year += 2000;
    return `${year}-${month}-${day}`;
  }
  return null;
}

function parseNumber(s: string): number | null {
  const t = s.trim().replace(/,/g, '').replace(/[₪]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Stable hash of (account, date, amount, balance) for dedup keys. */
export function hashRow(
  account: string,
  date: string,
  amount: number,
  balance: number | null,
): string {
  return [account, date, amount.toFixed(2), balance?.toFixed(2) ?? ''].join('|');
}
