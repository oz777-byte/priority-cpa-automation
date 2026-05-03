-- =====================================================================
-- Improvement notes for accounting-rules library.
-- A user (CPA) can submit a note against any rule (by code + serial id).
-- Admins (oz@oz-nihul.com) read all notes via the admin panel.
-- =====================================================================

create type rule_note_status as enum (
  'open',        -- new submission, not yet reviewed
  'reviewing',   -- admin acknowledged, looking into it
  'planned',     -- accepted into roadmap
  'shipped',     -- implemented
  'rejected',    -- won't fix (with reason)
  'duplicate'    -- duplicate of another note
);

create table rule_improvement_notes (
  id uuid primary key default gen_random_uuid(),
  rule_id smallint not null,        -- sequential serial number (RULES_RAW position + 1)
  rule_code text not null,          -- canonical code (e.g. 'STANDARD', 'BANK_FEE') — stable even if id shifts
  rule_title text not null,         -- snapshot of title at submission time
  user_id uuid not null references users(id) on delete cascade,
  user_email text not null,         -- snapshot for audit trail
  company_id uuid references companies(id) on delete set null,
  note text not null check (length(btrim(note)) >= 10),
  status rule_note_status not null default 'open',
  admin_response text,
  reviewed_at timestamptz,
  reviewed_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index rule_improvement_notes_status_idx
  on rule_improvement_notes(status, created_at desc);
create index rule_improvement_notes_rule_idx
  on rule_improvement_notes(rule_code, created_at desc);
create index rule_improvement_notes_user_idx
  on rule_improvement_notes(user_id, created_at desc);

alter table rule_improvement_notes enable row level security;

-- Authors can read their own notes.
drop policy if exists "users read own notes" on rule_improvement_notes;
create policy "users read own notes"
on rule_improvement_notes for select to authenticated
using (user_id = auth.uid());

-- Admins read everything (role = 'admin').
drop policy if exists "admins read all notes" on rule_improvement_notes;
create policy "admins read all notes"
on rule_improvement_notes for select to authenticated
using (
  (select role from users where id = auth.uid()) = 'admin'::app_role
);

-- Authenticated users can submit notes for themselves.
drop policy if exists "users insert own notes" on rule_improvement_notes;
create policy "users insert own notes"
on rule_improvement_notes for insert to authenticated
with check (user_id = auth.uid());

-- Only admins can update (response/status).
drop policy if exists "admins update notes" on rule_improvement_notes;
create policy "admins update notes"
on rule_improvement_notes for update to authenticated
using (
  (select role from users where id = auth.uid()) = 'admin'::app_role
)
with check (
  (select role from users where id = auth.uid()) = 'admin'::app_role
);

-- Only admins can delete (rare — for spam cleanup).
drop policy if exists "admins delete notes" on rule_improvement_notes;
create policy "admins delete notes"
on rule_improvement_notes for delete to authenticated
using (
  (select role from users where id = auth.uid()) = 'admin'::app_role
);
