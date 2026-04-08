-- Harden access for pending users:
-- registration is allowed, but internal system access requires approved account.

create or replace function public.is_approved_user()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _is_approved boolean;
begin
  select exists (
    select 1
    from public.employees e
    where e.auth_user_id = auth.uid()
      and e.status = 'approved'
  )
  into _is_approved;

  return coalesce(_is_approved, false);
end;
$$;

revoke all on function public.is_approved_user() from public;
grant execute on function public.is_approved_user() to authenticated;

-- Only approved users (or admins) can read factions.
drop policy if exists "factions_select_authenticated" on public.factions;
drop policy if exists "factions_select_approved_or_admin" on public.factions;
create policy "factions_select_approved_or_admin"
on public.factions
for select
to authenticated
using (
  public.is_approved_user()
  or public.is_admin()
);

-- Storage access also requires approved/admin, not just authenticated.
drop policy if exists "weapon_checks_insert_own_path" on storage.objects;
drop policy if exists "weapon_checks_insert_approved_own_path" on storage.objects;
create policy "weapon_checks_insert_approved_own_path"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'weapon-checks'
  and (
    public.is_approved_user()
    or public.is_admin()
  )
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "weapon_checks_select_own_or_admin" on storage.objects;
drop policy if exists "weapon_checks_select_approved_own_or_admin" on storage.objects;
create policy "weapon_checks_select_approved_own_or_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'weapon-checks'
  and (
    (
      public.is_approved_user()
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    or public.is_admin()
  )
);

drop policy if exists "weapon_checks_update_own_or_admin" on storage.objects;
drop policy if exists "weapon_checks_update_approved_own_or_admin" on storage.objects;
create policy "weapon_checks_update_approved_own_or_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'weapon-checks'
  and (
    (
      public.is_approved_user()
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    or public.is_admin()
  )
)
with check (
  bucket_id = 'weapon-checks'
  and (
    (
      public.is_approved_user()
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    or public.is_admin()
  )
);

drop policy if exists "weapon_checks_delete_own_or_admin" on storage.objects;
drop policy if exists "weapon_checks_delete_approved_own_or_admin" on storage.objects;
create policy "weapon_checks_delete_approved_own_or_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'weapon-checks'
  and (
    (
      public.is_approved_user()
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    or public.is_admin()
  )
);
