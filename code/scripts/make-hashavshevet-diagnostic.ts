/**
 * Builds a tiny Hashavshevet diagnostic package with synthetic data, used to
 * settle the open loading questions from the June 2026 failure forensics in
 * a single 5-minute session against a live Hashavshevet company:
 *
 *   H1 — do account cards load and keep their names when HESHIN is imported
 *        BEFORE any transactions?
 *   H3 — does the numeric header line have to be the exact record count?
 *        (variant files differ only in the header value)
 *
 * Usage:
 *   npm run diagnostic:hashavshevet [-- <output-dir>]
 *
 * Output (default ./hashavshevet-diagnostic):
 *   HESHIN.DAT / HESHIN.PRM        — 5 synthetic account cards
 *   movein.dat                     — 10 records, header = exact count (10)
 *   movein-header-plus5.dat        — same records, header = 15
 *   movein-header-1.dat            — same records, header = 1
 *   README.txt                     — Hebrew checklist for the operator
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
// Leaf-module imports (not the package index): node --experimental-strip-types
// cannot resolve the index's `.js` re-export specifiers back to `.ts` sources.
import {
  generateMoveInShort,
  type ShortRecordInput,
} from '../packages/skills/hashavshevet-generator/src/movein-short.ts';
import { generateHeshin } from '../packages/skills/hashavshevet-generator/src/heshin.ts';

const outDir = process.argv[2] ?? 'hashavshevet-diagnostic';
mkdirSync(outDir, { recursive: true });

const accounts = [
  { accountKey: '90001', accountName: 'בדיקה - בנק', taxId: '' },
  { accountKey: '90002', accountName: 'בדיקה - קופה', taxId: '' },
  { accountKey: '90003', accountName: 'בדיקה - לקוח א', taxId: '512345674' },
  { accountKey: '90004', accountName: 'בדיקה - ספק ב', taxId: '515555558' },
  { accountKey: '90005', accountName: 'בדיקה - הכנסות', taxId: '' },
];

const records: ShortRecordInput[] = [];
for (let i = 1; i <= 5; i++) {
  // Two balanced records per JE: customer -> income, bank -> customer.
  records.push({
    debitAccount: '90003',
    creditAccount: '90005',
    reference: i,
    documentDate: `2026-01-${String(i + 10).padStart(2, '0')}`,
    valueDate: `2026-01-${String(i + 10).padStart(2, '0')}`,
    amountIls: 100 + i,
    details: `בדיקת קליטה ${i}`,
  });
  records.push({
    debitAccount: '90001',
    creditAccount: '90003',
    reference: i,
    documentDate: `2026-01-${String(i + 10).padStart(2, '0')}`,
    valueDate: `2026-01-${String(i + 10).padStart(2, '0')}`,
    amountIls: 100 + i,
    details: `בדיקת קליטה ${i}`,
  });
}

const { dat, prm } = generateHeshin(
  accounts.map((a) => (a.taxId ? a : { accountKey: a.accountKey, accountName: a.accountName })),
);
writeFileSync(join(outDir, 'HESHIN.DAT'), dat);
writeFileSync(join(outDir, 'HESHIN.PRM'), prm);

const movein = generateMoveInShort(records);
writeFileSync(join(outDir, 'movein.dat'), movein);

// Header variants: identical records, different header value.
function withHeader(buf: Buffer, headerValue: string): Buffer {
  const crlf = buf.indexOf('\r\n');
  return Buffer.concat([Buffer.from(headerValue, 'ascii'), buf.subarray(crlf)]);
}
writeFileSync(join(outDir, 'movein-header-plus5.dat'), withHeader(movein, String(records.length + 5)));
writeFileSync(join(outDir, 'movein-header-1.dat'), withHeader(movein, '1'));

const README = `חבילת אבחון חשבשבת — 5 דקות, שלוש תשובות

הכנה: חברה חדשה ריקה לגמרי בחשבשבת. הקבצים לתיקיית rep.

בדיקה 1 (H1 — כרטיסים):
  קלוט את HESHIN.DAT (כללי -> ממשקים -> קליטת חשבונות מקובץ).
  צפוי: 5 כרטיסים, 90003 בשם "בדיקה - לקוח א" עם ח.פ.
  אם נכשל — צלם את הודעת השגיאה במלואה. זו התשובה החשובה ביותר.

בדיקה 2 (תנועות אחרי כרטיסים):
  קלוט את movein.dat (קליטת תנועות יומן, מנה חדשה).
  צפוי: 10 רשומות, חובה=זכות, שמות הכרטיסים נשמרים.

בדיקה 3 (H3 — שורת הכותרת), רק אם בדיקה 2 עברה:
  קלוט את movein-header-plus5.dat למנה חדשה, ואז את movein-header-1.dat.
  אם שניהם נקלטים באותה צורה — הכותרת אינה נבדקת; אם אחד נדחה/נחתך —
  צלם את התוצאה. זה מכריע את סמנטיקת הכותרת.

בכל תקלה: צילום מסך מלא של ההודעה + דוח השגיאות (RDF) אם נוצר.
`;
writeFileSync(join(outDir, 'README.txt'), README, 'utf-8');

console.log(`Diagnostic package written to ${outDir}/`);
console.log('  HESHIN.DAT, HESHIN.PRM, movein.dat, movein-header-plus5.dat, movein-header-1.dat, README.txt');
