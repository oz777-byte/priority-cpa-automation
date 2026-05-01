-- =====================================================================
-- Priority CPA Automation — initial multi-tenant schema (Phase 1, M2)
--
-- This migration sets up:
--   * firms / users / companies hierarchy (firm = CPA practice)
--   * invoices_inbox, suppliers + aliases, account_mapping_rules
--   * journal_entries (header) + journal_entry_lines
--   * movein_batches
--   * audit_log (append-only, enforced by trigger)
--   * kb_articles (knowledge base)
--   * RLS policies tied to auth.uid() via user_firms
--
-- Conventions:
--   * primary keys are uuid (gen_random_uuid())
--   * timestamps are timestamptz, default now()
--   * money is numeric(14,2)
--   * every tenant-scoped table has firm_id and (where relevant) company_id
--   * deletes are forbidden on audit_log; everywhere else use status flags
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------- helpers --------------------------------------------------

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------- firms ----------------------------------------------------

create table firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger firms_set_updated_at before update on firms
  for each row execute function set_updated_at();

-- ---------- app-level user profile (extends auth.users) --------------

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  default_firm_id uuid references firms(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger users_set_updated_at before update on users
  for each row execute function set_updated_at();

-- ---------- user_firms (many-to-many) --------------------------------

create type firm_role as enum ('owner', 'admin', 'member', 'auditor');

create table user_firms (
  user_id uuid not null references users(id) on delete cascade,
  firm_id uuid not null references firms(id) on delete cascade,
  role firm_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (user_id, firm_id)
);
create index user_firms_firm_id_idx on user_firms(firm_id);

-- helper: firm IDs accessible to the current authenticated user
create or replace function current_user_firm_ids() returns setof uuid as $$
  select firm_id from user_firms where user_id = auth.uid();
$$ language sql security definer stable;

-- ---------- companies (firm clients) ---------------------------------

create type company_status as enum ('active', 'paused', 'archived');

create table companies (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete restrict,
  name text not null,
  tax_id text not null,
  priority_version text,
  status company_status not null default 'active',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (firm_id, tax_id)
);
create trigger companies_set_updated_at before update on companies
  for each row execute function set_updated_at();
create index companies_firm_id_idx on companies(firm_id);

-- ---------- suppliers ------------------------------------------------

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  internal_code text not null,
  name text not null,
  tax_id text,
  country text default 'IL',
  default_expense_account text,
  default_cost_center text,
  payment_terms text,
  normalized_name text generated always as (lower(regexp_replace(name, '[\s\."'']', '', 'g'))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, internal_code)
);
create trigger suppliers_set_updated_at before update on suppliers
  for each row execute function set_updated_at();
create index suppliers_company_id_idx on suppliers(company_id);
create index suppliers_tax_id_idx on suppliers(company_id, tax_id);
create index suppliers_normalized_name_trgm on suppliers using gin (normalized_name gin_trgm_ops);

create table supplier_aliases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  alias text not null,
  confidence numeric(3,2) not null default 1.0,
  learned_at timestamptz not null default now()
);
create index supplier_aliases_supplier_idx on supplier_aliases(supplier_id);

-- ---------- account mapping rules ------------------------------------

create table account_mapping_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  priority int not null default 100,
  match_supplier_id uuid references suppliers(id) on delete set null,
  match_category text,
  match_amount_min numeric(14,2),
  match_amount_max numeric(14,2),
  expense_account text not null,
  vat_account text not null,
  cost_center text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index account_mapping_rules_company_priority_idx
  on account_mapping_rules(company_id, priority);

-- ---------- invoices_inbox -------------------------------------------

create type invoice_inbox_status as enum (
  'received', 'processing', 'classified', 'queued',
  'approved', 'exported', 'error'
);
create type invoice_source as enum ('drive', 'email', 'upload', 'api', 'finbot');

create table invoices_inbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  source invoice_source not null,
  source_id text,
  pdf_path text,
  ocr_status text,
  ocr_confidence numeric(3,2),
  ocr_data jsonb,
  canonical jsonb,
  fingerprint text,
  status invoice_inbox_status not null default 'received',
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger invoices_inbox_set_updated_at before update on invoices_inbox
  for each row execute function set_updated_at();
create index invoices_inbox_company_status_idx on invoices_inbox(company_id, status);
create index invoices_inbox_fingerprint_idx on invoices_inbox(company_id, fingerprint);
create unique index invoices_inbox_dedup_idx on invoices_inbox(company_id, fingerprint)
  where fingerprint is not null;

-- ---------- journal entries ------------------------------------------

create type je_status as enum ('draft', 'validated', 'approved', 'exported', 'error');
create type movein_format as enum ('180', 'flexible');

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid references invoices_inbox(id) on delete set null,
  scenario text,
  movein_format movein_format,
  status je_status not null default 'draft',
  transaction_type text not null,
  reference1 text not null,
  reference2 text,
  document_date date not null,
  value_date date not null,
  currency text not null default 'ILS',
  fx_rate numeric(14,6),
  details text,
  validation_results jsonb,
  batch_id uuid,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger journal_entries_set_updated_at before update on journal_entries
  for each row execute function set_updated_at();
create index journal_entries_company_status_idx on journal_entries(company_id, status);
create index journal_entries_invoice_idx on journal_entries(invoice_id);
create index journal_entries_batch_idx on journal_entries(batch_id);

create table journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  je_id uuid not null references journal_entries(id) on delete cascade,
  line_no smallint not null,
  account text not null,
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  debit_fx numeric(14,2) not null default 0,
  credit_fx numeric(14,2) not null default 0,
  reference1 text,
  reference2 text,
  details text,
  unique (je_id, line_no),
  check (debit >= 0 and credit >= 0),
  check (debit = 0 or credit = 0)
);
create index journal_entry_lines_je_idx on journal_entry_lines(je_id);

-- ---------- movein batches -------------------------------------------

create type batch_priority_status as enum (
  'pending', 'loaded', 'transferred_to_journal', 'error'
);

create table movein_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  batch_number text,
  file_path text,
  scenario_breakdown jsonb,
  exported_at timestamptz,
  exported_by uuid references users(id) on delete set null,
  priority_load_status batch_priority_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now()
);
create index movein_batches_company_idx on movein_batches(company_id);

-- backfill the FK from journal_entries → movein_batches now that the table exists
alter table journal_entries
  add constraint journal_entries_batch_fk
  foreign key (batch_id) references movein_batches(id) on delete set null;

-- ---------- audit_log (append-only) ----------------------------------

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  firm_id uuid references firms(id) on delete set null,
  company_id uuid references companies(id) on delete set null,
  user_id uuid references users(id) on delete set null,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null,
  entity_id text not null,
  payload jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  session_id text
);
create index audit_log_company_ts_idx on audit_log(company_id, ts desc);
create index audit_log_firm_ts_idx on audit_log(firm_id, ts desc);
create index audit_log_action_ts_idx on audit_log(action, ts desc);
create index audit_log_entity_idx on audit_log(entity_type, entity_id);

-- enforce append-only at the DB level
create or replace function audit_log_block_update_delete() returns trigger as $$
begin
  raise exception 'audit_log is append-only — % is forbidden', tg_op;
end;
$$ language plpgsql;
create trigger audit_log_no_update before update on audit_log
  for each row execute function audit_log_block_update_delete();
create trigger audit_log_no_delete before delete on audit_log
  for each row execute function audit_log_block_update_delete();

-- ---------- knowledge base -------------------------------------------

create table kb_articles (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  title text not null,
  body_md text not null,
  screenshot_urls text[] not null default '{}',
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger kb_articles_set_updated_at before update on kb_articles
  for each row execute function set_updated_at();

-- =====================================================================
-- Row-Level Security
-- =====================================================================

alter table firms enable row level security;
alter table users enable row level security;
alter table user_firms enable row level security;
alter table companies enable row level security;
alter table suppliers enable row level security;
alter table supplier_aliases enable row level security;
alter table account_mapping_rules enable row level security;
alter table invoices_inbox enable row level security;
alter table journal_entries enable row level security;
alter table journal_entry_lines enable row level security;
alter table movein_batches enable row level security;
alter table audit_log enable row level security;
alter table kb_articles enable row level security;

-- users: a user can read/update their own profile
create policy users_self_select on users for select
  using (id = auth.uid());
create policy users_self_update on users for update
  using (id = auth.uid()) with check (id = auth.uid());

-- firms: members can read; only owner can write
create policy firms_member_select on firms for select
  using (id in (select current_user_firm_ids()));
create policy firms_owner_update on firms for update
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- user_firms: a user sees their own rows; firm owners see all rows for their firm
create policy user_firms_self_select on user_firms for select
  using (user_id = auth.uid()
         or firm_id in (select id from firms where owner_user_id = auth.uid()));

-- companies and everything below: same firm visibility
create policy companies_firm_access on companies for all
  using (firm_id in (select current_user_firm_ids()))
  with check (firm_id in (select current_user_firm_ids()));

create policy suppliers_firm_access on suppliers for all
  using (company_id in (select id from companies where firm_id in (select current_user_firm_ids())))
  with check (company_id in (select id from companies where firm_id in (select current_user_firm_ids())));

create policy supplier_aliases_firm_access on supplier_aliases for all
  using (supplier_id in (select id from suppliers where company_id in
    (select id from companies where firm_id in (select current_user_firm_ids()))))
  with check (supplier_id in (select id from suppliers where company_id in
    (select id from companies where firm_id in (select current_user_firm_ids()))));

create policy account_mapping_rules_firm_access on account_mapping_rules for all
  using (company_id in (select id from companies where firm_id in (select current_user_firm_ids())))
  with check (company_id in (select id from companies where firm_id in (select current_user_firm_ids())));

create policy invoices_inbox_firm_access on invoices_inbox for all
  using (company_id in (select id from companies where firm_id in (select current_user_firm_ids())))
  with check (company_id in (select id from companies where firm_id in (select current_user_firm_ids())));

create policy journal_entries_firm_access on journal_entries for all
  using (company_id in (select id from companies where firm_id in (select current_user_firm_ids())))
  with check (company_id in (select id from companies where firm_id in (select current_user_firm_ids())));

create policy journal_entry_lines_firm_access on journal_entry_lines for all
  using (je_id in (select id from journal_entries where company_id in
    (select id from companies where firm_id in (select current_user_firm_ids()))))
  with check (je_id in (select id from journal_entries where company_id in
    (select id from companies where firm_id in (select current_user_firm_ids()))));

create policy movein_batches_firm_access on movein_batches for all
  using (company_id in (select id from companies where firm_id in (select current_user_firm_ids())))
  with check (company_id in (select id from companies where firm_id in (select current_user_firm_ids())));

-- audit_log: read-only via firm scope; writes go through application using service role
create policy audit_log_firm_select on audit_log for select
  using (firm_id in (select current_user_firm_ids())
         or company_id in (select id from companies where firm_id in (select current_user_firm_ids())));

-- kb_articles: readable to all authenticated users
create policy kb_articles_authenticated_read on kb_articles for select
  using (auth.role() = 'authenticated');
