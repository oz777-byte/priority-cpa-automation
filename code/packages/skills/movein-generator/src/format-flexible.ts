import iconv from 'iconv-lite';

const ENCODING = 'cp1255';
const TAB = '\t';
const CRLF = '\r\n';

/**
 * One line in movein.doc represents one JE line (not a whole JE record).
 * Multiple lines sharing the same reference1 form a single JE in Priority.
 */
export interface FlexibleLineInput {
  transactionType: string;        // up to 3
  reference1: string | number;    // up to 10 (full invoice number — no truncation)
  reference2?: string | number;   // up to 10
  documentDate: string;           // ISO YYYY-MM-DD
  valueDate: string;              // ISO YYYY-MM-DD
  currency: string;               // 3 chars
  account: string;                // up to 15
  side: 'D' | 'C';
  amountIls: number;
  amountFx?: number;
  costCenter?: string;            // up to 15
  allocationNumber?: string;      // up to 20 — full Israeli allocation
  details?: string;               // up to 60
}

export interface FlexibleFormatResult {
  /** movein.doc — the data file (CP1255 + CR/LF). */
  doc: Buffer;
  /** movein.prm — the parameters / column definitions. */
  prm: Buffer;
}

/**
 * Standard FLEXIBLE column layout used by this generator. The .prm file
 * declares these to Priority so it can parse the .doc file accordingly.
 *
 * If a particular Priority installation expects different widths, this is
 * the single place to adjust — all downstream tests and exports follow.
 */
export const FLEXIBLE_COLUMNS: Array<{
  name: string;
  width: number;
  type: 'alpha' | 'date' | 'decimal' | 'numeric';
}> = [
  { name: 'transaction_type',  width: 3,   type: 'alpha'   },
  { name: 'reference1',        width: 10,  type: 'alpha'   },
  { name: 'reference2',        width: 10,  type: 'alpha'   },
  { name: 'document_date',     width: 6,   type: 'date'    },
  { name: 'value_date',        width: 6,   type: 'date'    },
  { name: 'currency',          width: 3,   type: 'alpha'   },
  { name: 'account',           width: 15,  type: 'alpha'   },
  { name: 'side',              width: 1,   type: 'alpha'   },
  { name: 'amount_ils',        width: 14,  type: 'decimal' },
  { name: 'amount_fx',         width: 14,  type: 'decimal' },
  { name: 'cost_center',       width: 15,  type: 'alpha'   },
  { name: 'allocation_number', width: 20,  type: 'alpha'   },
  { name: 'details',           width: 60,  type: 'alpha'   },
];

function toDdmmyy(isoDate: string): string {
  const parts = isoDate.split('-');
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) throw new Error(`invalid ISO date: ${isoDate}`);
  return `${d}${m}${y.slice(-2)}`;
}

function toAlpha(value: string | number, width: number): string {
  const s = String(value ?? '');
  if (s.length > width) return s.slice(0, width);
  return s;
}

function toDecimal(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`amount must be finite: ${value}`);
  }
  return value.toFixed(2);
}

/** Build a single TSV row from one line input. */
function buildRow(line: FlexibleLineInput): string {
  const cells = [
    toAlpha(line.transactionType, 3),
    toAlpha(line.reference1, 10),
    toAlpha(line.reference2 ?? '', 10),
    toDdmmyy(line.documentDate),
    toDdmmyy(line.valueDate),
    toAlpha(line.currency, 3),
    toAlpha(line.account, 15),
    line.side,
    toDecimal(line.amountIls),
    toDecimal(line.amountFx ?? 0),
    toAlpha(line.costCenter ?? '', 15),
    toAlpha(line.allocationNumber ?? '', 20),
    toAlpha(line.details ?? '', 60),
  ];
  return cells.join(TAB);
}

/**
 * Generate the FLEXIBLE pair (movein.doc + movein.prm) as CP1255 buffers
 * with CR+LF line endings.
 */
export function generateMoveInFlex(
  lines: FlexibleLineInput[],
): FlexibleFormatResult {
  if (lines.length === 0) {
    throw new Error('generateMoveInFlex: at least one line required');
  }

  // movein.doc — one row per JE line.
  const docText = lines.map(buildRow).join(CRLF) + CRLF;
  const doc = iconv.encode(docText, ENCODING);

  // movein.prm — column definitions. Format is documented at the top of the
  // file itself: "HASH-FLEX | TAB | <column count>" then one row per column.
  const prmHeader = ['HASH-FLEX', 'TAB', String(FLEXIBLE_COLUMNS.length)].join('|');
  const prmRows = FLEXIBLE_COLUMNS.map((c) =>
    [c.name, String(c.width), c.type].join('|'),
  );
  const prmText = [prmHeader, ...prmRows].join(CRLF) + CRLF;
  const prm = iconv.encode(prmText, ENCODING);

  return { doc, prm };
}
