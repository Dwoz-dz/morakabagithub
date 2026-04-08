-- Phase B: announcements media storage bucket + policies
-- Allows admin-managed upload/update/delete and approved/admin read access.

insert into storage.buckets (id, name, public)
values ('announcements-media', 'announcements-media', false)
on conflict (id) do nothing;

drop policy if exists "announcements_media_insert_admin_own_path" on storage.objects;
create policy "announcements_media_insert_admin_own_path"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'announcements-media'
  and public.is_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "announcements_media_select_approved_or_admin" on storage.objects;
create policy "announcements_media_select_approved_or_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'announcements-media'
  and (
    public.is_admin()
    or public.is_approved_user()
  )
);

drop policy if exists "announcements_media_update_admin_own_path" on storage.objects;
create policy "announcements_media_update_admin_own_path"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'announcements-media'
  and public.is_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'announcements-media'
  and public.is_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "announcements_media_delete_admin_own_path" on storage.objects;
create policy "announcements_media_delete_admin_own_path"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'announcements-media'
  and public.is_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

