-- Force strict RLS on factions so pending users cannot read internal data.
-- Rebuild all policies on public.factions deterministically.

do $$
declare
  _policy record;
begin
  for _policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'factions'
  loop
    execute format('drop policy if exists %I on public.factions', _policy.policyname);
  end loop;
end;
$$;

alter table public.factions enable row level security;

create policy "factions_select_approved_or_admin"
on public.factions
for select
to authenticated
using (
  public.is_approved_user()
  or public.is_admin()
);

create policy "factions_manage_admin_only"
on public.factions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

