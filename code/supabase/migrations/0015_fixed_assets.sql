-- =====================================================================
-- Fixed assets master + monthly depreciation tracking.
-- Straight-line method only (Phase 9). Declining-balance — future phase.
-- =====================================================================

create type fixed_asset_status as enum (
  'active',     -- in use, accruing depreciation
  'sold',       -- sold to a third party
  'disposed',   -- scrapped / written off (no proceeds)
  'inactive'    -- temporarily not in use, paused depreciation
);

-- Standard Israeli tax-authority depreciation categories.
-- Each maps to a default rate per "תקנות מס הכנסה (פחת)".
-- Rate is annual percent; monthly rate = rate / 12.
create type fixed_asset_category as enum (
  'office_equipment',     -- ציוד משרדי — 7%
  'computers',            -- מחשבים, ציוד מחשוב — 33%
  'vehicles',             -- כלי רכב — 15%
  'furniture',            -- ריהוט — 7%
  'machinery',            -- מכונות וציוד תעשייתי — 7%-15%
  'buildings',            -- מבנים — 4%
  'leasehold_improvements', -- שיפורים במושכר — לפי תקופת השכירות
  'software',             -- תוכנה — 33%
  'other'                 -- אחר — שיעור מותאם
);

create table fixed_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  -- Asset details.
  name text not null,
  description text,
  category fixed_asset_category not null,
  serial_number text,
  -- Tax/accounting parameters.
  purchase_date date not null,
  purchase_amount numeric(14, 2) not null check (purchase_amount > 0),
  -- Annual depreciation rate (e.g. 0.33 = 33% per year, straight-line).
  depreciation_rate_annual numeric(5, 4) not null check (depreciation_rate_annual > 0 and depreciation_rate_annual <= 1),
  -- Salvage value (ערך גרט) — typically 0 in Israeli straight-line for tax.
  salvage_value numeric(14, 2) not null default 0 check (salvage_value >= 0),
  -- Useful life in months (derived = ceil((100% - salvage%) / monthly rate)).
  -- Stored explicitly so depreciation runs are deterministic.
  useful_life_months int not null check (useful_life_months > 0),
  -- Accounts: where to book the asset (DR) and the contra-account for accumulated depreciation (CR).
  asset_account text not null,                 -- e.g. '140-2' מחשבים
  accumulated_depreciation_account text not null, -- e.g. '149-2' פחת מצטבר על מחשבים
  depreciation_expense_account text not null,  -- e.g. '610-0' הוצאות פחת
  cost_center text,
  -- Status + lifecycle.
  status fixed_asset_status not null default 'active',
  in_service_date date,                        -- when the asset entered service (defaults to purchase_date)
  retired_date date,                           -- sold/disposed date
  retirement_proceeds numeric(14, 2),          -- sale price net of VAT (null if disposed)
  retirement_je_id uuid,                       -- FK target — set after retirement JE is generated
  -- Source linkage to the supplier invoice that created this asset.
  source_invoice_id uuid references invoices_inbox(id) on delete set null,
  -- Aggregates (denormalized for fast UI rendering — recomputed by triggers).
  accumulated_depreciation numeric(14, 2) not null default 0,
  last_depreciation_date date,                 -- last (year, month) for which depreciation was booked
  -- Audit.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id) on delete set null
);
create trigger fixed_assets_set_updated_at before update on fixed_assets
  for each row execute function set_updated_at();
create index fixed_assets_company_status_idx
  on fixed_assets(company_id, status);
create index fixed_assets_purchase_date_idx
  on fixed_assets(company_id, purchase_date desc);

-- Per-month depreciation history. One row per (asset, year, month) when
-- depreciation was actually booked. Idempotency is enforced by the
-- composite unique constraint — re-running a month is a no-op.
create table fixed_asset_depreciation_runs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references fixed_assets(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  year smallint not null,
  month smallint not null check (month between 1 and 12),
  amount numeric(14, 2) not null check (amount >= 0),
  je_id uuid,                                  -- the depreciation JE
  created_at timestamptz not null default now(),
  unique (asset_id, year, month)
);
create index fad_runs_company_period_idx
  on fixed_asset_depreciation_runs(company_id, year desc, month desc);

-- Add back-reference on journal_entries so asset JEs can be traced.
alter table journal_entries
  add column if not exists fixed_asset_id uuid
    references fixed_assets(id) on delete set null;
create index if not exists journal_entries_fixed_asset_idx
  on journal_entries(fixed_asset_id);

-- ─── RLS ─────────────────────────────────────────────────────────────
alter table fixed_assets enable row level security;
alter table fixed_asset_depreciation_runs enable row level security;

drop policy if exists "tenant read assets" on fixed_assets;
create policy "tenant read assets"
on fixed_assets for select to authenticated
using (
  company_id in (
    select c.id from companies c
    join user_firms uf on uf.firm_id = c.firm_id
    where uf.user_id = auth.uid()
  )
);

drop policy if exists "tenant write assets" on fixed_assets;
create policy "tenant write assets"
on fixed_assets for all to authenticated
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

drop policy if exists "tenant read dep runs" on fixed_asset_depreciation_runs;
create policy "tenant read dep runs"
on fixed_asset_depreciation_runs for select to authenticated
using (
  company_id in (
    select c.id from companies c
    join user_firms uf on uf.firm_id = c.firm_id
    where uf.user_id = auth.uid()
  )
);

drop policy if exists "tenant write dep runs" on fixed_asset_depreciation_runs;
create policy "tenant write dep runs"
on fixed_asset_depreciation_runs for all to authenticated
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
