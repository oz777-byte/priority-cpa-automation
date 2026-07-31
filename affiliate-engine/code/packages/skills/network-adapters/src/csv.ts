import { AdapterError } from './types.ts';

/**
 * Minimal RFC 4180 CSV reader.
 *
 * Network exports routinely contain quoted commas (advertiser names) and
 * embedded newlines (note fields), so splitting on commas loses rows silently.
 * A dependency would do, but this stays runnable inside an Edge function.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  // A BOM at the start of a Windows-produced export would otherwise become
  // part of the first header name and break every column lookup.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  while (i < text.length) {
    const char = text[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (char === '\r') {
      i += 1;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  if (inQuotes) {
    throw new AdapterError('malformed CSV: unterminated quoted field');
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export interface CsvTable {
  headers: string[];
  /** One record per row, keyed by normalised header name. */
  records: Array<Record<string, string>>;
}

/** Lowercases and strips punctuation so "Sale Amount" and "sale_amount" match. */
export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function toTable(input: string): CsvTable {
  const rows = parseCsv(input).filter((row) => row.some((cell) => cell.trim() !== ''));
  const headerRow = rows[0];
  if (!headerRow) throw new AdapterError('CSV has no header row');

  const headers = headerRow.map(normalizeHeader);
  const records = rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (row[index] ?? '').trim();
    });
    return record;
  });

  return { headers, records };
}

/** Returns the first present column among the given aliases. */
export function pick(
  record: Record<string, string>,
  aliases: string[],
): string | undefined {
  for (const alias of aliases) {
    const value = record[alias];
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}
