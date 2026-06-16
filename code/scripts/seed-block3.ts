/**
 * One-off seed: load "Block 3" company from BKMV unified-structure data.
 *
 * Reads JSON produced by PowerShell extractor at:
 *   C:\Users\yaelc\AppData\Local\Temp\block3_data.json
 *
 * Run with:
 *   npm run seed:block3
 *
 * Idempotent: wipes existing Block 3 (by tax_id) in oz's firm before reload.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

function abort(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (!url) abort('SUPABASE_URL missing in .env.local');
if (!secretKey) abort('SUPABASE_SECRET_KEY missing in .env.local');

const admin = createClient(url, secretKey, {
  auth: { persistSession: false },
});

interface AccountRaw {
  accountKey: string;
  accountName: string;
  trialCode: string;
  trialDesc: string;
  city: string;
  vatId: string;
}
interface JELineRaw {
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
  sign: string; // "1" or "2"
  fxCurr: string;
  amount: number;
  fxAmount: number;
}

const dataPath = 'C:\\Users\\yaelc\\AppData\\Local\\Temp\\block3_data.json';
const raw = JSON.parse(readFileSync(dataPath, 'utf-8')) as {
  company: { name: string; tax_id: string };
  accounts: AccountRaw[];
  je_lines: JELineRaw[];
};

console.log(
  `Loaded ${raw.accounts.length} accounts + ${raw.je_lines.length} JE lines from JSON`,
);

function parseDate(yyyymmdd: string): string | null {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return `${y}-${m}-${d}`;
}

async function main(): Promise<void> {
  // Find oz's firm
  const ozEmail = 'oz@oz-nihul.com';
  const { data: ozUser } = await admin
    .from('users')
    .select('id')
    .eq('email', ozEmail)
    .maybeSingle();
  if (!ozUser) abort(`User ${ozEmail} not found`);
  const { data: firm } = await admin
    .from('user_firms')
    .select('firm_id')
    .eq('user_id', ozUser.id)
    .limit(1)
    .maybeSingle();
  if (!firm) abort(`No firm linked to ${ozEmail}`);
  const firmId = firm.firm_id as string;

  // Wipe existing Block 3
  const { data: existing } = await admin
    .from('companies')
    .select('id')
    .eq('firm_id', firmId)
    .eq('tax_id', raw.company.tax_id)
    .maybeSingle();
  if (existing) {
    console.log(`✓ Existing "${raw.company.name}" found, wiping…`);
    await admin.from('companies').delete().eq('id', existing.id);
  }

  // Create company
  const { data: companyRow, error: cErr } = await admin
    .from('companies')
    .insert({
      firm_id: firmId,
      name: raw.company.name,
      tax_id: raw.company.tax_id,
      vat_basis: 'accrual',
      vat_filing_frequency: 'bimonthly',
      settings: {
        source: 'bkmv_unified_format',
        currency: 'ILS',
      },
    })
    .select('id')
    .single();
  if (cErr || !companyRow) abort(`Company insert failed: ${cErr?.message}`);
  const companyId = companyRow.id as string;
  console.log(`✓ Company created: ${companyId}`);

  // Group JE lines by trans#
  const byTrans = new Map<string, JELineRaw[]>();
  for (const r of raw.je_lines) {
    const arr = byTrans.get(r.transNum) ?? [];
    arr.push(r);
    byTrans.set(r.transNum, arr);
  }
  console.log(`✓ Grouped into ${byTrans.size} journal entries`);

  // Insert JEs one trans# at a time (batch could timeout)
  let jeCount = 0;
  let lineCount = 0;
  let skipped = 0;
  const skipReasons: Record<string, number> = {};

  for (const [transNum, rows] of byTrans) {
    // Use first row's metadata for the JE header
    const head = rows[0]!;
    const docDate = parseDate(head.docDate);
    const valDate = parseDate(head.valueDate) ?? docDate;
    if (!docDate || !valDate) {
      skipped++;
      skipReasons['no_date'] = (skipReasons['no_date'] ?? 0) + 1;
      continue;
    }

    const currency = head.fxCurr || 'ILS';
    const ref1 = head.ref1 || transNum;
    const ref2 = head.ref2 || null;
    const details = head.details || null;
    // Determine transaction type: 'מ' for compound (3+ lines), 'ת' for simple
    const isCompound = rows.length > 2;
    const txType = isCompound ? 'מ' : 'ת';

    const { data: jeRow, error: jeErr } = await admin
      .from('journal_entries')
      .insert({
        company_id: companyId,
        transaction_type: txType,
        reference1: ref1.slice(0, 50),
        reference2: ref2?.slice(0, 50) ?? null,
        document_date: docDate,
        value_date: valDate,
        currency,
        details: details?.slice(0, 200) ?? null,
        status: 'approved',
        movein_format: '180',
        scenario: 'bkmv_import',
      })
      .select('id')
      .single();
    if (jeErr || !jeRow) {
      skipped++;
      skipReasons['je_insert_error'] = (skipReasons['je_insert_error'] ?? 0) + 1;
      console.warn(`  trans ${transNum} skipped: ${jeErr?.message}`);
      continue;
    }
    const jeId = jeRow.id as string;

    // Insert lines — one per B100 row.
    // Constraint: debit >= 0, credit >= 0, debit*credit = 0.
    // BKMV allows negative amounts (reversals) — flip side and use absolute value.
    const lines = rows.map((r, idx) => {
      const absAmount = Math.abs(r.amount);
      const absFx = Math.abs(r.fxAmount);
      // If amount is negative, flip the sign (DR becomes CR and vice versa)
      const effectiveSign = r.amount < 0 ? (r.sign === '1' ? '2' : '1') : r.sign;
      const isDr = effectiveSign === '1';
      return {
        je_id: jeId,
        line_no: idx + 1,
        account: r.account.slice(0, 50),
        debit: isDr ? absAmount : 0,
        credit: isDr ? 0 : absAmount,
        debit_fx: isDr && currency !== 'ILS' ? absFx : 0,
        credit_fx: !isDr && currency !== 'ILS' ? absFx : 0,
        reference1: r.ref1 ? r.ref1.slice(0, 50) : null,
        details: r.details ? r.details.slice(0, 200) : null,
      };
    });

    const { error: linesErr } = await admin.from('journal_entry_lines').insert(lines);
    if (linesErr) {
      skipped++;
      skipReasons['lines_insert_error'] = (skipReasons['lines_insert_error'] ?? 0) + 1;
      console.warn(`  trans ${transNum} lines failed: ${linesErr.message}`);
      // Cleanup empty JE
      await admin.from('journal_entries').delete().eq('id', jeId);
      continue;
    }

    jeCount++;
    lineCount += lines.length;
    if (jeCount % 200 === 0) console.log(`  ${jeCount} JEs inserted…`);
  }

  console.log(`\n✓ Inserted: ${jeCount} JEs, ${lineCount} lines`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Skip breakdown:`, skipReasons);
  console.log(`\n🎉 Done! Visit /dashboard/c/${companyId}/journal-entries`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
