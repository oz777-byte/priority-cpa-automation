-- =====================================================================
-- Accounting periods + sequential JE numbering (Israeli law: consecutive
-- JE numbers per company, no gaps, no edits in locked periods).
-- =====================================================================

-- ─── 1. accounting_periods ────────────────────────────────────────────
create type period_status as enum ('open', 'locked', 'closed');

create table accounting_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  year smallint not null,
  month smallint not null check (month between 1 and 12),
  status period_status not null default 'open',
  locked_at timestamptz,
  locked_by uuid references users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  unique (company_id, year, month)
);
create index accounting_periods_company_year_idx
  on accounting_periods(company_id, year desc, month desc);

alter table accounting_periods enable row level security;

drop policy if exists "tenant read periods" on accounting_periods;
create policy "tenant read periods"
on accounting_periods for select to authenticated
using (
  company_id in (
    select c.id from companies c
    join user_firms uf on uf.firm_id = c.firm_id
    where uf.user_id = auth.uid()
  )
);

drop policy if exists "tenant write periods" on accounting_periods;
create policy "tenant write periods"
on accounting_periods for all to authenticated
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

-- ─── 2. journal_entries.je_number (sequential per company) ───────────
alter table journal_entries add column if not exists je_number int;

-- Backfill existing rows in creation order.
do $$
declare
  c record;
  r record;
  n int;
begin
  for c in (select distinct company_id from journal_entries where je_number is null) loop
    n := 0;
    for r in (
      select id from journal_entries
       where company_id = c.company_id
       order by created_at asc, id asc
    ) loop
      n := n + 1;
      update journal_entries set je_number = n where id = r.id;
    end loop;
  end loop;
end$$;

create unique index if not exists journal_entries_company_number_unique
  on journal_entries(company_id, je_number);

-- Auto-assign on insert if not provided.
create or replace function public.assign_je_number()
returns trigger language plpgsql as $$
begin
  if new.je_number is null then
    select coalesce(max(je_number), 0) + 1 into new.je_number
    from journal_entries
    where company_id = new.company_id;
  end if;
  return new;
end;
$$;

drop trigger if exists je_number_trigger on journal_entries;
create trigger je_number_trigger
  before insert on journal_entries
  for each row execute function public.assign_je_number();

-- ─── 3. Block JE writes in locked/closed periods ─────────────────────
create or replace function public.check_period_open_for_je()
returns trigger language plpgsql as $$
declare
  per_status period_status;
  the_year smallint;
  the_month smallint;
begin
  -- Document_date is the canonical period anchor for JEs.
  the_year := extract(year from new.document_date)::smallint;
  the_month := extract(month from new.document_date)::smallint;

  select status into per_status
    from accounting_periods
   where company_id = new.company_id
     and year = the_year
     and month = the_month;

  -- If no period row exists, treat as open (auto-created on first JE below).
  if per_status is null then
    insert into accounting_periods (company_id, year, month, status)
    values (new.company_id, the_year, the_month, 'open')
    on conflict (company_id, year, month) do nothing;
    return new;
  end if;

  if per_status in ('locked', 'closed') then
    raise exception 'cannot insert JE in % period (%-%): period is %',
      to_char(make_date(the_year::int, the_month::int, 1), 'YYYY-MM'),
      the_year, the_month, per_status;
  end if;
  return new;
end;
$$;

drop trigger if exists je_period_check on journal_entries;
create trigger je_period_check
  before insert on journal_entries
  for each row execute function public.check_period_open_for_je();

-- Backfill: ensure every (company, year, month) referenced by an existing JE
-- has a period row. Uses 'open' status for all back-filled rows.
do $$
declare
  r record;
begin
  for r in (
    select distinct
      company_id,
      extract(year from document_date)::smallint as y,
      extract(month from document_date)::smallint as m
    from journal_entries
    where document_date is not null
  ) loop
    insert into accounting_periods (company_id, year, month, status)
    values (r.company_id, r.y, r.m, 'open')
    on conflict (company_id, year, month) do nothing;
  end loop;
end$$;
