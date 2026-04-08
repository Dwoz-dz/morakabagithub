-- Phase A: Social Ops core schema + strict RLS
-- Adds:
-- - announcements
-- - announcement_reads
-- - presence
-- - faction_messages

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  type text not null default 'info',
  emoji text,
  image_url text,
  target_roles text[] not null default array['all']::text[],
  target_factions text[] not null default array['all']::text[],
  show_in_ticker boolean not null default false,
  show_in_stories boolean not null default false,
  show_in_feed boolean not null default true,
  priority integer not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_title_not_blank check (length(trim(title)) > 0),
  constraint announcements_message_not_blank check (length(trim(message)) > 0),
  constraint announcements_type_valid check (type in ('info', 'urgent', 'telegram', 'reward', 'good_news')),
  constraint announcements_target_roles_valid check (
    cardinality(target_roles) > 0
    and target_roles <@ array['member', 'admin', 'all']::text[]
  ),
  constraint announcements_target_factions_non_empty check (cardinality(target_factions) > 0),
  constraint announcements_display_channel_required check (show_in_ticker or show_in_stories or show_in_feed),
  constraint announcements_schedule_valid check (expires_at is null or starts_at is null or expires_at >= starts_at)
);

create index if not exists idx_announcements_active_window
  on public.announcements (is_active, starts_at, expires_at, priority desc, created_at desc);

create index if not exists idx_announcements_target_roles_gin
  on public.announcements using gin (target_roles);

create index if not exists idx_announcements_target_factions_gin
  on public.announcements using gin (target_factions);

create index if not exists idx_announcements_feed_priority
  on public.announcements (show_in_feed, priority desc, created_at desc);

drop trigger if exists trg_announcements_set_updated_at on public.announcements;
create trigger trg_announcements_set_updated_at
before update on public.announcements
for each row execute function public.set_updated_at();

create table if not exists public.announcement_reads (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  opened_story_at timestamptz,
  read_feed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcement_reads_unique_per_employee unique (announcement_id, employee_id)
);

create index if not exists idx_announcement_reads_employee
  on public.announcement_reads (employee_id, created_at desc);

create index if not exists idx_announcement_reads_announcement
  on public.announcement_reads (announcement_id, created_at desc);

drop trigger if exists trg_announcement_reads_set_updated_at on public.announcement_reads;
create trigger trg_announcement_reads_set_updated_at
before update on public.announcement_reads
for each row execute function public.set_updated_at();

create table if not exists public.presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  employee_id uuid not null unique references public.employees(id) on delete cascade,
  faction text,
  role text not null,
  is_online boolean not null default false,
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint presence_role_valid check (role in ('member', 'admin'))
);

create index if not exists idx_presence_faction_online
  on public.presence (faction, is_online, updated_at desc);

create index if not exists idx_presence_last_seen
  on public.presence (last_seen desc);

drop trigger if exists trg_presence_set_updated_at on public.presence;
create trigger trg_presence_set_updated_at
before update on public.presence
for each row execute function public.set_updated_at();

create table if not exists public.faction_messages (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_employee_id uuid not null references public.employees(id) on delete cascade,
  sender_name text not null,
  faction text not null,
  content text not null,
  message_type text not null default 'text',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint faction_messages_content_not_blank check (length(trim(content)) > 0),
  constraint faction_messages_sender_name_not_blank check (length(trim(sender_name)) > 0),
  constraint faction_messages_message_type_valid check (message_type in ('text'))
);

create index if not exists idx_faction_messages_faction_created
  on public.faction_messages (faction, created_at asc);

create index if not exists idx_faction_messages_sender_created
  on public.faction_messages (sender_employee_id, created_at desc);

drop trigger if exists trg_faction_messages_set_updated_at on public.faction_messages;
create trigger trg_faction_messages_set_updated_at
before update on public.faction_messages
for each row execute function public.set_updated_at();

-- Realtime compatibility for updates
alter table public.presence replica identity full;
alter table public.faction_messages replica identity full;

do $$
begin
  execute 'alter publication supabase_realtime add table public.presence';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.faction_messages';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ==========================================================
-- RLS
-- ==========================================================

alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
alter table public.presence enable row level security;
alter table public.faction_messages enable row level security;

-- announcements
drop policy if exists "announcements_select_targeted_or_admin" on public.announcements;
create policy "announcements_select_targeted_or_admin"
on public.announcements
for select
to authenticated
using (
  public.is_admin()
  or (
    public.is_approved_user()
    and is_active = true
    and (starts_at is null or starts_at <= now())
    and (expires_at is null or expires_at >= now())
    and exists (
      select 1
      from public.employees me
      where me.auth_user_id = auth.uid()
        and me.status = 'approved'
        and (
          announcements.target_roles @> array['all']::text[]
          or me.role = any(announcements.target_roles)
        )
        and (
          announcements.target_factions @> array['all']::text[]
          or (me.faction is not null and me.faction = any(announcements.target_factions))
        )
    )
  )
);

drop policy if exists "announcements_insert_admin" on public.announcements;
create policy "announcements_insert_admin"
on public.announcements
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "announcements_update_admin" on public.announcements;
create policy "announcements_update_admin"
on public.announcements
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "announcements_delete_admin" on public.announcements;
create policy "announcements_delete_admin"
on public.announcements
for delete
to authenticated
using (public.is_admin());

-- announcement_reads
drop policy if exists "announcement_reads_select_own_or_admin" on public.announcement_reads;
create policy "announcement_reads_select_own_or_admin"
on public.announcement_reads
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.employees me
    where me.id = announcement_reads.employee_id
      and me.auth_user_id = auth.uid()
  )
);

drop policy if exists "announcement_reads_insert_own_visible_only" on public.announcement_reads;
create policy "announcement_reads_insert_own_visible_only"
on public.announcement_reads
for insert
to authenticated
with check (
  exists (
    select 1
    from public.employees me
    where me.id = announcement_reads.employee_id
      and me.auth_user_id = auth.uid()
      and me.status = 'approved'
  )
  and exists (
    select 1
    from public.announcements a
    join public.employees me
      on me.auth_user_id = auth.uid()
     and me.status = 'approved'
    where a.id = announcement_reads.announcement_id
      and a.is_active = true
      and (a.starts_at is null or a.starts_at <= now())
      and (a.expires_at is null or a.expires_at >= now())
      and (
        a.target_roles @> array['all']::text[]
        or me.role = any(a.target_roles)
      )
      and (
        a.target_factions @> array['all']::text[]
        or (me.faction is not null and me.faction = any(a.target_factions))
      )
  )
);

drop policy if exists "announcement_reads_update_own_or_admin" on public.announcement_reads;
create policy "announcement_reads_update_own_or_admin"
on public.announcement_reads
for update
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.employees me
    where me.id = announcement_reads.employee_id
      and me.auth_user_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or (
    exists (
      select 1
      from public.employees me
      where me.id = announcement_reads.employee_id
        and me.auth_user_id = auth.uid()
        and me.status = 'approved'
    )
    and exists (
      select 1
      from public.announcements a
      join public.employees me
        on me.auth_user_id = auth.uid()
       and me.status = 'approved'
      where a.id = announcement_reads.announcement_id
        and a.is_active = true
        and (a.starts_at is null or a.starts_at <= now())
        and (a.expires_at is null or a.expires_at >= now())
        and (
          a.target_roles @> array['all']::text[]
          or me.role = any(a.target_roles)
        )
        and (
          a.target_factions @> array['all']::text[]
          or (me.faction is not null and me.faction = any(a.target_factions))
        )
    )
  )
);

drop policy if exists "announcement_reads_delete_admin" on public.announcement_reads;
create policy "announcement_reads_delete_admin"
on public.announcement_reads
for delete
to authenticated
using (public.is_admin());

-- presence
drop policy if exists "presence_select_visible_scope" on public.presence;
create policy "presence_select_visible_scope"
on public.presence
for select
to authenticated
using (
  public.is_admin()
  or (
    public.is_approved_user()
    and exists (
      select 1
      from public.employees me
      where me.auth_user_id = auth.uid()
        and me.status = 'approved'
        and me.faction is not null
        and me.faction = presence.faction
    )
  )
);

drop policy if exists "presence_insert_own_only" on public.presence;
create policy "presence_insert_own_only"
on public.presence
for insert
to authenticated
with check (
  exists (
    select 1
    from public.employees me
    where me.auth_user_id = auth.uid()
      and me.status = 'approved'
      and me.id = presence.employee_id
      and me.auth_user_id = presence.user_id
      and me.role = presence.role
      and coalesce(me.faction, '') = coalesce(presence.faction, '')
  )
);

drop policy if exists "presence_update_own_only" on public.presence;
create policy "presence_update_own_only"
on public.presence
for update
to authenticated
using (
  exists (
    select 1
    from public.employees me
    where me.auth_user_id = auth.uid()
      and me.status = 'approved'
      and me.id = presence.employee_id
      and me.auth_user_id = presence.user_id
  )
)
with check (
  exists (
    select 1
    from public.employees me
    where me.auth_user_id = auth.uid()
      and me.status = 'approved'
      and me.id = presence.employee_id
      and me.auth_user_id = presence.user_id
      and me.role = presence.role
      and coalesce(me.faction, '') = coalesce(presence.faction, '')
  )
);

drop policy if exists "presence_delete_own_or_admin" on public.presence;
create policy "presence_delete_own_or_admin"
on public.presence
for delete
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.employees me
    where me.auth_user_id = auth.uid()
      and me.id = presence.employee_id
      and me.auth_user_id = presence.user_id
  )
);

-- faction_messages
drop policy if exists "faction_messages_select_scope_or_admin" on public.faction_messages;
create policy "faction_messages_select_scope_or_admin"
on public.faction_messages
for select
to authenticated
using (
  public.is_admin()
  or (
    public.is_approved_user()
    and deleted_at is null
    and exists (
      select 1
      from public.employees me
      where me.auth_user_id = auth.uid()
        and me.status = 'approved'
        and me.faction is not null
        and me.faction = faction_messages.faction
    )
  )
);

drop policy if exists "faction_messages_insert_strict_sender_scope" on public.faction_messages;
create policy "faction_messages_insert_strict_sender_scope"
on public.faction_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.employees me
    where me.auth_user_id = auth.uid()
      and me.status = 'approved'
      and me.id = faction_messages.sender_employee_id
      and me.auth_user_id = faction_messages.sender_user_id
      and me.full_name = faction_messages.sender_name
      and (
        me.role = 'admin'
        or (me.role = 'member' and me.faction is not null and me.faction = faction_messages.faction)
      )
  )
);

drop policy if exists "faction_messages_update_admin_only" on public.faction_messages;
create policy "faction_messages_update_admin_only"
on public.faction_messages
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "faction_messages_delete_admin_only" on public.faction_messages;
create policy "faction_messages_delete_admin_only"
on public.faction_messages
for delete
to authenticated
using (public.is_admin());
