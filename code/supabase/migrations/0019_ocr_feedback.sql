-- =====================================================================
-- Phase 13 — OCR feedback loop
--   1. ocr_corrections — every time a user fixes an OCR-extracted field,
--      we record the original + corrected values for future model
--      training and admin dashboards.
--   2. companies.auto_approve_ocr_threshold — when set (0..1), invoices
--      ingested via OCR with confidence >= threshold and no validation
--      errors are auto-marked reviewed_at on creation.
-- =====================================================================

create table if not exists ocr_corrections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references invoices_inbox(id) on delete cascade,
  -- Dotted path inside canonical, e.g. "supplier.name", "totals.total".
  field_path text not null,
  original_value text,
  corrected_value text not null,
  corrected_by uuid references users(id) on delete set null,
  corrected_at timestamptz not null default now()
);

create index if not exists ocr_corrections_company_idx
  on ocr_corrections(company_id, corrected_at desc);
create index if not exists ocr_corrections_invoice_idx
  on ocr_corrections(invoice_id);
create index if not exists ocr_corrections_field_idx
  on ocr_corrections(company_id, field_path);

alter table ocr_corrections enable row level security;

drop policy if exists "tenant read ocr corrections" on ocr_corrections;
create policy "tenant read ocr corrections"
on ocr_corrections for select to authenticated
using (
  company_id in (
    select c.id from companies c
    join user_firms uf on uf.firm_id = c.firm_id
    where uf.user_id = auth.uid()
  )
);

drop policy if exists "tenant write ocr corrections" on ocr_corrections;
create policy "tenant write ocr corrections"
on ocr_corrections for all to authenticated
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

-- Admin policy — let admins read all corrections for the cross-tenant
-- "common OCR mistakes" dashboard.
drop policy if exists "admins read all ocr corrections" on ocr_corrections;
create policy "admins read all ocr corrections"
on ocr_corrections for select to authenticated
using (
  (select role from users where id = auth.uid()) = 'admin'::app_role
);

-- ─── 2. Auto-approve threshold on companies ──────────────────────────
alter table companies
  add column if not exists auto_approve_ocr_threshold numeric(3, 2)
    check (auto_approve_ocr_threshold is null or (auto_approve_ocr_threshold >= 0 and auto_approve_ocr_threshold <= 1));

comment on column companies.auto_approve_ocr_threshold is
  'When set (0..1), invoices ingested with OCR confidence >= this value and no validation errors are auto-marked reviewed_at. Null disables.';
