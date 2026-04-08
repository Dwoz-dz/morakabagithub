-- Enforce Morakaba factions and primary-admin controls.
-- 1) Lock faction list to exactly 3 values
-- 2) Restrict admin-role creation to primary admin only
-- 3) Ensure primary admin account is always approved admin in employees

-- Keep only the official faction names.
delete from public.factions
where name not in (
  'خليل 21',
  'خليل 29',
  'فرقة البحث و الوقاية'
);

insert into public.factions (name)
values
  ('خليل 21'),
  ('خليل 29'),
  ('فرقة البحث و الوقاية')
on conflict (name) do nothing;

create or replace function public.is_primary_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _is_primary_admin boolean;
begin
  select exists (
    select 1
    from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.status = 'approved'
      and lower(e.email) = 'mohcenneddam@gmail.com'
  )
  into _is_primary_admin;

  return coalesce(_is_primary_admin, false);
end;
$$;

revoke all on function public.is_primary_admin() from public;
grant execute on function public.is_primary_admin() to authenticated;

drop policy if exists "employees_insert_admin" on public.employees;
drop policy if exists "employees_insert_admin_controlled" on public.employees;
create policy "employees_insert_admin_controlled"
on public.employees
for insert
to authenticated
with check (
  public.is_admin()
  and (
    role <> 'admin'
    or public.is_primary_admin()
  )
  and (
    lower(email) <> 'mohcenneddam@gmail.com'
    or role = 'admin'
  )
);

drop policy if exists "employees_update_admin" on public.employees;
drop policy if exists "employees_update_admin_controlled" on public.employees;
create policy "employees_update_admin_controlled"
on public.employees
for update
to authenticated
using (
  public.is_admin()
  and (
    lower(email) <> 'mohcenneddam@gmail.com'
    or public.is_primary_admin()
  )
)
with check (
  public.is_admin()
  and (
    role <> 'admin'
    or public.is_primary_admin()
  )
  and (
    lower(email) <> 'mohcenneddam@gmail.com'
    or role = 'admin'
  )
);

do $$
declare
  _primary_auth_user_id uuid;
  _primary_full_name text;
begin
  select
    u.id,
    coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1))
  into _primary_auth_user_id, _primary_full_name
  from auth.users u
  where lower(u.email) = 'mohcenneddam@gmail.com'
  order by u.created_at asc
  limit 1;

  if _primary_auth_user_id is not null then
    insert into public.employees (
      auth_user_id,
      full_name,
      email,
      role,
      status,
      faction
    )
    values (
      _primary_auth_user_id,
      _primary_full_name,
      'mohcenneddam@gmail.com',
      'admin',
      'approved',
      'خليل 21'
    )
    on conflict (auth_user_id) do update
    set
      full_name = case
        when employees.full_name is null or btrim(employees.full_name) = '' then excluded.full_name
        else employees.full_name
      end,
      email = excluded.email,
      role = 'admin',
      status = 'approved',
      faction = coalesce(employees.faction, excluded.faction);

    update public.registration_requests
    set status = 'approved'
    where auth_user_id = _primary_auth_user_id
      and status <> 'approved';
  end if;
end;
$$;
