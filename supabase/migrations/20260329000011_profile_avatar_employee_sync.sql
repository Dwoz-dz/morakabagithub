-- Stabilize profile flow and avatar/signature persistence:
-- 1) Keep employees in sync with registration_requests (insert/update trigger + backfill)
-- 2) Provide authenticated self-heal/profile-update RPCs (security definer)
-- 3) Ensure profile avatar bucket/policies are present and deterministic
-- 4) Ensure weapon signature path column exists

alter table public.weapon_submissions
  add column if not exists signature_path text;

-- Old environments may already have these functions with different signatures/return types.
-- Drop all overloads first to avoid:
-- ERROR: 42P13 cannot change return type of existing function
drop trigger if exists trg_registration_requests_sync_employee on public.registration_requests;

do $$
declare
  r record;
begin
  for r in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'registration_requests_sync_employee_trigger',
        'update_current_employee_profile',
        'ensure_employee_profile_for_current_user',
        'sync_employee_from_registration_request'
      )
  loop
    execute format(
      'drop function if exists %I.%I(%s) cascade',
      r.schema_name,
      r.function_name,
      r.args
    );
  end loop;
end;
$$;

create or replace function public.sync_employee_from_registration_request(p_auth_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_request record;
  v_fallback_faction text;
  v_faction text;
  v_role text;
  v_status text;
  v_email text;
  v_full_name text;
  v_existing_admin boolean;
begin
  if p_auth_user_id is null then
    return false;
  end if;

  v_actor := auth.uid();
  if v_actor is not null
     and v_actor <> p_auth_user_id
     and not public.is_admin()
  then
    raise exception 'Not authorized to sync this employee profile';
  end if;

  select
    rr.auth_user_id,
    rr.full_name,
    rr.email,
    rr.faction,
    rr.status
  into v_request
  from public.registration_requests rr
  where rr.auth_user_id = p_auth_user_id
  order by rr.created_at desc
  limit 1;

  if not found then
    return false;
  end if;

  select f.name
  into v_fallback_faction
  from public.factions f
  order by f.name asc
  limit 1;

  if v_request.faction is not null
    and exists (
      select 1
      from public.factions f
      where f.name = v_request.faction
    )
  then
    v_faction := v_request.faction;
  else
    v_faction := v_fallback_faction;
  end if;

  v_email := lower(coalesce(nullif(btrim(v_request.email), ''), ''));
  v_full_name := coalesce(
    nullif(btrim(v_request.full_name), ''),
    nullif(split_part(v_email, '@', 1), ''),
    'Morakaba User'
  );

  select exists (
    select 1
    from public.employees e
    where e.auth_user_id = p_auth_user_id
      and e.role = 'admin'
  )
  into v_existing_admin;

  if v_email = 'mohcenneddam@gmail.com' or v_existing_admin then
    v_role := 'admin';
  else
    v_role := 'member';
  end if;

  if v_role = 'admin' then
    v_status := 'approved';
  elsif v_request.status = 'approved' then
    v_status := 'approved';
  elsif v_request.status = 'rejected' then
    v_status := 'rejected';
  else
    v_status := 'pending';
  end if;

  insert into public.employees (
    auth_user_id,
    full_name,
    email,
    role,
    status,
    faction
  )
  values (
    p_auth_user_id,
    v_full_name,
    coalesce(nullif(btrim(v_request.email), ''), v_email),
    v_role,
    v_status,
    v_faction
  )
  on conflict (auth_user_id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    role = case
      when public.employees.role = 'admin' then 'admin'
      else excluded.role
    end,
    status = case
      when public.employees.role = 'admin' then 'approved'
      else excluded.status
    end,
    faction = coalesce(excluded.faction, public.employees.faction),
    updated_at = now();

  return true;
end;
$$;

revoke all on function public.sync_employee_from_registration_request(uuid) from public;
grant execute on function public.sync_employee_from_registration_request(uuid) to authenticated;

create or replace function public.ensure_employee_profile_for_current_user()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return false;
  end if;

  perform public.sync_employee_from_registration_request(v_uid);

  return exists (
    select 1
    from public.employees e
    where e.auth_user_id = v_uid
  );
end;
$$;

revoke all on function public.ensure_employee_profile_for_current_user() from public;
grant execute on function public.ensure_employee_profile_for_current_user() to authenticated;

create or replace function public.update_current_employee_profile(
  p_full_name text default null,
  p_avatar_url text default null,
  p_set_avatar boolean default false
)
returns public.employees
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_row public.employees%rowtype;
  v_name text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_employee_profile_for_current_user();

  if p_full_name is not null then
    v_name := nullif(btrim(p_full_name), '');
    if v_name is null then
      raise exception 'Full name cannot be empty';
    end if;
  else
    v_name := null;
  end if;

  update public.employees e
  set
    full_name = coalesce(v_name, e.full_name),
    avatar_url = case
      when p_set_avatar then p_avatar_url
      else e.avatar_url
    end,
    updated_at = now()
  where e.auth_user_id = v_uid
  returning *
  into v_row;

  if not found then
    raise exception 'Employee profile not found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.update_current_employee_profile(text, text, boolean) from public;
grant execute on function public.update_current_employee_profile(text, text, boolean) to authenticated;

create or replace function public.registration_requests_sync_employee_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_employee_from_registration_request(new.auth_user_id);
  return new;
end;
$$;

drop trigger if exists trg_registration_requests_sync_employee on public.registration_requests;
create trigger trg_registration_requests_sync_employee
after insert or update of status, full_name, email, faction
on public.registration_requests
for each row
execute function public.registration_requests_sync_employee_trigger();

do $$
declare
  r record;
begin
  for r in
    select distinct rr.auth_user_id
    from public.registration_requests rr
    where rr.auth_user_id is not null
  loop
    perform public.sync_employee_from_registration_request(r.auth_user_id);
  end loop;
end;
$$;

insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', false)
on conflict (id) do nothing;

drop policy if exists "profile_avatars_insert_owner" on storage.objects;
create policy "profile_avatars_insert_owner"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (
    public.is_approved_user()
    or public.is_admin()
  )
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_avatars_select_owner_or_admin" on storage.objects;
create policy "profile_avatars_select_owner_or_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (
    (
      public.is_approved_user()
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    or public.is_admin()
  )
);

drop policy if exists "profile_avatars_update_owner_or_admin" on storage.objects;
create policy "profile_avatars_update_owner_or_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (
    (
      public.is_approved_user()
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    or public.is_admin()
  )
)
with check (
  bucket_id = 'profile-avatars'
  and (
    (
      public.is_approved_user()
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    or public.is_admin()
  )
);

drop policy if exists "profile_avatars_delete_owner_or_admin" on storage.objects;
create policy "profile_avatars_delete_owner_or_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (
    (
      public.is_approved_user()
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    or public.is_admin()
  )
);
