-- =====================================================================
-- Sales (AR) invoices — mirror of invoices_inbox for the customer side.
-- Each row stores a canonical sales invoice (SalesInvoice JSON shape)
-- and links to the JE(s) generated from it.
-- =====================================================================

create type sales_invoice_status as enum (
  'draft', 'queued', 'approved', 'exported', 'cancelled', 'error'
);

create type sales_doc_type as enum (
  'tax_invoice',
  'invoice_receipt',
  'proforma',
  'receipt',
  'credit_note'
);

create table sales_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  doc_type sales_doc_type not null default 'tax_invoice',
  -- Canonical SalesInvoice JSON. Validated against SalesInvoiceSchema
  -- in the server action before insert.
  canonical jsonb not null,
  -- Sequential per-company JE-style number assigned at creation.
  -- Format: "INV-{seq}" / "REC-{seq}" / "CN-{seq}" depending on doc_type.
  invoice_number text,
  fingerprint text,
  status sales_invoice_status not null default 'draft',
  -- Original source document (PDF / generated). Optional.
  pdf_path text,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger sales_invoices_set_updated_at before update on sales_invoices
  for each row execute function set_updated_at();
create index sales_invoices_company_status_idx
  on sales_invoices(company_id, status);
create index sales_invoices_customer_idx on sales_invoices(customer_id);
create unique index sales_invoices_dedup_idx
  on sales_invoices(company_id, fingerprint)
  where fingerprint is not null;

-- RLS — same pattern as bank_transactions / customers.
alter table sales_invoices enable row level security;

drop policy if exists "tenant read sales invoices" on sales_invoices;
create policy "tenant read sales invoices"
on sales_invoices for select to authenticated
using (
  company_id in (
    select c.id from companies c
    join user_firms uf on uf.firm_id = c.firm_id
    where uf.user_id = auth.uid()
  )
);

drop policy if exists "tenant write sales invoices" on sales_invoices;
create policy "tenant write sales invoices"
on sales_invoices for all to authenticated
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

-- Add a sales_invoice_id reference on journal_entries so AR JEs can be
-- traced back to their source document (mirrors invoice_id for AP).
alter table journal_entries
  add column if not exists sales_invoice_id uuid
  references sales_invoices(id) on delete set null;
create index if not exists journal_entries_sales_invoice_idx
  on journal_entries(sales_invoice_id);
