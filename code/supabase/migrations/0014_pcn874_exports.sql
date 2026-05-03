-- =====================================================================
-- PCN874 export history + auto-lock period after successful generation.
-- =====================================================================

create table pcn874_exports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  year smallint not null,
  month smallint not null check (month between 1 and 12),
  -- Snapshot of totals at time of export (for audit & re-issue tracking).
  total_inputs_subtotal numeric(14, 2) not null default 0,   -- סך תשומות (לפני מע"מ)
  total_inputs_vat numeric(14, 2) not null default 0,
  total_sales_subtotal numeric(14, 2) not null default 0,    -- סך עסקאות (לפני מע"מ)
  total_sales_vat numeric(14, 2) not null default 0,
  vat_to_pay numeric(14, 2) not null default 0,              -- חיובי = לתשלום, שלילי = להחזר
  je_count int not null default 0,
  -- Generated file content (text), digest for integrity, and file size.
  file_content text not null,
  file_md5 text not null,
  file_byte_size int not null,
  -- Who and when.
  generated_by uuid references users(id) on delete set null,
  generated_at timestamptz not null default now(),
  -- Was the period auto-locked as a result of this export?
  period_locked_by_this boolean not null default false,
  -- Optional notes.
  notes text,

  -- Multiple exports per (company, year, month) allowed (re-issues),
  -- but each gets its own row. Latest = most recent generated_at.
  unique (id)
);

create index pcn874_exports_company_period_idx
  on pcn874_exports(company_id, year desc, month desc, generated_at desc);

alter table pcn874_exports enable row level security;

drop policy if exists "tenant read pcn874" on pcn874_exports;
create policy "tenant read pcn874"
on pcn874_exports for select to authenticated
using (
  company_id in (
    select c.id from companies c
    join user_firms uf on uf.firm_id = c.firm_id
    where uf.user_id = auth.uid()
  )
);

drop policy if exists "tenant write pcn874" on pcn874_exports;
create policy "tenant write pcn874"
on pcn874_exports for all to authenticated
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
