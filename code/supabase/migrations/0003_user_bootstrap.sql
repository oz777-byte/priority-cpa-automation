-- =====================================================================
-- User & firm bootstrap
--
-- Goals:
--   * Every authenticated user has a firm + user_firms link, automatically.
--   * Existing users (Oz) are backfilled.
--   * Helper RPC `bootstrap_current_user_firm()` is callable by the app
--     to reconcile state (also works as a no-op if already set up).
-- =====================================================================

-- 1. Update the new-user trigger to also create a firm (if none) and link.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_firm_id uuid;
begin
  -- Insert/upsert the user profile
  insert into public.users (id, email, role)
  values (new.id, new.email, 'member')
  on conflict (id) do nothing;

  -- If the user already has a firm membership, nothing more to do.
  if exists (select 1 from public.user_firms where user_id = new.id) then
    return new;
  end if;

  -- Otherwise create a default firm and own membership.
  insert into public.firms (name, owner_user_id)
  values (coalesce(split_part(new.email, '@', 1), 'משרד'), new.id)
  returning id into new_firm_id;

  insert into public.user_firms (user_id, firm_id, role)
  values (new.id, new_firm_id, 'owner');

  -- Set as default firm
  update public.users set default_firm_id = new_firm_id where id = new.id;

  return new;
end;
$$;

-- 2. Backfill: any existing auth.users without a firm membership
do $$
declare
  r record;
  fid uuid;
begin
  for r in (
    select au.id, au.email
    from auth.users au
    left join public.user_firms uf on uf.user_id = au.id
    where uf.user_id is null
  ) loop
    -- Ensure public.users row exists
    insert into public.users (id, email)
    values (r.id, r.email)
    on conflict (id) do nothing;

    insert into public.firms (name, owner_user_id)
    values (coalesce(split_part(r.email, '@', 1), 'משרד'), r.id)
    returning id into fid;

    insert into public.user_firms (user_id, firm_id, role)
    values (r.id, fid, 'owner');

    update public.users set default_firm_id = fid where id = r.id;
  end loop;
end$$;

-- 3. Idempotent RPC the app can call to ensure firm setup
create or replace function public.bootstrap_current_user_firm()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  fid uuid;
  user_email text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select firm_id into fid from public.user_firms
  where user_id = uid limit 1;
  if fid is not null then
    return fid;
  end if;

  select email into user_email from auth.users where id = uid;

  insert into public.firms (name, owner_user_id)
  values (coalesce(split_part(user_email, '@', 1), 'משרד'), uid)
  returning id into fid;

  insert into public.user_firms (user_id, firm_id, role)
  values (uid, fid, 'owner');

  update public.users set default_firm_id = fid where id = uid;

  return fid;
end;
$$;
grant execute on function public.bootstrap_current_user_firm() to authenticated;
