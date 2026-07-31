-- =====================================================================
-- Affiliate Engine — storefront catalog
--
-- Adds the tables the OS Tech Ventures storefront needs on top of the
-- attribution core in 0001:
--   * stores            marketplace sellers, with the quality signals we rank on
--   * catalog_products   curated listings, plus why a listing was rejected
--   * price_history      marketplace prices move constantly; a claim needs a date
--   * pages              generated category and model pages (an asset each)
--   * page_products      which listing sits in which slot on which page
--   * sync_runs          every catalog refresh, with what it changed
--
-- Conventions follow 0001: uuid keys, timestamptz, numeric(14,4) money with an
-- explicit currency, account_id and RLS on every table.
-- =====================================================================

-- ---------- stores ---------------------------------------------------

create table stores (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  network_id uuid not null references networks(id) on delete restrict,
  external_id text not null,                -- marketplace shop id
  name text,
  url text,
  -- positive-feedback percentage, 0-100
  rating numeric(5,2),
  recent_orders int not null default 0,
  -- set false to exclude a seller from the storefront regardless of metrics,
  -- e.g. after a delivery complaint
  approved boolean not null default true,
  approval_note text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, network_id, external_id)
);
create trigger stores_set_updated_at before update on stores
  for each row execute function affiliate_set_updated_at();

-- ---------- catalog products -----------------------------------------

create type catalog_status as enum ('active', 'rejected', 'stale', 'removed');

create table catalog_products (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  network_id uuid not null references networks(id) on delete restrict,
  store_id uuid references stores(id) on delete set null,
  external_id text not null,                -- marketplace product id
  title text not null,
  image_url text,
  detail_url text not null,
  status catalog_status not null default 'active',

  sale_price numeric(14,4),
  original_price numeric(14,4),
  currency text not null default 'USD',
  discount_percent int,

  -- stored as a ratio: 9% is 0.0900
  commission_rate numeric(6,4),
  estimated_commission numeric(14,4),

  category_slug text,
  brand_slug text,
  model_slug text,

  -- the storefront's entire premise; a false here must never reach a page
  is_choice boolean not null default false,
  tags text[] not null default '{}',

  -- why curation refused it, so a filter quietly eating the catalog is visible
  rejection_reasons text[] not null default '{}',

  -- title fingerprint used to collapse the same accessory relisted by
  -- several sellers
  dedupe_key text,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, network_id, external_id)
);
create trigger catalog_products_set_updated_at before update on catalog_products
  for each row execute function affiliate_set_updated_at();

create index catalog_products_active_idx
  on catalog_products (account_id, category_slug, brand_slug)
  where status = 'active';
create index catalog_products_dedupe_idx on catalog_products (account_id, dedupe_key);

-- ---------- price history --------------------------------------------

-- Marketplace prices change daily. A page that prints a price needs to be able
-- to say when that price was true, and a price that has not been refreshed
-- recently must not be presented as current.
create table price_history (
  id bigserial primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  catalog_product_id uuid not null references catalog_products(id) on delete cascade,
  sale_price numeric(14,4) not null,
  original_price numeric(14,4),
  currency text not null,
  observed_at timestamptz not null default now()
);
create index price_history_product_idx
  on price_history (account_id, catalog_product_id, observed_at desc);

-- ---------- generated pages ------------------------------------------

-- A storefront page is an asset in the attribution model: its slug is the
-- first segment of every SubID on it.
create table pages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  asset_id uuid references assets(id) on delete set null,
  slug text not null,
  title_he text not null,
  category_slug text not null,
  brand_slug text,
  model_slug text,
  meta_title text,
  meta_description text,
  -- a page with too few products is emitted noindex rather than published thin
  indexable boolean not null default false,
  product_count int not null default 0,
  published_at timestamptz,
  last_built_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, slug)
);
create trigger pages_set_updated_at before update on pages
  for each row execute function affiliate_set_updated_at();

create table page_products (
  account_id uuid not null references accounts(id) on delete cascade,
  page_id uuid not null references pages(id) on delete cascade,
  catalog_product_id uuid not null references catalog_products(id) on delete cascade,
  -- 1-based slot, and the source of the SubID placement segment
  position int not null,
  placement text not null,
  link_id uuid references links(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (page_id, catalog_product_id)
);
create index page_products_position_idx on page_products (page_id, position);

-- ---------- sync runs ------------------------------------------------

create type sync_status as enum ('running', 'completed', 'failed', 'partial');

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  network_id uuid not null references networks(id) on delete restrict,
  trigger text not null,                    -- 'scheduled' | 'manual' | 'backfill'
  status sync_status not null default 'running',
  queries_run int not null default 0,
  products_seen int not null default 0,
  products_admitted int not null default 0,
  products_rejected int not null default 0,
  products_removed int not null default 0,
  pages_built int not null default 0,
  -- counts keyed by rejection reason; a jump here means a filter or a field
  -- name changed upstream
  rejection_counts jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index sync_runs_account_idx on sync_runs (account_id, started_at desc);

-- =====================================================================
-- Row Level Security
-- =====================================================================

alter table stores            enable row level security;
alter table catalog_products  enable row level security;
alter table price_history     enable row level security;
alter table pages             enable row level security;
alter table page_products     enable row level security;
alter table sync_runs         enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'stores', 'catalog_products', 'price_history', 'pages', 'page_products', 'sync_runs'
  ] loop
    execute format(
      'create policy %I_member_access on %I for all
         using (is_account_member(account_id))
         with check (is_account_member(account_id))', t, t);
  end loop;
end $$;
