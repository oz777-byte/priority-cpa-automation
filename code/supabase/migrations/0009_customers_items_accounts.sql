-- =====================================================================
-- Phase 2 of the accounting brain — three masters:
--   1. customers — mirror of suppliers, for the sales (AR) side
--   2. items     — products / services catalog for sales invoices
--   3. accounts  — full chart of accounts per company (hierarchy + types)
-- All scoped per-company, all RLS-gated to firm membership.
-- =====================================================================

-- ─── 1. customers ────────────────────────────────────────────────────
create table customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  internal_code text not null,
  name text not null,
  tax_id text,
  country text default 'IL',
  email text,
  phone text,
  address text,
  default_revenue_account text,
  default_vat_category text default 'standard',
  -- Some B2G customers (government) deduct withholding from your invoices.
  withholding_percent numeric(5,2),
  payment_terms text,
  notes text,
  normalized_name text generated always as
    (lower(regexp_replace(name, '[\s\."'']', '', 'g'))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, internal_code)
);
create trigger customers_set_updated_at before update on customers
  for each row execute function set_updated_at();
create index customers_company_id_idx on customers(company_id);
create index customers_tax_id_idx on customers(company_id, tax_id);
create index customers_normalized_name_trgm
  on customers using gin (normalized_name gin_trgm_ops);

alter table customers enable row level security;

drop policy if exists "tenant read customers" on customers;
create policy "tenant read customers"
on customers for select to authenticated
using (
  company_id in (
    select c.id from companies c
    join user_firms uf on uf.firm_id = c.firm_id
    where uf.user_id = auth.uid()
  )
);

drop policy if exists "tenant write customers" on customers;
create policy "tenant write customers"
on customers for all to authenticated
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

-- ─── 2. items ─────────────────────────────────────────────────────────
create type item_vat_category as enum ('standard', 'zero', 'exempt');

create table items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  internal_code text not null,
  name text not null,
  description text,
  unit text default 'יח',
  default_unit_price numeric(14,2),
  default_revenue_account text,
  vat_category item_vat_category not null default 'standard',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, internal_code)
);
create trigger items_set_updated_at before update on items
  for each row execute function set_updated_at();
create index items_company_id_idx on items(company_id);
create index items_active_idx on items(company_id, is_active);

alter table items enable row level security;

drop policy if exists "tenant read items" on items;
create policy "tenant read items"
on items for select to authenticated
using (
  company_id in (
    select c.id from companies c
    join user_firms uf on uf.firm_id = c.firm_id
    where uf.user_id = auth.uid()
  )
);

drop policy if exists "tenant write items" on items;
create policy "tenant write items"
on items for all to authenticated
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

-- ─── 3. accounts (chart of accounts) ─────────────────────────────────
create type account_type as enum (
  'asset',          -- 100-199 — נכסים
  'liability',      -- 200-299 — התחייבויות (כולל ספקים)
  'income',         -- 700-799 — הכנסות
  'expense',        -- 500-599 — הוצאות
  'equity'          -- 800-999 — הון (כולל יתרת רווחים)
);

create table accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  code text not null,
  name text not null,
  type account_type not null,
  parent_account_id uuid references accounts(id) on delete set null,
  is_active boolean not null default true,
  is_system boolean not null default false, -- core accounts that can't be deleted
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);
create trigger accounts_set_updated_at before update on accounts
  for each row execute function set_updated_at();
create index accounts_company_id_idx on accounts(company_id);
create index accounts_type_idx on accounts(company_id, type);
create index accounts_parent_idx on accounts(parent_account_id);

alter table accounts enable row level security;

drop policy if exists "tenant read accounts" on accounts;
create policy "tenant read accounts"
on accounts for select to authenticated
using (
  company_id in (
    select c.id from companies c
    join user_firms uf on uf.firm_id = c.firm_id
    where uf.user_id = auth.uid()
  )
);

drop policy if exists "tenant write accounts" on accounts;
create policy "tenant write accounts"
on accounts for all to authenticated
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

-- ─── Seed: Israeli standard chart of accounts per existing company ───
-- Each company gets a baseline COA on first open. Existing companies are
-- backfilled here; new companies will be backfilled by a trigger / app
-- code on creation.
do $$
declare
  c record;
begin
  for c in (select id from companies) loop
    insert into accounts (company_id, code, name, type, is_system)
    values
      (c.id, '100-0',  'קופה',                          'asset',     true),
      (c.id, '102-0',  'הוצאות מראש',                    'asset',     true),
      (c.id, '120-0',  'לקוחות',                         'asset',     true),
      (c.id, '121-0',  'בנק — חשבון עו"ש',                'asset',     true),
      (c.id, '125-0',  'כרטיס אשראי לסליקה',              'asset',     true),
      (c.id, '130-0',  'מלאי',                            'asset',     true),
      (c.id, '140-0',  'נכסי קבע',                        'asset',     true),
      (c.id, '149-0',  'פחת מצטבר',                       'asset',     true),
      (c.id, '175-0',  'רשות המסים — ניכוי במקור',         'liability', true),
      (c.id, '200-0',  'ספקים — כללי',                    'liability', true),
      (c.id, '205-2',  'מע"מ תשומות',                     'asset',     true),
      (c.id, '220-0',  'מע"מ עסקאות',                     'liability', true),
      (c.id, '230-0',  'הפרשות לעובדים',                  'liability', true),
      (c.id, '502-0',  'קניות',                           'expense',   true),
      (c.id, '502-1',  'הוצאה לא מנוכה',                  'expense',   true),
      (c.id, '503-0',  'חומרי גלם',                       'expense',   true),
      (c.id, '504-0',  'שירותים מקצועיים',                'expense',   true),
      (c.id, '510-0',  'הוצאות שירותי ענן וחומרה',         'expense',   true),
      (c.id, '522-0',  'עמלות בנק',                       'expense',   true),
      (c.id, '522-1',  'עמלות סולק אשראי',                'expense',   true),
      (c.id, '600-0',  'משכורות ושכר',                    'expense',   true),
      (c.id, '601-0',  'הוצאות סוציאליות',                'expense',   true),
      (c.id, '610-0',  'פחת שנתי',                        'expense',   true),
      (c.id, '624-0',  'הוצאות ריבית ומימון',             'expense',   true),
      (c.id, '700-0',  'הכנסות ממכירות',                  'income',    true),
      (c.id, '710-0',  'הכנסות משירותים',                 'income',    true),
      (c.id, '743-0',  'הכנסות ריבית',                    'income',    true),
      (c.id, '906-0',  'סיכום רווח והפסד',                'equity',    true),
      (c.id, '910-0',  'יתרת רווחים',                     'equity',    true)
    on conflict (company_id, code) do nothing;
  end loop;
end$$;

-- Trigger: every new company gets the baseline chart of accounts.
create or replace function public.companies_seed_accounts()
returns trigger
language plpgsql
as $$
begin
  insert into accounts (company_id, code, name, type, is_system)
  values
    (new.id, '100-0',  'קופה',                          'asset',     true),
    (new.id, '102-0',  'הוצאות מראש',                    'asset',     true),
    (new.id, '120-0',  'לקוחות',                         'asset',     true),
    (new.id, '121-0',  'בנק — חשבון עו"ש',                'asset',     true),
    (new.id, '125-0',  'כרטיס אשראי לסליקה',              'asset',     true),
    (new.id, '130-0',  'מלאי',                            'asset',     true),
    (new.id, '140-0',  'נכסי קבע',                        'asset',     true),
    (new.id, '149-0',  'פחת מצטבר',                       'asset',     true),
    (new.id, '175-0',  'רשות המסים — ניכוי במקור',         'liability', true),
    (new.id, '200-0',  'ספקים — כללי',                    'liability', true),
    (new.id, '205-2',  'מע"מ תשומות',                     'asset',     true),
    (new.id, '220-0',  'מע"מ עסקאות',                     'liability', true),
    (new.id, '230-0',  'הפרשות לעובדים',                  'liability', true),
    (new.id, '502-0',  'קניות',                           'expense',   true),
    (new.id, '502-1',  'הוצאה לא מנוכה',                  'expense',   true),
    (new.id, '503-0',  'חומרי גלם',                       'expense',   true),
    (new.id, '504-0',  'שירותים מקצועיים',                'expense',   true),
    (new.id, '510-0',  'הוצאות שירותי ענן וחומרה',         'expense',   true),
    (new.id, '522-0',  'עמלות בנק',                       'expense',   true),
    (new.id, '522-1',  'עמלות סולק אשראי',                'expense',   true),
    (new.id, '600-0',  'משכורות ושכר',                    'expense',   true),
    (new.id, '601-0',  'הוצאות סוציאליות',                'expense',   true),
    (new.id, '610-0',  'פחת שנתי',                        'expense',   true),
    (new.id, '624-0',  'הוצאות ריבית ומימון',             'expense',   true),
    (new.id, '700-0',  'הכנסות ממכירות',                  'income',    true),
    (new.id, '710-0',  'הכנסות משירותים',                 'income',    true),
    (new.id, '743-0',  'הכנסות ריבית',                    'income',    true),
    (new.id, '906-0',  'סיכום רווח והפסד',                'equity',    true),
    (new.id, '910-0',  'יתרת רווחים',                     'equity',    true)
  on conflict (company_id, code) do nothing;
  return new;
end;
$$;

drop trigger if exists companies_seed_accounts_trigger on companies;
create trigger companies_seed_accounts_trigger
  after insert on companies
  for each row execute function public.companies_seed_accounts();
