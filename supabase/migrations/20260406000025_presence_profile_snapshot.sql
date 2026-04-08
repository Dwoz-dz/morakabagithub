-- Phase C: presence profile snapshot fields (display_name + avatar_url)
-- Enables online friends UI to show names/avatars without relaxing employees RLS.

alter table public.presence
  add column if not exists display_name text,
  add column if not exists avatar_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'presence_display_name_not_blank'
      and conrelid = 'public.presence'::regclass
  ) then
    alter table public.presence
      add constraint presence_display_name_not_blank
      check (display_name is null or length(trim(display_name)) > 0);
  end if;
end
$$;

update public.presence p
set
  display_name = e.full_name,
  avatar_url = e.avatar_url
from public.employees e
where e.id = p.employee_id
  and (
    p.display_name is distinct from e.full_name
    or p.avatar_url is distinct from e.avatar_url
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
      and coalesce(me.full_name, '') = coalesce(presence.display_name, '')
      and coalesce(me.avatar_url, '') = coalesce(presence.avatar_url, '')
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
      and coalesce(me.full_name, '') = coalesce(presence.display_name, '')
      and coalesce(me.avatar_url, '') = coalesce(presence.avatar_url, '')
  )
);
