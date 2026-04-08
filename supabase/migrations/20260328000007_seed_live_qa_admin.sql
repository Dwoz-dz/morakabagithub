-- Seed/repair a live admin account used for end-to-end verification.
-- Safe to re-run.

do $$
declare
  _user_id uuid;
begin
  select id
  into _user_id
  from auth.users
  where email = 'morakaba.qa.admin.live@gmail.com'
  order by created_at desc
  limit 1;

  if _user_id is null then
    raise notice 'QA admin user not found in auth.users; skipping seed.';
    return;
  end if;

  insert into public.registration_requests (
    auth_user_id,
    full_name,
    email,
    faction,
    status
  )
  values (
    _user_id,
    'Live Admin',
    'morakaba.qa.admin.live@gmail.com',
    'فرقة البحث و الوقاية',
    'approved'
  )
  on conflict (auth_user_id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    faction = excluded.faction,
    status = 'approved';

  insert into public.employees (
    auth_user_id,
    full_name,
    email,
    role,
    status,
    faction
  )
  values (
    _user_id,
    'Live Admin',
    'morakaba.qa.admin.live@gmail.com',
    'admin',
    'approved',
    'فرقة البحث و الوقاية'
  )
  on conflict (auth_user_id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    role = 'admin',
    status = 'approved',
    faction = excluded.faction;
end;
$$;
