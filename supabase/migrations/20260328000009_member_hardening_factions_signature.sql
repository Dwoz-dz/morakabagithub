-- Member dashboard hardening:
-- 1) add weapon signature storage column if missing
-- 2) remove/normalize non-official factions
-- 3) enforce official factions across operational tables

alter table public.weapon_submissions
  add column if not exists signature_path text;

-- Backfill legacy signature markers saved in notes by app fallback mode:
-- [[signature_path:<path>]]
update public.weapon_submissions
set
  signature_path = nullif((regexp_match(notes, '\[\[signature_path:([^[\]]+)\]\]'))[1], ''),
  notes = nullif(
    btrim(regexp_replace(notes, '\s*\[\[signature_path:[^[\]]+\]\]\s*', ' ', 'g')),
    ''
  )
where signature_path is null
  and notes is not null
  and notes ~ '\[\[signature_path:[^[\]]+\]\]';

-- Keep only official factions in lookup table.
delete from public.factions
where name not in (
  'خليل 21',
  'خليل 29',
  'فرقة البحث و الوقاية'
);

insert into public.factions (name)
values
  ('خليل 21'),
  ('خليل 29'),
  ('فرقة البحث و الوقاية')
on conflict (name) do nothing;

-- Normalize registration factions.
update public.registration_requests
set faction = 'فرقة البحث و الوقاية'
where faction not in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية');

-- Normalize employee factions (allow null, but normalize invalid values).
update public.employees
set faction = 'فرقة البحث و الوقاية'
where faction is not null
  and faction not in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية');

-- Normalize vehicle factions.
update public.vehicles
set faction = 'فرقة البحث و الوقاية'
where faction not in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية');

-- Normalize fuel entry factions using vehicle/employee, fallback to official default.
update public.fuel_entries fe
set faction = coalesce(
  (select v.faction
   from public.vehicles v
   where v.id = fe.vehicle_id
     and v.faction in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية')),
  (select e.faction
   from public.employees e
   where e.id = fe.employee_id
     and e.faction in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية')),
  'فرقة البحث و الوقاية'
)
where fe.faction not in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية');

-- Normalize weapon submission factions using employee, fallback to official default.
update public.weapon_submissions ws
set faction = coalesce(
  (select e.faction
   from public.employees e
   where e.id = ws.employee_id
     and e.faction in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية')),
  'فرقة البحث و الوقاية'
)
where ws.faction not in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية');

-- Normalize weekly-rest factions using employee, fallback to official default.
update public.weekly_rest_assignments wa
set faction = coalesce(
  (select e.faction
   from public.employees e
   where e.id = wa.employee_id
     and e.faction in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية')),
  'فرقة البحث و الوقاية'
)
where wa.faction not in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية');

update public.weekly_rest_history wh
set faction = coalesce(
  (select e.faction
   from public.employees e
   where e.id = wh.employee_id
     and e.faction in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية')),
  'فرقة البحث و الوقاية'
)
where wh.faction not in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية');

-- Tighten constraints (idempotent).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'registration_requests_faction_official_check'
  ) then
    alter table public.registration_requests
      add constraint registration_requests_faction_official_check
      check (faction in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'employees_faction_official_check'
  ) then
    alter table public.employees
      add constraint employees_faction_official_check
      check (faction is null or faction in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'vehicles_faction_official_check'
  ) then
    alter table public.vehicles
      add constraint vehicles_faction_official_check
      check (faction in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'fuel_entries_faction_official_check'
  ) then
    alter table public.fuel_entries
      add constraint fuel_entries_faction_official_check
      check (faction in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'weapon_submissions_faction_official_check'
  ) then
    alter table public.weapon_submissions
      add constraint weapon_submissions_faction_official_check
      check (faction in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'weekly_rest_assignments_faction_official_check'
  ) then
    alter table public.weekly_rest_assignments
      add constraint weekly_rest_assignments_faction_official_check
      check (faction in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'weekly_rest_history_faction_official_check'
  ) then
    alter table public.weekly_rest_history
      add constraint weekly_rest_history_faction_official_check
      check (faction in ('خليل 21', 'خليل 29', 'فرقة البحث و الوقاية'));
  end if;
end;
$$;
