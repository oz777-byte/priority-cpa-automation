-- =====================================================================
-- Unified-format import jobs (Ardeni / OF1.31 BKMVDATA.TXT → MOVEIN).
--
-- Each row records one self-service conversion run a CPA performs against a
-- specific company: the uploaded source, the conversion report snapshot, and
-- the generated MOVEIN output. Multi-tenant from day one — company_id + RLS.
--
-- Storage layout (private bucket ardeni-imports):
--   ardeni-imports/<company_id>/<job_id>/BKMVDATA.TXT   (input)
--   ardeni-imports/<company_id>/<job_id>/movein.zip     (output)
-- All bucket writes go through the service_role admin client.
-- =====================================================================

create table if not exists import_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  source text not null default 'unified_format',
  status text not null default 'pending'
    check (status in ('pending', 'parsed', 'exported', 'failed')),
  original_filename text,

  -- Conversion summary (mirrors ConversionReport from the ardeni-parser skill).
  je_count integer,
  source_line_count integer,
  required_account_count integer,
  net_imbalance numeric(14, 2),
  balance_ok boolean,
  currencies jsonb,   -- { "ILS": 1200, "GBP": 45 }
  periods jsonb,      -- ["2026-01", "2026-02", ...]
  warnings jsonb,     -- string[]
  report jsonb,       -- full ConversionReport snapshot

  input_storage_path text,
  output_storage_path text,
  movein_batch_id uuid references movein_batches(id) on delete set null,
  error_code text,    -- Hebrew error-catalog code (no stack traces)

  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists import_jobs_company_idx
  on import_jobs(company_id, created_at desc);
create index if not exists import_jobs_batch_idx
  on import_jobs(movein_batch_id);

alter table import_jobs enable row level security;

-- Read: any member of the owning firm (includes auditor).
drop policy if exists "tenant read import jobs" on import_jobs;
create policy "tenant read import jobs"
on import_jobs for select to authenticated
using (
  company_id in (
    select c.id from companies c
    join user_firms uf on uf.firm_id = c.firm_id
    where uf.user_id = auth.uid()
  )
);

-- Write: owner / admin / member only — auditor is read-only.
drop policy if exists "tenant write import jobs" on import_jobs;
create policy "tenant write import jobs"
on import_jobs for all to authenticated
using (
  company_id in (
    select c.id from companies c
    join user_firms uf on uf.firm_id = c.firm_id
    where uf.user_id = auth.uid() and uf.role <> 'auditor'::firm_role
  )
)
with check (
  company_id in (
    select c.id from companies c
    join user_firms uf on uf.firm_id = c.firm_id
    where uf.user_id = auth.uid() and uf.role <> 'auditor'::firm_role
  )
);

-- ─── Storage bucket ───────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ardeni-imports',
  'ardeni-imports',
  false,
  50 * 1024 * 1024,
  null  -- BKMVDATA.TXT (text/plain) + generated zip; mime varies, size-capped
)
on conflict (id) do nothing;

-- Authenticated users may read import artifacts of companies in their firm(s).
drop policy if exists "tenant users read ardeni imports" on storage.objects;
create policy "tenant users read ardeni imports"
on storage.objects for select to authenticated
using (
  bucket_id = 'ardeni-imports'
  and (storage.foldername(name))[1] in (
    select c.id::text
      from companies c
      join user_firms uf on uf.firm_id = c.firm_id
     where uf.user_id = auth.uid()
  )
);
