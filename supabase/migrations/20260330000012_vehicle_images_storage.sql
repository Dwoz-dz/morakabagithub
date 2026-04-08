-- Vehicle image support for member fuel selector circles.
-- 1) add vehicles.image_path
-- 2) create vehicle-images bucket
-- 3) policies: admin upload/manage, approved+admin read

alter table public.vehicles
  add column if not exists image_path text;

insert into storage.buckets (id, name, public)
values ('vehicle-images', 'vehicle-images', false)
on conflict (id) do nothing;

drop policy if exists "vehicle_images_insert_admin_own_path" on storage.objects;
create policy "vehicle_images_insert_admin_own_path"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'vehicle-images'
  and public.is_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "vehicle_images_select_approved_or_admin" on storage.objects;
create policy "vehicle_images_select_approved_or_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'vehicle-images'
  and (
    public.is_admin()
    or public.is_approved_user()
  )
);

drop policy if exists "vehicle_images_update_admin_own_path" on storage.objects;
create policy "vehicle_images_update_admin_own_path"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'vehicle-images'
  and public.is_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'vehicle-images'
  and public.is_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "vehicle_images_delete_admin_own_path" on storage.objects;
create policy "vehicle_images_delete_admin_own_path"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'vehicle-images'
  and public.is_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);
