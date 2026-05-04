-- =====================================================================
-- journal_entry_lines.cost_center — fixes silent bug where asset/cash-bank/
-- payroll/with-cost-center builders passed cost_center to insert payload
-- but the column didn't exist (Postgres raised silently or insert dropped it).
-- Also enables Priority-style JE editor to show cost-center column per line.
-- =====================================================================

alter table journal_entry_lines
  add column if not exists cost_center text;

comment on column journal_entry_lines.cost_center is
  'Optional cost-center / project tag per line. Required for FLEXIBLE MOVEIN export but ignored by the 180-char format.';
