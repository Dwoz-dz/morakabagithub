-- Tighten employees visibility:
-- Pending users must not read from public.employees.
-- Admin keeps full visibility, and non-pending users can still read own row.

begin;

alter table public.employees enable row level security;

drop policy if exists "employees_select_self_or_admin" on public.employees;

create policy "employees_select_self_or_admin"
on public.employees
for select
to authenticated
using (
  public.is_admin()
  or (
    auth.uid() = auth_user_id
    and status <> 'pending'
  )
);

commit;
