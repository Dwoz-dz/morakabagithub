-- Repair admin seed data on remote environments where QA/admin accounts drifted.
-- Strategy:
-- 1) Prefer primary admin email if present in auth.users.
-- 2) Fallback to QA admin email if primary is missing.
-- 3) Ensure registration_requests + employees rows are approved admin for that user.

begin;

do $$
declare
  v_primary_user_id uuid;
  v_qa_user_id uuid;
  v_target_user_id uuid;
  v_target_email text;
  v_target_full_name text;
  v_faction text;
begin
  select u.id
  into v_primary_user_id
  from auth.users u
  where lower(u.email) = 'mohcenneddam@gmail.com'
  order by u.created_at desc
  limit 1;

  select u.id
  into v_qa_user_id
  from auth.users u
  where lower(u.email) = 'morakaba.qa.admin.live@gmail.com'
  order by u.created_at desc
  limit 1;

  v_target_user_id := coalesce(v_primary_user_id, v_qa_user_id);

  if v_target_user_id is null then
    raise notice 'No primary/qa admin auth user found. Skipping admin repair.';
    return;
  end if;

  select
    lower(coalesce(u.email, '')),
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Morakaba Admin'
    )
  into v_target_email, v_target_full_name
  from auth.users u
  where u.id = v_target_user_id;

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
    v_target_user_id,
    v_target_full_name,
    v_target_email,
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
    v_target_user_id,
    v_target_full_name,
    v_target_email,
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
