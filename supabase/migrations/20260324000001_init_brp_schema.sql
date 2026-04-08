-- Morakaba (BRP) - production auth + admin schema
-- Safe to re-run in SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.factions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'frozen', 'blocked')),
  faction text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.registration_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  faction text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists idx_employees_auth_user_id on public.employees(auth_user_id);
create index if not exists idx_employees_role_status on public.employees(role, status);
create index if not exists idx_registration_requests_auth_user_id on public.registration_requests(auth_user_id);
create index if not exists idx_registration_requests_status on public.registration_requests(status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_employees_set_updated_at on public.employees;
create trigger trg_employees_set_updated_at
before update on public.employees
for each row
execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _is_admin boolean;
begin
  select exists (
    select 1
    from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.status = 'approved'
  )
  into _is_admin;

  return coalesce(_is_admin, false);
end;
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.employees enable row level security;
alter table public.registration_requests enable row level security;
alter table public.factions enable row level security;

drop policy if exists "employees_select_self_or_admin" on public.employees;
create policy "employees_select_self_or_admin"
on public.employees
for select
to authenticated
using (
  auth.uid() = auth_user_id
  or public.is_admin()
);

drop policy if exists "employees_update_admin" on public.employees;
create policy "employees_update_admin"
on public.employees
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "employees_insert_admin" on public.employees;
create policy "employees_insert_admin"
on public.employees
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "registration_requests_insert_own" on public.registration_requests;
create policy "registration_requests_insert_own"
on public.registration_requests
for insert
to authenticated
with check (auth.uid() = auth_user_id);

drop policy if exists "registration_requests_select_own_or_admin" on public.registration_requests;
create policy "registration_requests_select_own_or_admin"
on public.registration_requests
for select
to authenticated
using (
  auth.uid() = auth_user_id
  or public.is_admin()
);

drop policy if exists "registration_requests_update_admin" on public.registration_requests;
create policy "registration_requests_update_admin"
on public.registration_requests
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "factions_select_authenticated" on public.factions;
create policy "factions_select_authenticated"
on public.factions
for select
to authenticated
using (true);

drop policy if exists "factions_manage_admin" on public.factions;
create policy "factions_manage_admin"
on public.factions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('weapon-checks', 'weapon-checks', false)
on conflict (id) do nothing;

drop policy if exists "weapon_checks_insert_own_path" on storage.objects;
create policy "weapon_checks_insert_own_path"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'weapon-checks'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "weapon_checks_select_own_or_admin" on storage.objects;
create policy "weapon_checks_select_own_or_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'weapon-checks'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists "weapon_checks_update_own_or_admin" on storage.objects;
create policy "weapon_checks_update_own_or_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'weapon-checks'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
)
with check (
  bucket_id = 'weapon-checks'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists "weapon_checks_delete_own_or_admin" on storage.objects;
create policy "weapon_checks_delete_own_or_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'weapon-checks'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

