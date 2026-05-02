-- =====================================================================
-- Per-company inbound-email token (Phase 5ד).
--
-- Each company gets a short unique slug. Used as the local part of an
-- inbound email address — e.g. <inbox_token>@inbox.app.oz-nihul.com.
-- Invoices forwarded to that address are POSTed to our webhook by an
-- email provider (SendGrid Inbound Parse / Postmark / Mailgun) and
-- ingested as draft invoices.
-- =====================================================================

alter table companies add column if not exists inbox_token text;

-- Backfill existing companies with a 10-char hex slug.
do $$
declare
  r record;
begin
  for r in (select id from companies where inbox_token is null) loop
    update companies
       set inbox_token = lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
     where id = r.id;
  end loop;
end$$;

alter table companies alter column inbox_token set not null;

create unique index if not exists companies_inbox_token_unique
  on companies(inbox_token);

-- Auto-fill on insert when the application doesn't pre-populate it.
create or replace function public.companies_set_inbox_token()
returns trigger
language plpgsql
as $$
begin
  if new.inbox_token is null or new.inbox_token = '' then
    new.inbox_token := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  end if;
  return new;
end;
$$;

drop trigger if exists companies_inbox_token_trigger on companies;
create trigger companies_inbox_token_trigger
  before insert on companies
  for each row execute function public.companies_set_inbox_token();
