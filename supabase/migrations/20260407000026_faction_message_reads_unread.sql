-- Phase D: unread tracking per faction chat channel.
-- Adds a compact per-user/per-faction last_read_at ledger with strict RLS.

create table if not exists public.faction_message_reads (
  employee_id uuid not null references public.employees(id) on delete cascade,
  faction text not null,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (employee_id, faction),
  constraint faction_message_reads_faction_not_blank check (length(trim(faction)) > 0)
);

create index if not exists idx_faction_message_reads_employee_updated
  on public.faction_message_reads (employee_id, updated_at desc);

create index if not exists idx_faction_message_reads_faction_updated
  on public.faction_message_reads (faction, updated_at desc);

drop trigger if exists trg_faction_message_reads_set_updated_at on public.faction_message_reads;
create trigger trg_faction_message_reads_set_updated_at
before update on public.faction_message_reads
for each row execute function public.set_updated_at();

alter table public.faction_message_reads enable row level security;

drop policy if exists "faction_message_reads_select_own_or_admin" on public.faction_message_reads;
create policy "faction_message_reads_select_own_or_admin"
on public.faction_message_reads
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.employees me
    where me.auth_user_id = auth.uid()
      and me.id = faction_message_reads.employee_id
  )
);

drop policy if exists "faction_message_reads_insert_own_scoped" on public.faction_message_reads;
create policy "faction_message_reads_insert_own_scoped"
on public.faction_message_reads
for insert
to authenticated
with check (
  exists (
    select 1
    from public.employees me
    where me.auth_user_id = auth.uid()
      and me.status = 'approved'
      and me.id = faction_message_reads.employee_id
      and (
        me.role = 'admin'
        or (me.faction is not null and me.faction = faction_message_reads.faction)
      )
  )
);

drop policy if exists "faction_message_reads_update_own_scoped" on public.faction_message_reads;
create policy "faction_message_reads_update_own_scoped"
on public.faction_message_reads
for update
to authenticated
using (
  exists (
    select 1
    from public.employees me
    where me.auth_user_id = auth.uid()
      and me.status = 'approved'
      and me.id = faction_message_reads.employee_id
      and (
        me.role = 'admin'
        or (me.faction is not null and me.faction = faction_message_reads.faction)
      )
  )
)
with check (
  exists (
    select 1
    from public.employees me
    where me.auth_user_id = auth.uid()
      and me.status = 'approved'
      and me.id = faction_message_reads.employee_id
      and (
        me.role = 'admin'
        or (me.faction is not null and me.faction = faction_message_reads.faction)
      )
  )
);

drop policy if exists "faction_message_reads_delete_admin_only" on public.faction_message_reads;
create policy "faction_message_reads_delete_admin_only"
on public.faction_message_reads
for delete
to authenticated
using (public.is_admin());
