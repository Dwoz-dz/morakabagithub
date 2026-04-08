-- Weekly rest core module for Morakaba.
-- Adds:
--   1) weekly_rest_assignments
--   2) weekly_rest_history
--   3) notifications
-- with RLS policies for admin/member access.

create table if not exists public.weekly_rest_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  faction text not null,
  days text[] not null check (cardinality(days) > 0),
  week_start_date date not null,
  week_end_date date not null,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, week_start_date)
);

create table if not exists public.weekly_rest_history (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.weekly_rest_assignments(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  action text not null check (action in ('assigned', 'updated', 'cancelled')),
  faction text not null,
  days text[] not null check (cardinality(days) > 0),
  week_start_date date not null,
  week_end_date date not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  sender_auth_user_id uuid not null references auth.users(id) on delete cascade,
  target_auth_user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  type text not null default 'general',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_weekly_rest_assignments_employee_week
  on public.weekly_rest_assignments(employee_id, week_start_date);

create index if not exists idx_weekly_rest_assignments_faction_week
  on public.weekly_rest_assignments(faction, week_start_date);

create index if not exists idx_weekly_rest_history_employee_created
  on public.weekly_rest_history(employee_id, created_at desc);

create index if not exists idx_notifications_target_created
  on public.notifications(target_auth_user_id, created_at desc);

drop trigger if exists trg_weekly_rest_assignments_set_updated_at on public.weekly_rest_assignments;
create trigger trg_weekly_rest_assignments_set_updated_at
before update on public.weekly_rest_assignments
for each row
execute function public.set_updated_at();

alter table public.weekly_rest_assignments enable row level security;
alter table public.weekly_rest_history enable row level security;
alter table public.notifications enable row level security;

-- weekly_rest_assignments policies
drop policy if exists "weekly_rest_assignments_select_admin_or_owner" on public.weekly_rest_assignments;
create policy "weekly_rest_assignments_select_admin_or_owner"
on public.weekly_rest_assignments
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.employees e
    where e.id = weekly_rest_assignments.employee_id
      and e.auth_user_id = auth.uid()
  )
);

drop policy if exists "weekly_rest_assignments_insert_admin" on public.weekly_rest_assignments;
create policy "weekly_rest_assignments_insert_admin"
on public.weekly_rest_assignments
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "weekly_rest_assignments_update_admin" on public.weekly_rest_assignments;
create policy "weekly_rest_assignments_update_admin"
on public.weekly_rest_assignments
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "weekly_rest_assignments_delete_admin" on public.weekly_rest_assignments;
create policy "weekly_rest_assignments_delete_admin"
on public.weekly_rest_assignments
for delete
to authenticated
using (public.is_admin());

-- weekly_rest_history policies
drop policy if exists "weekly_rest_history_select_admin_or_owner" on public.weekly_rest_history;
create policy "weekly_rest_history_select_admin_or_owner"
on public.weekly_rest_history
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.employees e
    where e.id = weekly_rest_history.employee_id
      and e.auth_user_id = auth.uid()
  )
);

drop policy if exists "weekly_rest_history_insert_admin" on public.weekly_rest_history;
create policy "weekly_rest_history_insert_admin"
on public.weekly_rest_history
for insert
to authenticated
with check (public.is_admin());

-- notifications policies
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
