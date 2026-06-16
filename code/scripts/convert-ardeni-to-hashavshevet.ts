/**
 * One-off converter: Ardeni BKMV unified-structure → Hashavshevet MOVEIN files.
 *
 * Reads JSON produced by extract-ardeni-bkmv.ps1 and produces a pair:
 *   MOVEIN.DOC + MOVEIN.PRM (FLEXIBLE format, CP1255, CR+LF)
 *
 * Run with:
 *   npm run convert:ardeni
 *
 * Key decisions taken by this converter (no input required from user):
 *   1. Negative amounts → abs() + flip side. Mathematically preserves file balance.
 *   2. Grouping: walk by recordNo within each Batch, accumulate lines until DR=CR,
 *      then emit as one JE. Resolves the 22.5% individually-unbalanced TransNums.
 *   3. FX: ILS rows leave amountFx=0; GBP/EUR rows pass both amountIls AND amountFx.
 *   4. Account names from B110 are joined into the line "details" field for context.
 *   5. Output format: FLEXIBLE (no 4-line cap, no 5-digit reference cap).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateMoveInFlex,
  type FlexibleLineInput,
} from '../packages/skills/movein-generator/src/format-flexible.ts';

const INPUT_JSON = 'C:\\Users\\yaelc\\AppData\\Local\\Temp\\ardeni_data.json';
const OUTPUT_DIR = 'C:\\Users\\yaelc\\Downloads\\hashavshevet-ardeni';
const REPORT_PATH = join(OUTPUT_DIR, 'conversion-report.txt');
const MOVEIN_DOC = join(OUTPUT_DIR, 'MOVEIN.DOC');
const MOVEIN_PRM = join(OUTPUT_DIR, 'MOVEIN.PRM');

interface RawLine {
  recordNo: number;
  transNum: string;
  lineNum: number;
  batch: string;
  transType: string;
  ref1: string;
  ref2: string;
  details: string;
  valueDate: string; // YYYYMMDD
  docDate: string; // YYYYMMDD
  account: string;
  counter: string;
  sign: string; // '1' | '2'
  fxCurr: string;
  amount: number; // SIGNED in source
  fxAmount: number;
}

interface RawAccount {
  accountKey: string;
  accountName: string;
  trialCode: string;
  trialDesc: string;
  vatId: string;
}

interface RawData {
  company: { name: string; tax_id: string };
  accounts: RawAccount[];
  je_lines: RawLine[];
  stats: {
    total_b100: number;
    total_b110: number;
    signed_dr_sum: number;
    signed_cr_sum: number;
    signed_diff: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────

function isoDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return '2026-01-01';
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function normalizeLine(r: RawLine): {
  account: string;
  side: 'D' | 'C';
  amountIls: number;
  amountFx: number;
  currency: string;
} {
  // Decision 1: abs() + flip side when amount is negative
  // (Mathematically: A + D = B + C for the file's balance equation, where
  // A=positive_DR_sum, B=abs_negative_DR_sum, C=positive_CR_sum, D=abs_negative_CR_sum.
  // The file balances iff A-B = C-D iff A+D = B+C. After abs+flip, new_DR = A+D
  // and new_CR = B+C, which are equal — balance preserved.)
  const isNegative = r.amount < 0;
  const absAmount = Math.abs(r.amount);
  const effectiveSign = isNegative ? (r.sign === '1' ? '2' : '1') : r.sign;
  const side: 'D' | 'C' = effectiveSign === '1' ? 'D' : 'C';
  // FX: only wire when currency != ILS and FXAmount present
  const currency = r.fxCurr && r.fxCurr.trim() !== '' ? r.fxCurr.trim().toUpperCase() : 'ILS';
  const amountFx = currency !== 'ILS' ? Math.abs(r.fxAmount) : 0;
  return {
    account: r.account,
    side,
    amountIls: absAmount,
    amountFx,
    currency,
  };
}

// ─── Main ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`Reading ${INPUT_JSON}…`);
  const raw = JSON.parse(readFileSync(INPUT_JSON, 'utf-8')) as RawData;

  console.log(
    `  Company: ${raw.company.name} (${raw.company.tax_id})`,
  );
  console.log(
    `  B100=${raw.je_lines.length}  B110=${raw.accounts.length}`,
  );
  console.log(
    `  Source balance check: DR=${raw.stats.signed_dr_sum.toFixed(2)}  CR=${raw.stats.signed_cr_sum.toFixed(2)}  diff=${raw.stats.signed_diff.toFixed(2)}`,
  );

  // Build account name lookup
  const acctName = new Map<string, string>();
  for (const a of raw.accounts) {
    acctName.set(a.accountKey, a.accountName);
  }

  // Group by batch, preserving order by recordNo
  const byBatch = new Map<string, RawLine[]>();
  for (const r of raw.je_lines) {
    const arr = byBatch.get(r.batch) ?? [];
    arr.push(r);
    byBatch.set(r.batch, arr);
  }
  console.log(`  Batches: ${byBatch.size}`);

  // For each batch: walk in recordNo order, accumulate until balanced.
  const flexLines: FlexibleLineInput[] = [];
  let jeIndex = 0;
  let unbalancedBatchCount = 0;
  let totalNewDrSum = 0;
  let totalNewCrSum = 0;
  let fxLineCount = 0;
  const currencyCounts = new Map<string, number>();
  let dateOutOfRangeCount = 0;
  let mergedJeCount = 0; // JEs formed from >1 source TransNum
  let singleTransJeCount = 0;

  for (const [batchNum, batchLines] of byBatch) {
    batchLines.sort((a, b) => a.recordNo - b.recordNo);

    let acc: RawLine[] = [];
    let drSum = 0;
    let crSum = 0;
    const transNumsInAcc = new Set<string>();

    const flush = (lines: RawLine[]): void => {
      jeIndex += 1;
      const first = lines[0]!;
      const docDateIso = isoDate(first.docDate);
      const valDateIso = isoDate(first.valueDate);
      const docYear = parseInt(docDateIso.slice(0, 4), 10);
      const valYear = parseInt(valDateIso.slice(0, 4), 10);
      if (docYear !== 2026 || valYear !== 2026) dateOutOfRangeCount += 1;

      // Pick representative metadata
      const reference1 = String(jeIndex); // unique JE id in the output file
      const reference2 = first.ref1 || first.transNum;
      const detailsBase = first.details || '';
      // Currency = first non-ILS, else ILS
      let jeCurrency = 'ILS';
      for (const l of lines) {
        if (l.fxCurr && l.fxCurr !== 'ILS' && l.fxCurr.trim() !== '') {
          jeCurrency = l.fxCurr.trim().toUpperCase();
          break;
        }
      }

      if (transNumsInAcc.size > 1) mergedJeCount += 1;
      else singleTransJeCount += 1;

      for (const l of lines) {
        const norm = normalizeLine(l);
        const lineCurrency = norm.currency;
        currencyCounts.set(lineCurrency, (currencyCounts.get(lineCurrency) ?? 0) + 1);
        if (lineCurrency !== 'ILS') fxLineCount += 1;
        if (norm.side === 'D') totalNewDrSum += norm.amountIls;
        else totalNewCrSum += norm.amountIls;

        const accountDisplay = acctName.get(l.account) ?? '';
        const lineDetails = detailsBase
          ? accountDisplay
            ? `${detailsBase} | ${accountDisplay}`.slice(0, 60)
            : detailsBase.slice(0, 60)
          : accountDisplay.slice(0, 60);

        flexLines.push({
          transactionType: lines.length > 1 ? 'מ' : 'ת',
          reference1,
          reference2: String(reference2).slice(0, 10),
          documentDate: docDateIso,
          valueDate: valDateIso,
          currency: jeCurrency.slice(0, 3),
          account: l.account.slice(0, 15),
          side: norm.side,
          amountIls: norm.amountIls,
          amountFx: norm.amountFx,
          details: lineDetails,
        });
      }
    };

    for (const r of batchLines) {
      acc.push(r);
      transNumsInAcc.add(r.transNum);
      const absAmount = Math.abs(r.amount);
      const isNegative = r.amount < 0;
      const effectiveSign = isNegative ? (r.sign === '1' ? '2' : '1') : r.sign;
      if (effectiveSign === '1') drSum += absAmount;
      else crSum += absAmount;

      if (Math.abs(drSum - crSum) < 0.005 && drSum > 0.005) {
        // Balanced! Emit.
        flush(acc);
        acc = [];
        drSum = 0;
        crSum = 0;
        transNumsInAcc.clear();
      }
    }

    if (acc.length > 0) {
      console.warn(
        `  ⚠ Batch ${batchNum}: ${acc.length} unbalanced trailing lines (DR=${drSum.toFixed(2)}, CR=${crSum.toFixed(2)})`,
      );
      unbalancedBatchCount += 1;
      // Emit anyway so no data is silently lost
      flush(acc);
    }
  }

  console.log('');
  console.log(`✓ Built ${jeIndex} balanced JEs (${flexLines.length} total lines)`);
  console.log(`  Single-source JEs: ${singleTransJeCount}`);
  console.log(`  Merged JEs (>1 source TransNum): ${mergedJeCount}`);
  console.log(`  Unbalanced batch trailers: ${unbalancedBatchCount}`);
  console.log(`  New DR sum: ${totalNewDrSum.toFixed(2)}`);
  console.log(`  New CR sum: ${totalNewCrSum.toFixed(2)}`);
  console.log(`  Net imbalance: ${(totalNewDrSum - totalNewCrSum).toFixed(2)}`);
  console.log('');
  console.log(`  FX lines: ${fxLineCount}`);
  for (const [cur, cnt] of currencyCounts) {
    console.log(`    ${cur}: ${cnt}`);
  }
  console.log(`  Date-out-of-2026 JEs: ${dateOutOfRangeCount}`);

  if (Math.abs(totalNewDrSum - totalNewCrSum) > 0.05) {
    throw new Error(
      `Net imbalance ${(totalNewDrSum - totalNewCrSum).toFixed(2)} exceeds 0.05 tolerance — DO NOT export.`,
    );
  }

  // ─── Generate the MOVEIN files ─────────────────────────────────
  console.log('');
  console.log('Calling generateMoveInFlex…');
  const { doc, prm } = generateMoveInFlex(flexLines);

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  writeFileSync(MOVEIN_DOC, doc);
  writeFileSync(MOVEIN_PRM, prm);

  console.log(`✓ Wrote ${MOVEIN_DOC} (${doc.length} bytes)`);
  console.log(`✓ Wrote ${MOVEIN_PRM} (${prm.length} bytes)`);

  // ─── Write a Hebrew report ─────────────────────────────────────
  const report = `דוח המרה — ארדני BKMV → חשבשבת MOVEIN

חברה: ${raw.company.name}
ח.פ.: ${raw.company.tax_id}
תאריך הפקה: ${new Date().toISOString().slice(0, 10)}

ספירות:
  שורות B100 בקלט: ${raw.je_lines.length}
  חשבונות B110 בקלט: ${raw.accounts.length}
  אצוות מקור: ${byBatch.size}

פקודות יומן בפלט:
  סה"כ: ${jeIndex}
  לפי מספר-תנועה יחיד: ${singleTransJeCount}
  מורכבות מ-N>1 מספרי-תנועה (מיזוג עד איזון): ${mergedJeCount}
  אצוות עם שורות יתומות בסוף: ${unbalancedBatchCount}
  שורות סה"כ בקובץ: ${flexLines.length}

איזון:
  סה"כ חובה בפלט: ${totalNewDrSum.toFixed(2)} ש"ח
  סה"כ זכות בפלט: ${totalNewCrSum.toFixed(2)} ש"ח
  הפרש: ${(totalNewDrSum - totalNewCrSum).toFixed(2)} ש"ח

מטבעות:
${Array.from(currencyCounts).map(([c, n]) => `  ${c}: ${n} שורות`).join('\n')}

קבצי פלט:
  MOVEIN.DOC — ${doc.length} בייט (תוכן התנועות)
  MOVEIN.PRM — ${prm.length} בייט (הגדרת עמודות)

קידוד: Windows-1255 (CP1255), CR+LF.
פורמט: FLEXIBLE (חשבשבת H-ERP / חשבשבת בענן).
`;

  writeFileSync(REPORT_PATH, report, 'utf-8');
  console.log(`✓ Wrote ${REPORT_PATH}`);
  console.log('');
  console.log('🎉 Done. Files ready for Hashavshevet import.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
