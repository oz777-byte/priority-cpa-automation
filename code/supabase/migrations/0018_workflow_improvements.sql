-- =====================================================================
-- Phase 12 — Workflow improvements:
--   1. invoices_inbox.reviewed_at / reviewed_by — bulk-review tracking
--   2. suppliers.learned_from_count — count of invoices that taught
--      the supplier its default expense account (UI indicator)
-- =====================================================================

-- ─── 1. Invoice review tracking ────────────────────────────────────
alter table invoices_inbox
  add column if not exists reviewed_at timestamptz;
alter table invoices_inbox
  add column if not exists reviewed_by uuid references users(id) on delete set null;

create index if not exists invoices_inbox_reviewed_idx
  on invoices_inbox(company_id, reviewed_at);

comment on column invoices_inbox.reviewed_at is
  'When the invoice was bulk-marked as reviewed by a user. Lets the inbox UI hide already-reviewed rows by default.';

-- ─── 2. Supplier auto-learning indicator ───────────────────────────
alter table suppliers
  add column if not exists learned_from_count int not null default 0;
alter table suppliers
  add column if not exists last_learned_at timestamptz;

comment on column suppliers.learned_from_count is
  'Number of invoices whose JE expense account was edited by a user, training the supplier default. Shown in UI as "learned from N invoices".';
