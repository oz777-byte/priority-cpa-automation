/**
 * Applies one or more SQL migration files to the live Supabase Postgres.
 * Collapses "open the dashboard, paste SQL, run" into a single command:
 *
 *   npm run db:apply -- 0021
 *   npm run db:apply -- 0021 0022
 *
 * Connection resolution (from .env.local, loaded via --env-file):
 *   1. SUPABASE_DB_URL      — full Postgres URL, used as-is when present.
 *   2. SUPABASE_URL + SUPABASE_DB_PASSWORD — derives the direct connection
 *      (db.<project-ref>.supabase.co:5432). If your network is IPv4-only and
 *      the direct host is unreachable, set SUPABASE_DB_URL to the session
 *      pooler URL from the Supabase dashboard instead.
 *
 * Each file runs inside a single transaction: it either fully applies or
 * fully rolls back. Migrations in this repo are written idempotently, so
 * re-running an already-applied file is safe.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');

function abort(msg: string): never {
  console.error(`\nERROR: ${msg}\n`);
  process.exit(1);
}

function resolveConnectionString(): string {
  const explicit = process.env.SUPABASE_DB_URL;
  if (explicit) return explicit;
  const url = process.env.SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!url) abort('SUPABASE_URL missing in .env.local');
  if (!password) abort('SUPABASE_DB_PASSWORD missing in .env.local (or set SUPABASE_DB_URL)');
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1];
  if (!ref) abort(`cannot derive project ref from SUPABASE_URL: ${url}`);
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

function resolveMigrationFile(arg: string): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const match = files.find((f) => f === arg || f.startsWith(`${arg}_`) || f.startsWith(arg));
  if (!match) {
    abort(`no migration matches "${arg}". Available: ${files.slice(-5).join(', ')} ...`);
  }
  return match;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    abort('usage: npm run db:apply -- <migration number or filename> [...more]');
  }
  const files = args.map(resolveMigrationFile);

  const client = new pg.Client({
    connectionString: resolveConnectionString(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('Connected to Supabase Postgres.');

  try {
    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      process.stdout.write(`Applying ${file} ... `);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log('OK');
      } catch (e) {
        await client.query('ROLLBACK');
        console.log('FAILED (rolled back)');
        throw e;
      }
    }
    console.log(`\nDone: ${files.length} migration(s) applied.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
