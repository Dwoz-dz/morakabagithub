-- Fix employees SELECT RLS deterministically.
-- Problem: legacy environments may keep extra permissive SELECT policies
-- with unknown names, allowing pending users to read employee rows.
--
-- Strategy:
-- 1) Drop all existing SELECT policies on public.employees (any name).
-- 2) Recreate one explicit permissive policy for self/admin.
-- 3) Add restrictive guardrails so legacy permissive policies (if re-added later)
--    cannot bypass self/admin and pending visibility constraints.

begin;

alter table public.employees enable row level security;

do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'employees'
      and cmd = 'SELECT'
  loop
    execute format(
      'drop policy if exists %I on public.employees',
      r.policyname
    );
  end loop;
end;
$$;

-- Base read policy: users read only own row, admins read all rows.
create policy "employees_select_self_or_admin"
on public.employees
for select
to authenticated
using (
  public.is_admin()
  or auth.uid() = auth_user_id
);

-- Restrictive gate 1: enforce self/admin even if extra permissive policies appear.
create policy "employees_select_gate_self_or_admin"
on public.employees
as restrictive
for select
to authenticated
using (
  public.is_admin()
  or auth.uid() = auth_user_id
);

-- Restrictive gate 2: pending rows are hidden from non-admin users.
create policy "employees_select_gate_not_pending_for_non_admin"
on public.employees
as restrictive
for select
to authenticated
using (
  public.is_admin()
  or status <> 'pending'
);

commit;
