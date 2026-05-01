-- =====================================================================
-- Priority CPA Automation — admin & security layer
--
-- Adds:
--   * app_role enum (admin / member) on public.users
--   * trigger to auto-mirror auth.users → public.users
--   * trigger to enforce a maximum of 5 users (configurable)
--   * is_admin() helper used by RLS
--   * RLS policy letting admins read/update all user rows
--   * backfill existing auth.users into public.users
--   * promote oz@oz-nihul.com to 'admin'
-- =====================================================================

-- 1. Role column
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('admin', 'member');
  end if;
end$$;

alter table public.users
  add column if not exists role app_role not null default 'member';

-- 2. Auto-create public.users row when an auth.users row is created
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, role)
  values (new.id, new.email, 'member')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 3. User-count cap (5)
create or replace function public.enforce_user_limit()
returns trigger
language plpgsql
as $$
declare
  current_count int;
  max_users int := 5;
begin
  select count(*) into current_count from auth.users;
  if current_count >= max_users then
    raise exception 'maximum % users allowed; remove an existing user first', max_users
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists limit_users_count on auth.users;
create trigger limit_users_count
  before insert on auth.users
  for each row execute function public.enforce_user_limit();

-- 4. is_admin() helper for RLS
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role from public.users where id = auth.uid()) = 'admin'::app_role,
    false
  );
$$;

-- 5. Admin-can-see-all RLS policies on public.users
drop policy if exists users_admin_select on public.users;
create policy users_admin_select on public.users for select
  using (public.is_admin());

drop policy if exists users_admin_update on public.users;
create policy users_admin_update on public.users for update
  using (public.is_admin())
  with check (public.is_admin());

-- 6. Backfill: any auth.users that don't yet have a public.users row
insert into public.users (id, email, role)
select id, email, 'member'
from auth.users
on conflict (id) do nothing;

-- 7. Promote the bootstrap admin
update public.users
set role = 'admin'
where email = 'oz@oz-nihul.com';
