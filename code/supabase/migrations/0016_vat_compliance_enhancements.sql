-- =====================================================================
-- Phase 11 P0 — VAT compliance enhancements for Israeli limited companies.
--
-- 1. companies — VAT basis + filing frequency
-- 2. suppliers — dealer status (registered / exempt / foreign)
-- 3. journal_entries — vat_reporting_date (separates "when recorded" from
--    invoice/value date, fixes the late-invoice bug)
-- 4. vat_rates_history — historical VAT rates by effective date
-- =====================================================================

-- ─── 1. companies — VAT meta ────────────────────────────────────────
create type vat_basis as enum ('accrual', 'cash');
create type vat_filing_frequency as enum ('monthly', 'bimonthly', 'annual');

alter table companies
  add column if not exists vat_basis vat_basis not null default 'accrual';
alter table companies
  add column if not exists vat_filing_frequency vat_filing_frequency not null default 'bimonthly';

comment on column companies.vat_basis is
  'accrual = report VAT by invoice/value date (default for limited companies). ' ||
  'cash = report VAT by payment date (small businesses < 1.95M ILS turnover).';

-- ─── 2. suppliers — dealer status ───────────────────────────────────
create type supplier_dealer_status as enum (
  'registered',  -- עוסק רשום: standard registered dealer with VAT
  'exempt',      -- עוסק פטור: small business, no VAT on invoices, no allocation
  'foreign'      -- ספק זר: foreign supplier, self-invoice scenario
);

alter table suppliers
  add column if not exists dealer_status supplier_dealer_status not null default 'registered';

comment on column suppliers.dealer_status is
  'registered = full VAT, exempt = no VAT (חשבונית עסקה), foreign = self-invoice required.';

-- ─── 3. journal_entries — VAT reporting date ────────────────────────
-- This separates "when the invoice should appear in PCN874" from the
-- invoice date and value date. For late-arriving invoices, this is the
-- recording date, not the invoice issue date.
alter table journal_entries
  add column if not exists vat_reporting_date date;

-- Backfill: for existing rows, default to value_date.
update journal_entries
   set vat_reporting_date = value_date
 where vat_reporting_date is null;

-- Future inserts must specify it (handled by application code).
create index if not exists journal_entries_vat_reporting_idx
  on journal_entries(company_id, vat_reporting_date);

comment on column journal_entries.vat_reporting_date is
  'Date this JE should be reported in PCN874. Defaults to value_date, but ' ||
  'for late-arriving invoices = the recording date (when entered in books). ' ||
  'Israeli VAT law (סעיף 38א) limits VAT recovery to 6 months from invoice date.';

-- ─── 4. vat_rates_history — historical rates by effective date ──────
create table if not exists vat_rates_history (
  effective_from date primary key,
  rate numeric(5,4) not null check (rate > 0 and rate < 1),
  notes text
);

insert into vat_rates_history (effective_from, rate, notes) values
  ('2009-07-01', 0.155, '15.5% — temporary rate during financial crisis'),
  ('2010-01-01', 0.16,  '16% — restored'),
  ('2013-06-02', 0.18,  '18% — increase'),
  ('2015-10-01', 0.17,  '17% — decrease'),
  ('2025-01-01', 0.18,  '18% — current rate (Jan 2025+)')
on conflict (effective_from) do nothing;

comment on table vat_rates_history is
  'Historical Israeli VAT rates by effective date. Used to compute correct ' ||
  'VAT for invoices dated before current rate (e.g. a 2024 invoice received ' ||
  'in 2025 must be recorded at 17%, not 18%).';

-- Helper function for application code.
create or replace function get_vat_rate_for_date(supply_date date)
returns numeric(5,4)
language sql
stable
as $$
  select rate from vat_rates_history
   where effective_from <= supply_date
   order by effective_from desc
   limit 1;
$$;
