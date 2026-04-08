-- Phase 4: Premium smart app updates (history + role targeting + mandatory/optional flags)

create table if not exists public.app_updates (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  minimum_required_version text not null,
  title text not null,
  release_notes jsonb not null default '[]'::jsonb,
  is_mandatory boolean not null default false,
  target_roles text[] not null default array['all']::text[],
  android_url text,
  ios_url text,
  is_active boolean not null default false,
  force_logout_after_update boolean not null default false,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_updates_version_not_blank check (length(trim(version)) > 0),
  constraint app_updates_min_version_not_blank check (length(trim(minimum_required_version)) > 0),
  constraint app_updates_release_notes_array check (jsonb_typeof(release_notes) = 'array'),
  constraint app_updates_target_roles_valid check (
    cardinality(target_roles) > 0
    and target_roles <@ array['member', 'admin', 'all']::text[]
  )
);

create index if not exists idx_app_updates_active_published
  on public.app_updates (is_active, published_at desc nulls last, created_at desc);

create index if not exists idx_app_updates_target_roles_gin
  on public.app_updates using gin (target_roles);

drop trigger if exists trg_app_updates_set_updated_at on public.app_updates;
create trigger trg_app_updates_set_updated_at
before update on public.app_updates
for each row execute function public.set_updated_at();

alter table public.app_updates enable row level security;

drop policy if exists "app_updates_select_targeted_or_admin" on public.app_updates;
create policy "app_updates_select_targeted_or_admin"
on public.app_updates
for select
to authenticated
using (
  public.is_admin()
  or (
    public.is_approved_user()
    and is_active = true
    and (
      target_roles @> array['all']::text[]
      or exists (
        select 1
        from public.employees e
        where e.auth_user_id = auth.uid()
          and e.status = 'approved'
          and e.role = any(app_updates.target_roles)
      )
    )
  )
);

drop policy if exists "app_updates_insert_admin" on public.app_updates;
create policy "app_updates_insert_admin"
on public.app_updates
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "app_updates_update_admin" on public.app_updates;
create policy "app_updates_update_admin"
on public.app_updates
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "app_updates_delete_admin" on public.app_updates;
create policy "app_updates_delete_admin"
on public.app_updates
for delete
to authenticated
using (public.is_admin());
