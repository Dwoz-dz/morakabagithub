-- Force the known live QA account to admin/approved when it exists in auth.users.
-- This keeps automated live QA scripts deterministic.

begin;

do $$
declare
  v_user_id uuid;
  v_email text;
  v_full_name text;
  v_faction text;
begin
  select u.id
  into v_user_id
  from auth.users u
  where lower(u.email) = 'morakaba.qa.admin.live@gmail.com'
  order by u.created_at desc
  limit 1;

  if v_user_id is null then
    raise notice 'Live QA admin auth user not found. Skipping.';
    return;
  end if;

  select
    lower(coalesce(u.email, '')),
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Live QA Admin'
    )
  into v_email, v_full_name
  from auth.users u
  where u.id = v_user_id;

  select f.name
  into v_faction
  from public.factions f
  order by f.name asc
  limit 1;

  if v_faction is null then
    v_faction := 'General';
  end if;

  insert into public.registration_requests (
    auth_user_id,
    full_name,
    email,
    faction,
    status
  )
  values (
    v_user_id,
    v_full_name,
    v_email,
    v_faction,
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
    v_user_id,
    v_full_name,
    v_email,
    'admin',
    'approved',
    v_faction
  )
  on conflict (auth_user_id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    role = 'admin',
    status = 'approved',
    faction = coalesce(excluded.faction, public.employees.faction),
    updated_at = now();
end;
$$;

commit;
