-- Phase 4 extension: APK storage for smart app updates
-- Keeps the newest APK in Supabase Storage and allows approved users to download it.

insert into storage.buckets (id, name, public)
values ('app-updates-apk', 'app-updates-apk', false)
on conflict (id) do nothing;

drop policy if exists "app_updates_apk_insert_admin_own_path" on storage.objects;
create policy "app_updates_apk_insert_admin_own_path"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'app-updates-apk'
  and public.is_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "app_updates_apk_select_approved_or_admin" on storage.objects;
create policy "app_updates_apk_select_approved_or_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'app-updates-apk'
  and (
    public.is_admin()
    or public.is_approved_user()
  )
);

drop policy if exists "app_updates_apk_update_admin_own_path" on storage.objects;
create policy "app_updates_apk_update_admin_own_path"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'app-updates-apk'
  and public.is_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'app-updates-apk'
  and public.is_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "app_updates_apk_delete_admin_own_path" on storage.objects;
create policy "app_updates_apk_delete_admin_own_path"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'app-updates-apk'
  and public.is_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

alter table public.app_updates
  add column if not exists apk_path text;

alter table public.app_updates
  drop constraint if exists app_updates_apk_path_not_blank;

alter table public.app_updates
  add constraint app_updates_apk_path_not_blank
  check (apk_path is null or length(trim(apk_path)) > 0);

