import iconv from 'iconv-lite';

/**
 * Hashavshevet SHORT-format journal-transaction file (movein.dat).
 *
 * Layout reverse-engineered byte-for-byte from files produced by Rivhit that
 * Hashavshevet imported successfully (June 2026 reference package):
 *
 *   offset (0-based) | width | field
 *   -----------------+-------+---------------------------------------------
 *   0                | 8     | debit account key   (left-aligned)
 *   8                | 8     | credit account key  (left-aligned)
 *   16               | 5     | reference (last 5 digits, left-aligned)
 *   21               | 6     | document date DDMMYY
 *   27               | 5     | reference 2 (left-aligned, '0' when none)
 *   32               | 6     | value date DDMMYY
 *   38               | 15    | ILS amount, '%.2f', left-aligned
 *   53               | 22    | details (Hebrew OK, truncated)
 *   75               | 13    | FX amount, '.00' when none, left-aligned
 *   -----------------+-------+---------------------------------------------
 *   total 88 chars per record + CR/LF. CP1255, no BOM.
 *
 * First line of the file is a numeric header. In the working reference files
 * it was close to — but NOT exactly — the record count (197 vs 192 records);
 * the semantics were never officially confirmed. We write the exact record
 * count, which loaded without a header-related rejection in testing.
 *
 * A compound journal entry is represented as multiple records sharing the
 * same reference. A record must never have debitAccount === creditAccount —
 * Hashavshevet rejects those with a "SAME ACCOUNTS" error (observed in a
 * real RDF error report, June 2026).
 */

export const SHORT_RECORD_LENGTH = 88;

export interface ShortRecordInput {
  debitAccount: string;
  creditAccount: string;
  /** Reference shared by all records of one JE; digits, up to 5 chars used. */
  reference: string | number;
  /** ISO YYYY-MM-DD, or '' when unknown (emitted as 000000). */
  documentDate: string;
  /** ISO YYYY-MM-DD, or '' (falls back to documentDate). */
  valueDate: string;
  amountIls: number;
  details?: string;
  amountFx?: number;
}

function pad(value: string | number, width: number): string {
  return String(value ?? '').slice(0, width).padEnd(width, ' ');
}

function toDdmmyy(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return '000000';
  return `${m[3]}${m[2]}${m[1]!.slice(-2)}`;
}

export function buildShortRecord(input: ShortRecordInput): string {
  if (!Number.isFinite(input.amountIls) || input.amountIls < 0) {
    throw new Error(`short record amount must be a non-negative number: ${input.amountIls}`);
  }
  const debit = input.debitAccount.trim();
  const credit = input.creditAccount.trim();
  if (debit === '' || credit === '') {
    throw new Error('short record requires both debit and credit accounts');
  }
  if (debit === credit) {
    throw new Error(`SAME ACCOUNTS guard: debit === credit (${debit})`);
  }
  const doc = toDdmmyy(input.documentDate);
  const val = input.valueDate ? toDdmmyy(input.valueDate) : doc;
  const fx = input.amountFx && input.amountFx > 0 ? input.amountFx.toFixed(2) : '.00';
  const record =
    pad(debit, 8) +
    pad(credit, 8) +
    pad(String(input.reference).replace(/\D/g, '').slice(-5) || '0', 5) +
    pad(doc, 6) +
    pad('0', 5) +
    pad(val, 6) +
    pad(input.amountIls.toFixed(2), 15) +
    pad(input.details ?? '', 22) +
    pad(fx, 13);
  if (record.length !== SHORT_RECORD_LENGTH) {
    throw new Error(`short record length ${record.length} !== ${SHORT_RECORD_LENGTH}`);
  }
  return record;
}

/** Generate the movein.dat buffer: count header line + fixed records, CP1255+CRLF. */
export function generateMoveInShort(records: ShortRecordInput[]): Buffer {
  if (records.length === 0) {
    throw new Error('generateMoveInShort: at least one record required');
  }
  const rows = records.map(buildShortRecord);
  const text = `${rows.length}\r\n${rows.join('\r\n')}\r\n`;
  return iconv.encode(text, 'cp1255');
}
