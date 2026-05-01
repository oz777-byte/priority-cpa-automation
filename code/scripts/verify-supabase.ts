// One-off verification: connect to Supabase and confirm the migration landed.
// Run with: npm run verify:supabase

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

function abort(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (!url) abort('SUPABASE_URL missing in .env.local');
if (!secretKey) abort('SUPABASE_SECRET_KEY missing in .env.local');
if (!publishableKey) abort('SUPABASE_PUBLISHABLE_KEY missing in .env.local');

const expectedTables = [
  'firms',
  'users',
  'user_firms',
  'companies',
  'suppliers',
  'supplier_aliases',
  'account_mapping_rules',
  'invoices_inbox',
  'journal_entries',
  'journal_entry_lines',
  'movein_batches',
  'audit_log',
  'kb_articles',
] as const;

console.log(`\nVerifying Supabase project at: ${url}\n`);

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let pass = 0;
let fail = 0;

for (const table of expectedTables) {
  const { error } = await admin.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    console.error(`  ✗ ${table.padEnd(28)} ${error.message}`);
    fail++;
  } else {
    console.log(`  ✓ ${table}`);
    pass++;
  }
}

console.log(`\n${pass}/${expectedTables.length} tables reachable, ${fail} errors`);

// Sanity check: secret key bypasses RLS (admin can see audit_log even with no user)
const { error: rlsError } = await admin.from('audit_log').select('id').limit(1);
if (rlsError) {
  console.error(`\n✗ admin client cannot reach audit_log: ${rlsError.message}`);
  process.exit(1);
}

// Confirm publishable client (anon role) is RLS-restricted on companies
const anon = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: anonData, error: anonError } = await anon.from('companies').select('*').limit(1);
if (anonError) {
  console.log(`  (anon client error on companies: ${anonError.message})`);
}
if (Array.isArray(anonData) && anonData.length === 0) {
  console.log('  ✓ anon client correctly blocked from companies (RLS active)');
}

if (fail > 0) {
  console.error('\nSchema verification FAILED.');
  process.exit(1);
}

console.log('\n✓ Schema verification PASSED — Supabase is ready.\n');
