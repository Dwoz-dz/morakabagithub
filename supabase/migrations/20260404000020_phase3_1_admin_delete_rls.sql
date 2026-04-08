-- Phase 3.1 hardening:
-- 1) weapon review cleanup actions must remain admin-only at RLS level.
-- 2) weekly rest fairness log management needs admin delete policy.

alter table public.weapon_submissions enable row level security;

drop policy if exists "weapon_submissions_delete_owner_or_admin" on public.weapon_submissions;
drop policy if exists "weapon_submissions_delete_admin_only" on public.weapon_submissions;
create policy "weapon_submissions_delete_admin_only"
on public.weapon_submissions
for delete
to authenticated
using (public.is_admin());

alter table public.weekly_rest_history enable row level security;

drop policy if exists "weekly_rest_history_delete_admin" on public.weekly_rest_history;
create policy "weekly_rest_history_delete_admin"
on public.weekly_rest_history
for delete
to authenticated
using (public.is_admin());
