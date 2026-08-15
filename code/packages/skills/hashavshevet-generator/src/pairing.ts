import type { ShortRecordInput } from './movein-short.js';

/**
 * Converts balanced journal entries (arbitrary debit/credit line sets) into
 * SHORT-format debit-against-credit pairs.
 *
 * Two hard-won rules are encoded here (both discovered against a real
 * Hashavshevet import, June 2026):
 *
 * 1. NET PER ACCOUNT FIRST. Within one JE the same account may appear on
 *    both sides (pass-through movements). Pairing raw lines produced records
 *    with debit === credit, which Hashavshevet rejects as "SAME ACCOUNTS".
 *    Netting each account to its net side eliminates those records while
 *    preserving every account balance exactly.
 *
 * 2. INTEGER AGOROT. All accumulation is done in integer agorot (cents) so
 *    float drift can never split or merge a pairing.
 */

export interface JeLineForPairing {
  account: string;
  side: 'D' | 'C';
  amountIls: number;
}

export interface JeForPairing {
  /** Unique sequential id — becomes the record reference. */
  index: number;
  documentDate: string; // ISO or ''
  valueDate: string; // ISO or ''
  details?: string;
  lines: JeLineForPairing[];
}

function toCents(v: number): number {
  return Math.round(v * 100);
}

/** Greedy debit-vs-credit matching over per-account net balances. */
export function pairEntry(je: JeForPairing): ShortRecordInput[] {
  const net = new Map<string, number>(); // account -> net cents (+debit / -credit)
  for (const l of je.lines) {
    const cents = toCents(l.amountIls);
    net.set(l.account, (net.get(l.account) ?? 0) + (l.side === 'D' ? cents : -cents));
  }
  const debits: Array<[string, number]> = [];
  const credits: Array<[string, number]> = [];
  for (const [account, cents] of net) {
    if (cents > 0) debits.push([account, cents]);
    else if (cents < 0) credits.push([account, -cents]);
  }

  const out: ShortRecordInput[] = [];
  let a = 0;
  let b = 0;
  while (a < debits.length && b < credits.length) {
    const d = debits[a]!;
    const c = credits[b]!;
    if (d[0] === c[0]) {
      // Cannot happen after netting (an account has one net side), but keep
      // the guard so a future regression fails loudly instead of exporting.
      throw new Error(`pairing produced SAME ACCOUNTS for ${d[0]} in JE ${je.index}`);
    }
    const m = Math.min(d[1], c[1]);
    if (m > 0) {
      out.push({
        debitAccount: d[0],
        creditAccount: c[0],
        reference: je.index,
        documentDate: je.documentDate,
        valueDate: je.valueDate,
        amountIls: m / 100,
        details: (je.details ?? '').slice(0, 22),
      });
    }
    d[1] -= m;
    c[1] -= m;
    if (d[1] === 0) a += 1;
    if (c[1] === 0) b += 1;
  }
  return out;
}

export interface PairingResult {
  records: ShortRecordInput[];
  /** JEs whose net debit total !== net credit total (skipped, reported). */
  unbalancedJeIndexes: number[];
}

export function pairEntries(entries: JeForPairing[]): PairingResult {
  const records: ShortRecordInput[] = [];
  const unbalancedJeIndexes: number[] = [];
  for (const je of entries) {
    let dr = 0;
    let cr = 0;
    for (const l of je.lines) {
      const cents = toCents(l.amountIls);
      if (l.side === 'D') dr += cents;
      else cr += cents;
    }
    if (dr !== cr) {
      unbalancedJeIndexes.push(je.index);
      continue;
    }
    records.push(...pairEntry(je));
  }
  return { records, unbalancedJeIndexes };
}
