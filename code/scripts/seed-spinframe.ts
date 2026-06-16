/**
 * One-off seed: load Spinframe Technologies Ltd Q1 2026 real data from
 * the Excel master into Supabase as a demo company.
 *
 * Reads:
 *   C:\Users\yaelc\AppData\Local\Temp\spinframe_data.json
 *   (extracted from MASTER_Spinframe_Q1_2026_v12.xlsx by PowerShell)
 *
 * Run with:
 *   node --env-file=.env.local --experimental-strip-types scripts/seed-spinframe.ts
 *
 * Idempotent: if "Spinframe Technologies Ltd" already exists in oz's firm,
 * the script wipes and reloads. Pass --keep to skip wipe.
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

// ─── 1. Load extracted JSON ─────────────────────────────────────────
interface SupplierRaw {
  label: string | null;
  tax_id: string | number | null;
  priority_code: string | number | null;
  name_priority: string | null;
  status: string | null;
  invoice_count: number | null;
  total_amount: number | null;
}
interface InvoiceRaw {
  seq: number | null;
  date: number | string | null; // Excel date serial OR DD/MM/YYYY string
  month: string | null; // YYYY-MM
  supplier_label: string | null;
  tax_id: string | number | null;
  priority_code: string | number | null;
  name_priority: string | null;
  doc_type: string | null;
  invoice_number: string | number | null;
  total: number | null;
  currency: string | null;
  confidence: string | null;
  method: string | null;
  in_ledger: string | null;
  reference: string | null;
  payment_method: string | null;
  payment_details: string | null;
}

const dataPath = 'C:\\Users\\yaelc\\AppData\\Local\\Temp\\spinframe_data.json';
// PowerShell's Out-File -Encoding UTF8 prepends a BOM that JSON.parse rejects.
const rawText = readFileSync(dataPath, 'utf-8').replace(/^﻿/, '');
const raw = JSON.parse(rawText) as {
  company: { name: string; tax_id: string };
  suppliers: SupplierRaw[];
  invoices: InvoiceRaw[];
};

console.log(
  `Loaded ${raw.suppliers.length} suppliers + ${raw.invoices.length} invoices from JSON`,
);

// ─── 2. Helpers ─────────────────────────────────────────────────────

/** Parse Excel date — could be serial number, DD/MM/YYYY string, or null. */
function parseDate(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'number') {
    // Excel serial (days since 1899-12-30)
    const ms = (v - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  }
  return null;
}

/** Fall-back: derive end-of-month date from "YYYY-MM" string. */
function endOfMonth(yyyymm: string | null): string | null {
  if (!yyyymm || !/^\d{4}-\d{2}$/.test(yyyymm)) return null;
  const [y, m] = yyyymm.split('-').map(Number) as [number, number];
  const last = new Date(y, m, 0).getUTCDate();
  return `${yyyymm}-${String(last).padStart(2, '0')}`;
}

function asString(v: unknown): string | null {
  if (v == null) return null;
  return String(v).trim() || null;
}

function asNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Compute VAT-implied subtotal from total based on currency + invoice date. */
function computeSubtotal(total: number, currency: string, date: string): number {
  if (currency !== 'ILS') return total; // foreign — no Israeli VAT
  // 17% before 2025-01-01, 18% after
  const rate = date >= '2025-01-01' ? 0.18 : 0.17;
  return Math.round((total / (1 + rate)) * 100) / 100;
}

// ─── 3. Resolve firm + clear existing demo company ──────────────────

async function main(): Promise<void> {
  // Find oz's firm via his email.
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

  // ── Wipe existing demo company if present ──
  const { data: existing } = await admin
    .from('companies')
    .select('id')
    .eq('firm_id', firmId)
    .eq('tax_id', raw.company.tax_id)
    .maybeSingle();
  if (existing) {
    console.log(`✓ Existing Spinframe found, wiping…`);
    await admin.from('companies').delete().eq('id', existing.id);
    // CASCADE deletes everything else.
  }

  // ── Create company ──
  const { data: companyRow, error: cErr } = await admin
    .from('companies')
    .insert({
      firm_id: firmId,
      name: raw.company.name,
      tax_id: raw.company.tax_id,
      vat_basis: 'accrual',
      vat_filing_frequency: 'bimonthly',
      settings: {
        expense_account: '502-0',
        vat_input_account: '205-2',
        details_prefix: 'קניות',
        transaction_type: 'מ',
        currency: 'ILS',
      },
    })
    .select('id')
    .single();
  if (cErr || !companyRow) abort(`Company insert failed: ${cErr?.message}`);
  const companyId = companyRow.id as string;
  console.log(`✓ Company created: ${companyId}`);

  // ── Suppliers ──
  // Build a map from priority_code to supplier_id for invoice attribution.
  const supplierMap = new Map<string, string>(); // priority_code → supplier.id
  const supplierByTaxId = new Map<string, string>();
  let supplierCount = 0;
  let dedupSupplierKeys = new Set<string>(); // tax_id + priority_code uniqueness

  for (const s of raw.suppliers) {
    const taxId = asString(s.tax_id);
    const priorityCode = asString(s.priority_code);
    const name = asString(s.name_priority) ?? asString(s.label) ?? 'ספק';
    if (!priorityCode) continue; // skip suppliers without a Priority code

    // Dedup by priority_code (Excel has duplicates).
    const key = `${priorityCode}|${taxId ?? ''}`;
    if (dedupSupplierKeys.has(key)) continue;
    dedupSupplierKeys.add(key);

    // Already in DB? (uniqueness constraint on company_id+internal_code)
    if (supplierMap.has(priorityCode)) continue;

    const { data: row, error } = await admin
      .from('suppliers')
      .insert({
        company_id: companyId,
        internal_code: priorityCode,
        name: name.slice(0, 100),
        tax_id: taxId,
        dealer_status: 'registered',
      })
      .select('id')
      .single();
    if (error) {
      console.warn(`  supplier "${name}" (${priorityCode}) skipped: ${error.message}`);
      continue;
    }
    supplierMap.set(priorityCode, row.id as string);
    if (taxId) supplierByTaxId.set(taxId, row.id as string);
    supplierCount++;
  }
  console.log(`✓ ${supplierCount} suppliers created`);

  // ── Invoices ──
  let inserted = 0;
  let skipped = 0;
  const skipReasons: Record<string, number> = {};

  for (const inv of raw.invoices) {
    const total = asNumber(inv.total);
    const supplierLabel = asString(inv.supplier_label);
    const supplierName = asString(inv.name_priority) ?? supplierLabel;
    const taxId = asString(inv.tax_id);
    const priorityCode = asString(inv.priority_code);
    const currency = (asString(inv.currency) ?? 'ILS').toUpperCase();
    const docType = asString(inv.doc_type);
    const invoiceNumber = asString(inv.invoice_number);
    const reference = asString(inv.reference);
    const inLedger = asString(inv.in_ledger);

    // Resolve date — prefer explicit date, fallback to end-of-month
    let date = parseDate(inv.date);
    if (!date) date = endOfMonth(asString(inv.month));
    if (!date) {
      skipReasons['no_date'] = (skipReasons['no_date'] ?? 0) + 1;
      skipped++;
      continue;
    }

    // Required: total + supplier
    if (!total || !supplierName) {
      skipReasons['missing_total_or_supplier'] = (skipReasons['missing_total_or_supplier'] ?? 0) + 1;
      skipped++;
      continue;
    }

    // Compute subtotal/VAT
    const subtotal = computeSubtotal(total, currency, date);

    // Resolve supplier internal code — use priority_code if available, else fallback
    const internalCode = priorityCode ?? taxId ?? `STUB-${inv.seq}`;

    // Use Excel reference (e.g. "26000104/מ") as invoice number if missing
    const finalInvoiceNumber = invoiceNumber ?? reference ?? `EXCEL-${inv.seq}`;

    // Build canonical
    const canonical = {
      invoice: {
        number: finalInvoiceNumber,
        date,
        currency,
        allocation_number: null,
        document_type: docType,
      },
      supplier: {
        name: supplierName.slice(0, 100),
        tax_id: taxId ?? '',
        internal_code_priority: internalCode,
      },
      totals: {
        subtotal,
        total,
        vat_rate: currency === 'ILS' ? (date >= '2025-01-01' ? 18 : 17) : 0,
        vat_amount: Math.round((total - subtotal) * 100) / 100,
      },
      metadata: {
        source: 'spinframe_seed',
        ingested_at: new Date().toISOString(),
        notes_from_excel: {
          confidence: inv.confidence,
          method: inv.method,
          payment_method: inv.payment_method,
          payment_details: inv.payment_details,
          original_label: supplierLabel,
        },
      },
    };

    const fingerprint = [
      taxId ?? '',
      finalInvoiceNumber,
      date,
      total.toFixed(2),
      String(inv.seq), // ensure uniqueness on dups in Excel
    ].join('|');

    // Mark already-in-ledger as 'classified' (skips JE auto-generation)
    const status = inLedger === '✅ הוזן' ? 'classified' : 'queued';

    const { error } = await admin.from('invoices_inbox').insert({
      company_id: companyId,
      source: 'upload',
      canonical,
      fingerprint,
      status,
    });
    if (error) {
      console.warn(`  invoice ${inv.seq} skipped: ${error.message}`);
      skipReasons['db_error'] = (skipReasons['db_error'] ?? 0) + 1;
      skipped++;
      continue;
    }
    inserted++;
  }

  console.log(`\n✓ Invoices: ${inserted} inserted, ${skipped} skipped`);
  console.log('  Skip breakdown:', skipReasons);

  console.log(`\n🎉 Done! Visit /dashboard/c/${companyId}/invoices to review.`);
  console.log(`Then visit /dashboard/c/${companyId}/journal-entries — JEs will auto-generate.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
