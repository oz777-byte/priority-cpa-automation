-- =====================================================================
-- Bank transactions — phase 6ב
--
-- Stores raw bank/credit card movements per company. Each row begins
-- as 'unreconciled' and is later matched to a JE (linking the bank
-- side of an invoice payment) or marked as ignored (transfers between
-- own accounts, opening balances, etc.).
-- =====================================================================

create type bank_txn_status as enum ('unreconciled', 'matched', 'ignored');
create type bank_txn_source as enum ('csv', 'manual', 'open_banking');

create table bank_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  bank_name text,
  bank_account_number text,
  txn_date date not null,
  description text not null,
  reference text,
  -- Signed: negative = outflow (debit on the bank's side), positive = inflow.
  amount_ils numeric(14,2) not null,
  currency text not null default 'ILS',
  balance_after numeric(14,2),
  status bank_txn_status not null default 'unreconciled',
  matched_je_id uuid references journal_entries(id) on delete set null,
  source bank_txn_source not null default 'manual',
  -- For CSV/Open-Banking dedup: typically a hash of provider tx id, or
  -- a content-derived hash from (account_number, date, amount, balance).
  source_id text,
  created_at timestamptz not null default now(),
  created_by uuid references users(id) on delete set null,
  unique (company_id, source, source_id)
);
create index bank_transactions_company_date_idx
  on bank_transactions(company_id, txn_date desc);
create index bank_transactions_status_idx
  on bank_transactions(company_id, status);
create index bank_transactions_matched_je_idx
  on bank_transactions(matched_je_id);

-- RLS: same firm-membership pattern as the rest of the schema.
alter table bank_transactions enable row level security;

drop policy if exists "tenant read bank txns" on bank_transactions;
create policy "tenant read bank txns"
on bank_transactions for select to authenticated
using (
  company_id in (
    select c.id from companies c
    join user_firms uf on uf.firm_id = c.firm_id
    where uf.user_id = auth.uid()
  )
);

drop policy if exists "tenant write bank txns" on bank_transactions;
create policy "tenant write bank txns"
on bank_transactions for all to authenticated
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
