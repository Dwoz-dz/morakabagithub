-- Allow administrators to delete activity logs (single and bulk cleanup).

begin;

alter table public.activity_logs enable row level security;

drop policy if exists "activity_logs_delete_admin" on public.activity_logs;
create policy "activity_logs_delete_admin"
on public.activity_logs
for delete
to authenticated
using (public.is_admin());

commit;
