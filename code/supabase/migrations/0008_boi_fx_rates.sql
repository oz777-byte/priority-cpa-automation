-- =====================================================================
-- Bank of Israel daily FX rates cache (Phase 5ה).
--
-- The application fetches rates from BOI's public API and upserts them
-- here. Rates are global (not per-company) — the same USD→ILS rate
-- applies to every company on the same date.
-- =====================================================================

create table fx_rates (
  rate_date date not null,
  currency text not null,
  -- ILS per 1 unit of `currency` (BOI's "CurrentExchangeRate" semantic).
  rate numeric(14,6) not null,
  source text not null default 'boi',
  fetched_at timestamptz not null default now(),
  primary key (rate_date, currency)
);
create index fx_rates_currency_date_idx on fx_rates(currency, rate_date desc);

-- Public read (rates are not sensitive). Writes through service role.
alter table fx_rates enable row level security;

drop policy if exists "anyone can read fx rates" on fx_rates;
create policy "anyone can read fx rates"
on fx_rates for select to authenticated
using (true);
