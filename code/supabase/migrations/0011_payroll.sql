-- =====================================================================
-- Payroll — per-employee monthly entries.
-- Each row generates 3 JEs (PAYROLL_MONTHLY + PAYROLL_EMPLOYER + PAYROLL_PAYMENT).
-- Employee master is implicit for V1 — name + ID stored on the entry.
-- =====================================================================

create type payroll_status as enum ('draft', 'queued', 'posted', 'paid', 'error');

create table payroll_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id text not null,           -- ת.ז or internal ID (free-form for V1)
  employee_name text not null,
  month_date date not null,            -- last day of payroll month
  gross numeric(14,2) not null,
  ni_employee numeric(14,2) not null default 0,
  income_tax numeric(14,2) not null default 0,
  pension_employee numeric(14,2) not null default 0,
  study_fund_employee numeric(14,2) not null default 0,
  ni_employer numeric(14,2) not null default 0,
  pension_employer numeric(14,2) not null default 0,
  study_fund_employer numeric(14,2) not null default 0,
  severance_employer numeric(14,2) not null default 0,
  -- Computed for display: gross - sum(employee deductions)
  net numeric(14,2) generated always as (
    gross - ni_employee - income_tax - pension_employee - study_fund_employee
  ) stored,
  status payroll_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One entry per employee per month per company
  unique (company_id, employee_id, month_date)
);
create trigger payroll_entries_set_updated_at before update on payroll_entries
  for each row execute function set_updated_at();
create index payroll_entries_company_month_idx
  on payroll_entries(company_id, month_date desc);
create index payroll_entries_employee_idx on payroll_entries(employee_id);

-- Add payroll_entry_id back-reference on journal_entries (3 JEs per entry).
alter table journal_entries
  add column if not exists payroll_entry_id uuid
  references payroll_entries(id) on delete set null;
create index if not exists journal_entries_payroll_idx
  on journal_entries(payroll_entry_id);

-- RLS — same firm-membership pattern as bank_transactions.
alter table payroll_entries enable row level security;

drop policy if exists "tenant read payroll" on payroll_entries;
create policy "tenant read payroll"
on payroll_entries for select to authenticated
using (
  company_id in (
    select c.id from companies c
    join user_firms uf on uf.firm_id = c.firm_id
    where uf.user_id = auth.uid()
  )
);

drop policy if exists "tenant write payroll" on payroll_entries;
create policy "tenant write payroll"
on payroll_entries for all to authenticated
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
