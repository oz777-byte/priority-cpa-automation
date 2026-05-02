-- =====================================================================
-- One-time data fix: link shanyob.cpa@gmail.com to oz@oz-nihul.com's firm.
--
-- The new-user trigger auto-creates a separate firm per signup, so Shany
-- ended up isolated in her own (empty) tenant and couldn't see Oz's
-- company. This migration:
--   1. Adds Shany to Oz's firm as 'admin' (full operational access)
--   2. Sets Oz's firm as her default
--   3. Deletes her empty auto-created firm if it has no companies
--
-- Idempotent: safe to re-run.
-- =====================================================================

do $$
declare
  shany_uid uuid;
  shany_old_firm_id uuid;
  oz_firm_id uuid;
  shany_old_firm_company_count int;
begin
  select id into shany_uid from auth.users
   where email = 'shanyob.cpa@gmail.com';
  if shany_uid is null then
    raise exception 'shanyob.cpa@gmail.com not found in auth.users — has she signed up?';
  end if;

  select f.id into oz_firm_id
    from firms f
    join auth.users au on au.id = f.owner_user_id
   where au.email = 'oz@oz-nihul.com'
   limit 1;
  if oz_firm_id is null then
    raise exception 'No firm owned by oz@oz-nihul.com';
  end if;

  -- Capture her old firm (the one auto-created at signup) before linking
  select id into shany_old_firm_id from firms
   where owner_user_id = shany_uid limit 1;

  -- Link her to Oz's firm as admin (idempotent)
  insert into user_firms (user_id, firm_id, role)
  values (shany_uid, oz_firm_id, 'admin')
  on conflict (user_id, firm_id) do update set role = 'admin';

  update users set default_firm_id = oz_firm_id where id = shany_uid;

  -- Clean up her old empty firm (only if it has no companies)
  if shany_old_firm_id is not null and shany_old_firm_id <> oz_firm_id then
    select count(*) into shany_old_firm_company_count
      from companies where firm_id = shany_old_firm_id;

    if shany_old_firm_company_count = 0 then
      delete from user_firms
       where user_id = shany_uid and firm_id = shany_old_firm_id;
      delete from firms where id = shany_old_firm_id;
      raise notice 'Removed empty old firm %', shany_old_firm_id;
    else
      raise notice 'Old firm % has % companies — kept', shany_old_firm_id, shany_old_firm_company_count;
    end if;
  end if;

  raise notice 'Shany linked to Oz firm % as admin', oz_firm_id;
end$$;
