-- Morakaba operational modules:
-- notifications targeting, vehicles, fuel, weapons, activity logs, support, devices, app settings.

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  faction text not null,
  name text not null,
  plate_number text not null unique,
  vehicle_type text not null,
  is_active boolean not null default true,
  last_odometer numeric(12,2) not null default 0,
  maintenance_due_km numeric(12,2),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fuel_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  faction text not null,
  fuel_type text not null,
  coupon_date date not null,
  quantity_liters numeric(10,2) not null check (quantity_liters > 0),
  distance_km numeric(12,2) not null default 0 check (distance_km >= 0),
  odometer_current numeric(12,2) not null default 0 check (odometer_current >= 0),
  odometer_new numeric(12,2) not null default 0 check (odometer_new >= 0),
  image_path text,
  signature_name text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weapon_submissions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  faction text not null,
  weapon_type text not null,
  serial_number text,
  check_date date not null,
  image_path text,
  signature_name text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_auth_user_id uuid not null references auth.users(id) on delete cascade,
  actor_employee_id uuid references public.employees(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  admin_reply text,
  replied_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.linked_devices (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  device_name text not null,
  platform text not null,
  app_version text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (auth_user_id, device_id)
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.notifications
  add column if not exists title text;

alter table public.notifications
  add column if not exists target_type text not null default 'user';

alter table public.notifications
  add column if not exists target_faction text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_target_type_check'
  ) then
    alter table public.notifications
      add constraint notifications_target_type_check
      check (target_type in ('user', 'faction', 'all'));
  end if;
end;
$$;

create index if not exists idx_vehicles_faction on public.vehicles(faction);
create index if not exists idx_fuel_entries_employee_created on public.fuel_entries(employee_id, created_at desc);
create index if not exists idx_fuel_entries_status_created on public.fuel_entries(status, created_at desc);
create index if not exists idx_weapon_submissions_employee_created on public.weapon_submissions(employee_id, created_at desc);
create index if not exists idx_weapon_submissions_status_created on public.weapon_submissions(status, created_at desc);
create index if not exists idx_activity_logs_created on public.activity_logs(created_at desc);
create index if not exists idx_support_tickets_employee_created on public.support_tickets(employee_id, created_at desc);
create index if not exists idx_linked_devices_user_seen on public.linked_devices(auth_user_id, last_seen_at desc);
create index if not exists idx_notifications_target_type on public.notifications(target_type, target_faction);

drop trigger if exists trg_vehicles_set_updated_at on public.vehicles;
create trigger trg_vehicles_set_updated_at
before update on public.vehicles
for each row execute function public.set_updated_at();

drop trigger if exists trg_fuel_entries_set_updated_at on public.fuel_entries;
create trigger trg_fuel_entries_set_updated_at
before update on public.fuel_entries
for each row execute function public.set_updated_at();

drop trigger if exists trg_weapon_submissions_set_updated_at on public.weapon_submissions;
create trigger trg_weapon_submissions_set_updated_at
before update on public.weapon_submissions
for each row execute function public.set_updated_at();

drop trigger if exists trg_support_tickets_set_updated_at on public.support_tickets;
create trigger trg_support_tickets_set_updated_at
before update on public.support_tickets
for each row execute function public.set_updated_at();

drop trigger if exists trg_app_settings_set_updated_at on public.app_settings;
create trigger trg_app_settings_set_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

alter table public.vehicles enable row level security;
alter table public.fuel_entries enable row level security;
alter table public.weapon_submissions enable row level security;
alter table public.activity_logs enable row level security;
alter table public.support_tickets enable row level security;
alter table public.linked_devices enable row level security;
alter table public.app_settings enable row level security;

-- vehicles
drop policy if exists "vehicles_select_faction_or_admin" on public.vehicles;
create policy "vehicles_select_faction_or_admin"
on public.vehicles
for select
to authenticated
using (
  public.is_admin()
  or (
    public.is_approved_user()
    and exists (
      select 1
      from public.employees e
      where e.auth_user_id = auth.uid()
        and e.status = 'approved'
        and e.faction = vehicles.faction
    )
  )
);

drop policy if exists "vehicles_insert_admin" on public.vehicles;
create policy "vehicles_insert_admin"
on public.vehicles
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "vehicles_update_admin" on public.vehicles;
create policy "vehicles_update_admin"
on public.vehicles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "vehicles_delete_admin" on public.vehicles;
create policy "vehicles_delete_admin"
on public.vehicles
for delete
to authenticated
using (public.is_admin());

-- fuel entries
drop policy if exists "fuel_entries_select_owner_or_admin" on public.fuel_entries;
create policy "fuel_entries_select_owner_or_admin"
on public.fuel_entries
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.employees e
    where e.id = fuel_entries.employee_id
      and e.auth_user_id = auth.uid()
  )
);

drop policy if exists "fuel_entries_insert_approved_owner" on public.fuel_entries;
create policy "fuel_entries_insert_approved_owner"
on public.fuel_entries
for insert
to authenticated
with check (
  public.is_approved_user()
  and exists (
    select 1
    from public.employees e
    where e.id = fuel_entries.employee_id
      and e.auth_user_id = auth.uid()
      and e.status = 'approved'
      and e.faction = fuel_entries.faction
  )
  and exists (
    select 1
    from public.vehicles v
    where v.id = fuel_entries.vehicle_id
      and v.faction = fuel_entries.faction
      and v.is_active = true
  )
);

drop policy if exists "fuel_entries_update_owner_or_admin" on public.fuel_entries;
create policy "fuel_entries_update_owner_or_admin"
on public.fuel_entries
for update
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.employees e
    where e.id = fuel_entries.employee_id
      and e.auth_user_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.employees e
    where e.id = fuel_entries.employee_id
      and e.auth_user_id = auth.uid()
  )
);

drop policy if exists "fuel_entries_delete_owner_or_admin" on public.fuel_entries;
create policy "fuel_entries_delete_owner_or_admin"
on public.fuel_entries
for delete
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.employees e
    where e.id = fuel_entries.employee_id
      and e.auth_user_id = auth.uid()
  )
);

-- weapon submissions
drop policy if exists "weapon_submissions_select_owner_or_admin" on public.weapon_submissions;
create policy "weapon_submissions_select_owner_or_admin"
on public.weapon_submissions
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.employees e
    where e.id = weapon_submissions.employee_id
      and e.auth_user_id = auth.uid()
  )
);

drop policy if exists "weapon_submissions_insert_approved_owner" on public.weapon_submissions;
create policy "weapon_submissions_insert_approved_owner"
on public.weapon_submissions
for insert
to authenticated
with check (
  public.is_approved_user()
  and exists (
    select 1
    from public.employees e
    where e.id = weapon_submissions.employee_id
      and e.auth_user_id = auth.uid()
      and e.status = 'approved'
      and e.faction = weapon_submissions.faction
  )
);

drop policy if exists "weapon_submissions_update_owner_or_admin" on public.weapon_submissions;
create policy "weapon_submissions_update_owner_or_admin"
on public.weapon_submissions
for update
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.employees e
    where e.id = weapon_submissions.employee_id
      and e.auth_user_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.employees e
    where e.id = weapon_submissions.employee_id
      and e.auth_user_id = auth.uid()
  )
);

drop policy if exists "weapon_submissions_delete_owner_or_admin" on public.weapon_submissions;
create policy "weapon_submissions_delete_owner_or_admin"
on public.weapon_submissions
for delete
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.employees e
    where e.id = weapon_submissions.employee_id
      and e.auth_user_id = auth.uid()
  )
);

-- activity logs
drop policy if exists "activity_logs_select_admin" on public.activity_logs;
create policy "activity_logs_select_admin"
on public.activity_logs
for select
to authenticated
using (public.is_admin());

drop policy if exists "activity_logs_insert_approved_actor" on public.activity_logs;
create policy "activity_logs_insert_approved_actor"
on public.activity_logs
for insert
to authenticated
with check (
  public.is_approved_user()
  and actor_auth_user_id = auth.uid()
);

-- support tickets
drop policy if exists "support_tickets_select_owner_or_admin" on public.support_tickets;
create policy "support_tickets_select_owner_or_admin"
on public.support_tickets
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.employees e
    where e.id = support_tickets.employee_id
      and e.auth_user_id = auth.uid()
  )
);

drop policy if exists "support_tickets_insert_owner" on public.support_tickets;
create policy "support_tickets_insert_owner"
on public.support_tickets
for insert
to authenticated
with check (
  public.is_approved_user()
  and exists (
    select 1
    from public.employees e
    where e.id = support_tickets.employee_id
      and e.auth_user_id = auth.uid()
      and e.status = 'approved'
  )
);

drop policy if exists "support_tickets_update_admin" on public.support_tickets;
create policy "support_tickets_update_admin"
on public.support_tickets
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- linked devices
drop policy if exists "linked_devices_select_owner_or_admin" on public.linked_devices;
create policy "linked_devices_select_owner_or_admin"
on public.linked_devices
for select
to authenticated
using (
  auth_user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "linked_devices_insert_owner" on public.linked_devices;
create policy "linked_devices_insert_owner"
on public.linked_devices
for insert
to authenticated
with check (auth_user_id = auth.uid());

drop policy if exists "linked_devices_update_owner_or_admin" on public.linked_devices;
create policy "linked_devices_update_owner_or_admin"
on public.linked_devices
for update
to authenticated
using (
  auth_user_id = auth.uid()
  or public.is_admin()
)
with check (
  auth_user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "linked_devices_delete_owner_or_admin" on public.linked_devices;
create policy "linked_devices_delete_owner_or_admin"
on public.linked_devices
for delete
to authenticated
using (
  auth_user_id = auth.uid()
  or public.is_admin()
);

-- notifications: keep owner/admin visibility and allow owner/admin delete.
drop policy if exists "notifications_select_owner_or_admin" on public.notifications;
create policy "notifications_select_owner_or_admin"
on public.notifications
for select
to authenticated
using (
  target_auth_user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "notifications_insert_admin" on public.notifications;
create policy "notifications_insert_admin"
on public.notifications
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "notifications_update_owner_or_admin" on public.notifications;
create policy "notifications_update_owner_or_admin"
on public.notifications
for update
to authenticated
using (
  target_auth_user_id = auth.uid()
  or public.is_admin()
)
with check (
  target_auth_user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "notifications_delete_owner_or_admin" on public.notifications;
create policy "notifications_delete_owner_or_admin"
on public.notifications
for delete
to authenticated
using (
  target_auth_user_id = auth.uid()
  or public.is_admin()
);

-- app settings
drop policy if exists "app_settings_select_approved_or_admin" on public.app_settings;
create policy "app_settings_select_approved_or_admin"
on public.app_settings
for select
to authenticated
using (public.is_approved_user() or public.is_admin());

drop policy if exists "app_settings_write_admin" on public.app_settings;
create policy "app_settings_write_admin"
on public.app_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into storage.buckets (id, name, public)
values
  ('fuel-bon', 'fuel-bon', false),
  ('profile-avatars', 'profile-avatars', false)
on conflict (id) do nothing;

drop policy if exists "fuel_bon_insert_owner" on storage.objects;
create policy "fuel_bon_insert_owner"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'fuel-bon'
  and (public.is_approved_user() or public.is_admin())
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "fuel_bon_select_owner_or_admin" on storage.objects;
create policy "fuel_bon_select_owner_or_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'fuel-bon'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists "fuel_bon_update_owner_or_admin" on storage.objects;
create policy "fuel_bon_update_owner_or_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'fuel-bon'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
)
with check (
  bucket_id = 'fuel-bon'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists "fuel_bon_delete_owner_or_admin" on storage.objects;
create policy "fuel_bon_delete_owner_or_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'fuel-bon'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists "profile_avatars_insert_owner" on storage.objects;
create policy "profile_avatars_insert_owner"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (public.is_approved_user() or public.is_admin())
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
    (storage.foldername(name))[1] = auth.uid()::text
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
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
)
with check (
  bucket_id = 'profile-avatars'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
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
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);
