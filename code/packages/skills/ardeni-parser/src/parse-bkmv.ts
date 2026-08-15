import iconv from 'iconv-lite';

/**
 * Parser for the Israeli unified-format export (OF1.31 "open format",
 * file BKMVDATA.TXT). This is a Tax-Authority regulatory standard, so the
 * same parser handles exports from any compliant accounting software
 * (Ardeni, Hashavshevet, Rivhit, …) — record types are detected by their
 * leading 4-character code, never by vendor name.
 *
 * Field offsets are ported verbatim from extract-ardeni-bkmv.ps1, the
 * PowerShell extractor validated on the 4,492-line Ardeni POC file. The
 * source file MUST be decoded as CP1255 (Windows-1255) — UTF-8 corrupts
 * Hebrew and breaks the fixed-width offsets.
 */

const ENCODING = 'cp1255';

/** A single journal-transaction line (record type B100). */
export interface BkmvJournalLine {
  recordNo: number; // running record number within the file — grouping order
  transNum: string; // source transaction number (NOT a reliable JE boundary)
  batch: string; // batch/מנה — the invariant that actually balances
  details: string; // free-text description
  valueDate: string; // YYYYMMDD
  docDate: string; // YYYYMMDD
  account: string; // account key as it appears in the source ledger
  sign: string; // '1' = debit, '2' = credit
  fxCurr: string; // ISO currency code; '' when ILS / blank
  amount: number; // SIGNED amount in shekels (agorot / 100)
  fxAmount: number; // SIGNED foreign-currency amount in major units
}

/** A bookkeeping account record (record type B110). */
export interface BkmvAccount {
  accountKey: string;
  accountName: string;
  /** Company/dealer id (positions 327-335); '' when absent or all zeros. */
  taxId: string;
}

/** Company identity. Sourced from the A100 opening record / INI.TXT. */
export interface BkmvCompany {
  taxId: string;
  name: string;
}

/** File-level sanity figures, computed from the parsed B100 lines. */
export interface BkmvStats {
  totalB100: number;
  totalB110: number;
  signedDrSum: number; // sum of signed amounts flagged debit ('1')
  signedCrSum: number; // sum of signed amounts flagged credit ('2')
  signedDiff: number; // signedDrSum - signedCrSum
}

export interface ParsedBkmv {
  company: BkmvCompany;
  accounts: BkmvAccount[];
  jeLines: BkmvJournalLine[];
  stats: BkmvStats;
  /** 4-char code of the first non-blank record — used for the A100 guard. */
  openingRecordType: string;
}

// ─── Field offsets (1-based START, as documented in the PS extractor) ───────

interface Field {
  start: number;
  len: number;
}

const B100: Record<string, Field> = {
  recordNo: { start: 5, len: 9 },
  transNum: { start: 23, len: 10 },
  batch: { start: 38, len: 8 },
  details: { start: 107, len: 50 },
  valueDate: { start: 157, len: 8 },
  docDate: { start: 165, len: 8 },
  account: { start: 173, len: 15 },
  sign: { start: 203, len: 1 },
  fxCurr: { start: 204, len: 3 },
  amount: { start: 207, len: 15 },
  fxAmount: { start: 222, len: 15 },
};

const B110: Record<string, Field> = {
  accountKey: { start: 23, len: 15 },
  accountName: { start: 38, len: 50 },
  // Verified against real Ardeni data (June 2026): e.g. account 170 carries
  // its 9-digit company id at positions 327-335; zero-filled when absent.
  taxId: { start: 327, len: 9 },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Extract a fixed-width field (1-based start) and trim surrounding spaces. */
function field(line: string, f: Field): string {
  return line.substring(f.start - 1, f.start - 1 + f.len).trim();
}

/**
 * Parse a 15-char amount field: char 1 is the sign (+/-), the remaining
 * characters are agorot with zero-padding. Returns signed shekels.
 */
function parseAmountField(raw: string): number {
  const s = raw.trim();
  if (s === '') return 0;
  const head = s.charAt(0);
  const negative = head === '-';
  const body = head === '+' || head === '-' ? s.slice(1) : s;
  const digits = body.replace(/\D/g, '');
  if (digits === '') return 0;
  const agorot = Number.parseInt(digits, 10);
  if (Number.isNaN(agorot)) return 0;
  const shekels = agorot / 100;
  return negative ? -shekels : shekels;
}

function parseB100(line: string): BkmvJournalLine {
  const recordNo = Number.parseInt(field(line, B100.recordNo!), 10);
  const fxCurr = field(line, B100.fxCurr!);
  return {
    recordNo: Number.isNaN(recordNo) ? 0 : recordNo,
    transNum: field(line, B100.transNum!),
    batch: field(line, B100.batch!),
    details: field(line, B100.details!),
    valueDate: field(line, B100.valueDate!),
    docDate: field(line, B100.docDate!),
    account: field(line, B100.account!),
    sign: field(line, B100.sign!),
    fxCurr: fxCurr === 'ILS' ? '' : fxCurr,
    amount: parseAmountField(field(line, B100.amount!)),
    fxAmount: parseAmountField(field(line, B100.fxAmount!)),
  };
}

function parseB110(line: string): BkmvAccount {
  const rawTaxId = field(line, B110.taxId!);
  const taxId = /^\d{8,9}$/.test(rawTaxId) && !/^0+$/.test(rawTaxId) ? rawTaxId : '';
  return {
    accountKey: field(line, B110.accountKey!),
    accountName: field(line, B110.accountName!),
    taxId,
  };
}

// ─── Entry point ──────────────────────────────────────────────────────────

/**
 * Parse a raw BKMVDATA.TXT buffer (or already-decoded string) into the
 * canonical structure consumed by the MOVEIN converter.
 *
 * NOTE: company.taxId / company.name are not yet extracted from A100 — the
 * authoritative A100 offsets are pending verification against a sample file.
 * They are currently sourced alongside from INI.TXT by the caller.
 */
export function parseBkmv(input: Buffer | string): ParsedBkmv {
  const text = typeof input === 'string' ? input : iconv.decode(input, ENCODING);
  const lines = text.split(/\r\n|\n/);

  const jeLines: BkmvJournalLine[] = [];
  const accounts: BkmvAccount[] = [];
  let openingRecordType = '';

  for (const raw of lines) {
    if (raw.length < 4) continue;
    const type = raw.substring(0, 4);
    if (openingRecordType === '' && type.trim() !== '') {
      openingRecordType = type;
    }
    if (type === 'B100') {
      jeLines.push(parseB100(raw));
    } else if (type === 'B110') {
      accounts.push(parseB110(raw));
    }
  }

  let signedDrSum = 0;
  let signedCrSum = 0;
  for (const l of jeLines) {
    if (l.sign === '1') signedDrSum += l.amount;
    else if (l.sign === '2') signedCrSum += l.amount;
  }

  return {
    company: { taxId: '', name: '' },
    accounts,
    jeLines,
    stats: {
      totalB100: jeLines.length,
      totalB110: accounts.length,
      signedDrSum,
      signedCrSum,
      signedDiff: signedDrSum - signedCrSum,
    },
    openingRecordType,
  };
}
