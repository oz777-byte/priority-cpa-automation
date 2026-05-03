-- =====================================================================
-- Phase 11 P1B — Retroactive PCN874 corrections.
--
-- After a period was locked + 874 generated, sometimes errors are found
-- (missing invoice, wrong VAT, etc). The CPA must re-open the period,
-- add/edit JEs, and issue a *corrective* 874 file.
--
-- Adds:
--   1. pcn874_exports.is_correction         — flags correction files
--   2. pcn874_exports.correction_of_id      — points to the original 874
--   3. pcn874_exports.correction_sequence   — 1, 2, 3... per period
--   4. period_reopens                       — audit log of reopen events
-- =====================================================================

alter table pcn874_exports
  add column if not exists is_correction boolean not null default false;
alter table pcn874_exports
  add column if not exists correction_of_id uuid references pcn874_exports(id) on delete set null;
alter table pcn874_exports
  add column if not exists correction_sequence smallint not null default 0;
alter table pcn874_exports
  add column if not exists correction_reason text;

create index if not exists pcn874_exports_correction_chain_idx
  on pcn874_exports(correction_of_id)
  where correction_of_id is not null;

comment on column pcn874_exports.is_correction is
  'true if this 874 export is a correction of a prior submission';
comment on column pcn874_exports.correction_of_id is
  'points back to the original (or prior correction) 874 export this corrects';
comment on column pcn874_exports.correction_sequence is
  '0 = original, 1 = first correction, 2 = second, etc — per (company, year, month)';

-- ─── period_reopens: audit log ─────────────────────────────────────
-- When a locked period is reopened to allow JE adjustments before
-- issuing a corrective 874, we record it here for traceability.
create table if not exists period_reopens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  year smallint not null,
  month smallint not null check (month between 1 and 12),
  reason text not null,
  reopened_by uuid references users(id) on delete set null,
  reopened_at timestamptz not null default now(),
  -- Set when the period is re-locked after the correction is finalized.
  closed_at timestamptz,
  closed_by uuid references users(id) on delete set null,
  -- The corrective 874 export this reopen was for (set after generation).
  resulting_export_id uuid references pcn874_exports(id) on delete set null
);
create index if not exists period_reopens_company_period_idx
  on period_reopens(company_id, year desc, month desc);

alter table period_reopens enable row level security;

drop policy if exists "tenant read period reopens" on period_reopens;
create policy "tenant read period reopens"
on period_reopens for select to authenticated
using (
  company_id in (
    select c.id from companies c
    join user_firms uf on uf.firm_id = c.firm_id
    where uf.user_id = auth.uid()
  )
);

drop policy if exists "tenant write period reopens" on period_reopens;
create policy "tenant write period reopens"
on period_reopens for all to authenticated
using (
  company_id in (
    select c.id from companies c
    join user_firms uf on uf.firm_id = c.firm_id
    where uf.user_id = auth.uid()
  )
)
with check (
  company_id in (
    select c.id from companies c
    join user_firms uf on uf.firm_id = c.firm_id
    where uf.user_id = auth.uid()
  )
);
