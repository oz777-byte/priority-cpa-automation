-- =====================================================================
-- Affiliate Engine — initial multi-tenant schema
--
-- Sets up:
--   * accounts / account_members  (tenant boundary)
--   * networks, offers            (who pays us, and on what terms)
--   * assets                      (content pieces we measure)
--   * links, subid_map            (tracking links + lossless subid hashing)
--   * clicks                      (high-volume, privacy-minimised)
--   * report_imports, conversions (network reports, revisable over time)
--   * unattributed_conversions    (nothing is ever dropped silently)
--   * payouts                     (money actually received, FX-aware)
--   * audit_log                   (append-only)
--
-- Conventions (mirrors the parent project):
--   * primary keys are uuid (gen_random_uuid())
--   * timestamps are timestamptz, default now()
--   * money is numeric(14,4) with an explicit currency column
--   * every tenant-scoped table has account_id + RLS
--   * no hard deletes outside clicks retention; use deleted_at / status
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- helpers --------------------------------------------------

create or replace function affiliate_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------- accounts (tenant root) -----------------------------------

create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  -- decision thresholds are configuration, never hard-coded in app logic
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger accounts_set_updated_at before update on accounts
  for each row execute function affiliate_set_updated_at();

create type account_role as enum ('owner', 'admin', 'member', 'viewer');

create table account_members (
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role account_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);

-- membership check used by every RLS policy below
create or replace function is_account_member(target_account uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from account_members m
    where m.account_id = target_account and m.user_id = auth.uid()
  );
$$;

-- ---------- networks -------------------------------------------------

create table networks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  slug text not null,                       -- 'impact', 'partnerstack', 'direct'
  display_name text not null,
  -- subid encoding constraints, see 04_domain/tracking_and_attribution.md
  subid_param text not null default 'subid',
  subid_max_length int not null default 100,
  subid_separator text not null default '.',
  subid_allows_dot boolean not null default true,
  report_timezone text not null default 'UTC',
  api_enabled boolean not null default false,
  -- credentials live in Supabase Vault; only the reference is stored here
  vault_secret_name text,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, slug)
);
create trigger networks_set_updated_at before update on networks
  for each row execute function affiliate_set_updated_at();

-- ---------- offers ---------------------------------------------------

create type commission_model as enum ('cpa', 'cpl', 'revshare', 'ppc', 'hybrid');
create type offer_status as enum ('candidate', 'pending_approval', 'active', 'paused', 'rejected', 'closed');

create table offers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  network_id uuid not null references networks(id) on delete restrict,
  slug text not null,
  advertiser_name text not null,
  status offer_status not null default 'candidate',
  commission_model commission_model not null,
  -- fixed payout per conversion (cpa/cpl)
  payout_amount numeric(14,4),
  -- percentage of sale (revshare); 0-100
  payout_percent numeric(6,3),
  currency text not null default 'USD',
  recurring boolean not null default false,
  recurring_months int,                     -- null = unlimited
  cookie_window_days int not null,
  payment_threshold numeric(14,4),
  payment_terms text,                       -- 'NET30', 'NET60', ...
  destination_url text not null,
  -- how the tracking url is assembled; see link-builder skill
  tracking_url_template text,
  -- proof the terms were verified against an official source
  verification_source text,
  verified_at timestamptz,
  terms_notes text,                         -- e.g. "no brand PPC", "no coupon sites"
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, slug),
  constraint offers_payout_present check (
    payout_amount is not null or payout_percent is not null
  ),
  constraint offers_cookie_positive check (cookie_window_days > 0)
);
create trigger offers_set_updated_at before update on offers
  for each row execute function affiliate_set_updated_at();
create index offers_account_status_idx on offers (account_id, status) where deleted_at is null;

-- ---------- assets (content pieces) ----------------------------------

create type asset_kind as enum ('article', 'comparison', 'review', 'landing', 'video', 'social', 'email');
create type asset_status as enum ('draft', 'published', 'updating', 'retired');

create table assets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  slug text not null,
  title text not null,
  kind asset_kind not null default 'article',
  status asset_status not null default 'draft',
  url text,
  niche text,
  target_keyword text,
  -- time investment is the real currency of this project (TimeROI)
  hours_invested numeric(8,2) not null default 0,
  -- publishing is blocked unless disclosure is in place (see compliance doc)
  disclosure_ok boolean not null default false,
  published_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, slug),
  constraint assets_published_requires_disclosure check (
    status <> 'published' or disclosure_ok
  )
);
create trigger assets_set_updated_at before update on assets
  for each row execute function affiliate_set_updated_at();

-- ---------- links ----------------------------------------------------

create table links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  offer_id uuid not null references offers(id) on delete restrict,
  asset_id uuid references assets(id) on delete set null,
  slug text not null,                       -- public path: /go/{slug}
  placement text not null,                  -- 'hero-cta', 'table-row-2'
  campaign text,
  variant text,
  subid text not null,                      -- canonical, pre-encoding
  encoded_subid text not null,              -- what actually goes on the wire
  encoding text not null default 'plain',   -- plain | sanitized | hashed
  target_url text not null,                 -- fully built tracking url
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, slug)
);
create trigger links_set_updated_at before update on links
  for each row execute function affiliate_set_updated_at();
create index links_account_asset_idx on links (account_id, asset_id);

-- lossless recovery of hashed subids — never truncate, always map back
create table subid_map (
  account_id uuid not null references accounts(id) on delete cascade,
  token text not null,                      -- e.g. 'h1f4a2xz'
  full_subid text not null,
  created_at timestamptz not null default now(),
  primary key (account_id, token)
);

-- ---------- clicks ---------------------------------------------------

create table clicks (
  id bigserial primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  link_id uuid not null references links(id) on delete cascade,
  asset_id uuid references assets(id) on delete set null,
  offer_id uuid not null references offers(id) on delete restrict,
  subid text not null,
  -- privacy: never store a raw IP. hash = sha256(ip || daily_salt)
  ip_hash text,
  visitor_hash text,                        -- derived, 90-day TTL
  device text,                              -- normalised UA: 'mobile' | 'desktop' | 'tablet' | 'bot'
  browser text,
  country text,
  referrer_host text,                       -- host only, never the full URL
  is_bot boolean not null default false,
  created_at timestamptz not null default now()
);
create index clicks_account_created_idx on clicks (account_id, created_at desc);
create index clicks_subid_idx on clicks (account_id, subid);
create index clicks_visitor_idx on clicks (account_id, visitor_hash) where visitor_hash is not null;

-- ---------- report imports -------------------------------------------

create type import_status as enum ('running', 'completed', 'failed', 'partial');

create table report_imports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  network_id uuid not null references networks(id) on delete restrict,
  source text not null,                     -- 'csv' | 'api' | 'postback'
  period_start date,
  period_end date,
  status import_status not null default 'running',
  rows_total int not null default 0,
  rows_imported int not null default 0,
  rows_failed int not null default 0,
  rows_unattributed int not null default 0,
  errors jsonb not null default '[]'::jsonb,
  imported_at timestamptz not null default now()
);
create index report_imports_account_idx on report_imports (account_id, imported_at desc);

-- ---------- conversions ----------------------------------------------

-- networks revise history: pending -> approved -> reversed. keep the state,
-- and keep every observation in conversion_events.
create type conversion_status as enum ('pending', 'approved', 'reversed', 'paid');

create table conversions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  network_id uuid not null references networks(id) on delete restrict,
  offer_id uuid references offers(id) on delete set null,
  asset_id uuid references assets(id) on delete set null,
  link_id uuid references links(id) on delete set null,
  external_id text not null,                -- network's transaction id
  subid_raw text,
  placement text,
  campaign text,
  variant text,
  status conversion_status not null default 'pending',
  sale_amount numeric(14,4),
  commission_amount numeric(14,4) not null,
  currency text not null default 'USD',
  -- ILS conversion for Israeli tax reporting (see compliance_israel.md)
  fx_rate numeric(14,6),
  fx_date date,
  commission_ils numeric(14,4),
  occurred_at timestamptz not null,
  last_import_id uuid references report_imports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- idempotency: re-importing the same report must not duplicate rows
  unique (account_id, network_id, external_id)
);
create trigger conversions_set_updated_at before update on conversions
  for each row execute function affiliate_set_updated_at();
create index conversions_account_occurred_idx on conversions (account_id, occurred_at desc);
create index conversions_asset_idx on conversions (account_id, asset_id);

create table conversion_events (
  id bigserial primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  conversion_id uuid not null references conversions(id) on delete cascade,
  status conversion_status not null,
  commission_amount numeric(14,4) not null,
  import_id uuid references report_imports(id) on delete set null,
  observed_at timestamptz not null default now()
);

-- a conversion we could not attach to an asset is a bug to investigate,
-- never a row to drop
create table unattributed_conversions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  network_id uuid not null references networks(id) on delete restrict,
  import_id uuid references report_imports(id) on delete set null,
  external_id text,
  subid_raw text,
  commission_amount numeric(14,4),
  currency text,
  reason text not null,                     -- 'missing_subid' | 'unparsable' | 'unknown_asset'
  raw_row jsonb,
  resolved_at timestamptz,
  occurred_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- payouts --------------------------------------------------

create table payouts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  network_id uuid not null references networks(id) on delete restrict,
  amount numeric(14,4) not null,
  currency text not null,
  fx_rate numeric(14,6),
  fx_date date,
  amount_ils numeric(14,4),
  period_start date,
  period_end date,
  received_at date,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger payouts_set_updated_at before update on payouts
  for each row execute function affiliate_set_updated_at();

-- ---------- audit log (append-only) ----------------------------------

create table audit_log (
  id bigserial primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id text,
  action text not null,                     -- 'create' | 'update' | 'delete' | 'import'
  changes jsonb,
  created_at timestamptz not null default now()
);

create or replace function audit_log_no_mutate() returns trigger as $$
begin
  raise exception 'audit_log is append-only';
end;
$$ language plpgsql;

create trigger audit_log_immutable
  before update or delete on audit_log
  for each row execute function audit_log_no_mutate();

-- =====================================================================
-- Row Level Security — every tenant-scoped table, no exceptions
-- =====================================================================

alter table accounts                enable row level security;
alter table account_members         enable row level security;
alter table networks                enable row level security;
alter table offers                  enable row level security;
alter table assets                  enable row level security;
alter table links                   enable row level security;
alter table subid_map               enable row level security;
alter table clicks                  enable row level security;
alter table report_imports          enable row level security;
alter table conversions             enable row level security;
alter table conversion_events       enable row level security;
alter table unattributed_conversions enable row level security;
alter table payouts                 enable row level security;
alter table audit_log               enable row level security;

create policy accounts_member_access on accounts
  for all using (is_account_member(id)) with check (is_account_member(id));

create policy account_members_self_access on account_members
  for all using (is_account_member(account_id)) with check (is_account_member(account_id));

do $$
declare t text;
begin
  foreach t in array array[
    'networks', 'offers', 'assets', 'links', 'subid_map', 'clicks',
    'report_imports', 'conversions', 'conversion_events',
    'unattributed_conversions', 'payouts'
  ] loop
    execute format(
      'create policy %I_member_access on %I for all
         using (is_account_member(account_id))
         with check (is_account_member(account_id))', t, t);
  end loop;
end $$;

-- audit_log: members may read and insert, never update or delete
create policy audit_log_read on audit_log
  for select using (is_account_member(account_id));
create policy audit_log_insert on audit_log
  for insert with check (is_account_member(account_id));
