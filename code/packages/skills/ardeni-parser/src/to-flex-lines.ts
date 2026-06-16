import type { FlexibleLineInput } from '@priority-cpa/movein-generator';
import type { JournalEntry } from './group-to-jes.js';
import type { BkmvAccount } from './parse-bkmv.js';

/**
 * Adapter: balanced journal entries → FlexibleLineInput[] for the MOVEIN
 * generator. One output row per JE line; rows sharing reference1 form one JE
 * in the target system.
 */
export function toFlexLines(entries: JournalEntry[]): FlexibleLineInput[] {
  const out: FlexibleLineInput[] = [];
  for (const e of entries) {
    const transactionType = e.lines.length > 1 ? 'מ' : 'ת';
    const reference1 = String(e.index);
    for (const l of e.lines) {
      out.push({
        transactionType,
        reference1,
        reference2: e.reference2,
        documentDate: e.documentDate,
        valueDate: e.valueDate,
        currency: l.currency.slice(0, 3),
        account: l.account.slice(0, 15),
        side: l.side,
        amountIls: l.amountIls,
        amountFx: l.amountFx,
        details: l.details,
      });
    }
  }
  return out;
}

/**
 * Only accounts that actually appear in posted lines are relevant for the
 * target ledger. In the POC, 83% of B110 cards were orphans — emitting them
 * would create thousands of dead accounts in Priority.
 */
export function requiredAccounts(
  entries: JournalEntry[],
  accounts: BkmvAccount[],
): BkmvAccount[] {
  const used = new Set<string>();
  for (const e of entries) {
    for (const l of e.lines) used.add(l.account);
  }
  return accounts.filter((a) => used.has(a.accountKey));
}
