-- Arabic mojibake source-of-truth repair.
-- Safe to re-run. Does not alter RLS policies or table structure.

begin;

create or replace function public.fix_mojibake_safe(input_text text)
returns text
language plpgsql
immutable
as $$
declare
  current_text text;
  candidate_text text;
  current_arabic_count integer;
  candidate_arabic_count integer;
  current_marker_count integer;
  candidate_marker_count integer;
  marker_chars text := chr(194) || chr(195) || chr(216) || chr(217) || chr(226);
  marker_pattern text := '(' || chr(194) || '|' || chr(195) || '|' || chr(216) || '|' || chr(217) || '|' || chr(226) || ')';
  replacement_char text := chr(65533);
  iteration integer;
begin
  if input_text is null or input_text = '' then
    return input_text;
  end if;

  if input_text !~ marker_pattern then
    return input_text;
  end if;

  current_text := input_text;

  for iteration in 1..4 loop
    begin
      candidate_text := convert_from(convert_to(current_text, 'WIN1252'), 'UTF8');
    exception
      when others then
        return current_text;
    end;

    if candidate_text is null or candidate_text = current_text then
      exit;
    end if;

    if position(replacement_char in candidate_text) > 0 then
      exit;
    end if;

    current_arabic_count := char_length(regexp_replace(current_text, '[^ء-ي]', '', 'g'));
    candidate_arabic_count := char_length(regexp_replace(candidate_text, '[^ء-ي]', '', 'g'));

    current_marker_count := char_length(regexp_replace(current_text, '[^' || marker_chars || ']', '', 'g'));
    candidate_marker_count := char_length(regexp_replace(candidate_text, '[^' || marker_chars || ']', '', 'g'));

    if candidate_arabic_count > current_arabic_count
       or (candidate_marker_count < current_marker_count and candidate_arabic_count >= current_arabic_count) then
      current_text := candidate_text;
    else
      exit;
    end if;
  end loop;

  return current_text;
exception
  when others then
    return input_text;
end;
$$;

create or replace function public.fix_mojibake_jsonb(input_json jsonb)
returns jsonb
language plpgsql
immutable
as $$
begin
  if input_json is null then
    return input_json;
  end if;

  case jsonb_typeof(input_json)
    when 'string' then
      return to_jsonb(public.fix_mojibake_safe(input_json #>> '{}'));
    when 'array' then
      return coalesce(
        (
          select jsonb_agg(public.fix_mojibake_jsonb(value))
          from jsonb_array_elements(input_json)
        ),
        '[]'::jsonb
      );
    when 'object' then
      return coalesce(
        (
          select jsonb_object_agg(key, public.fix_mojibake_jsonb(value))
          from jsonb_each(input_json)
        ),
        '{}'::jsonb
      );
    else
      return input_json;
  end case;
end;
$$;

create or replace function public.apply_mojibake_fix_if_exists(p_table text, p_column text)
returns bigint
language plpgsql
as $$
declare
  marker_pattern text := '(' || chr(194) || '|' || chr(195) || '|' || chr(216) || '|' || chr(217) || '|' || chr(226) || ')';
  updated_count bigint := 0;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = p_column
  ) then
    execute format(
      'update public.%I
       set %I = public.fix_mojibake_safe(%I)
       where %I is not null
         and %I ~ %L',
      p_table,
      p_column,
      p_column,
      p_column,
      p_column,
      marker_pattern
    );
    get diagnostics updated_count = row_count;
  end if;

  return updated_count;
end;
$$;

create or replace function public.apply_mojibake_fix_jsonb_if_exists(p_table text, p_column text)
returns bigint
language plpgsql
as $$
declare
  marker_pattern text := '(' || chr(194) || '|' || chr(195) || '|' || chr(216) || '|' || chr(217) || '|' || chr(226) || ')';
  updated_count bigint := 0;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = p_column
      and data_type in ('json', 'jsonb')
  ) then
    execute format(
      'update public.%I
       set %I = public.fix_mojibake_jsonb(%I)
       where %I is not null
         and (%I)::text ~ %L',
      p_table,
      p_column,
      p_column,
      p_column,
      p_column,
      marker_pattern
    );
    get diagnostics updated_count = row_count;
  end if;

  return updated_count;
end;
$$;

-- Text columns
select public.apply_mojibake_fix_if_exists('factions', 'name');
select public.apply_mojibake_fix_if_exists('employees', 'full_name');
select public.apply_mojibake_fix_if_exists('employees', 'faction');
select public.apply_mojibake_fix_if_exists('registration_requests', 'full_name');
select public.apply_mojibake_fix_if_exists('registration_requests', 'faction');
select public.apply_mojibake_fix_if_exists('notifications', 'title');
select public.apply_mojibake_fix_if_exists('notifications', 'message');
select public.apply_mojibake_fix_if_exists('notifications', 'target_faction');
select public.apply_mojibake_fix_if_exists('vehicles', 'faction');
select public.apply_mojibake_fix_if_exists('vehicles', 'name');
select public.apply_mojibake_fix_if_exists('vehicles', 'plate_number');
select public.apply_mojibake_fix_if_exists('vehicles', 'vehicle_type');
select public.apply_mojibake_fix_if_exists('fuel_entries', 'faction');
select public.apply_mojibake_fix_if_exists('fuel_entries', 'fuel_type');
select public.apply_mojibake_fix_if_exists('fuel_entries', 'signature_name');
select public.apply_mojibake_fix_if_exists('fuel_entries', 'notes');
select public.apply_mojibake_fix_if_exists('weapon_submissions', 'faction');
select public.apply_mojibake_fix_if_exists('weapon_submissions', 'weapon_type');
select public.apply_mojibake_fix_if_exists('weapon_submissions', 'serial_number');
select public.apply_mojibake_fix_if_exists('weapon_submissions', 'signature_name');
select public.apply_mojibake_fix_if_exists('weapon_submissions', 'notes');
select public.apply_mojibake_fix_if_exists('support_tickets', 'subject');
select public.apply_mojibake_fix_if_exists('support_tickets', 'message');
select public.apply_mojibake_fix_if_exists('support_tickets', 'admin_reply');
select public.apply_mojibake_fix_if_exists('weekly_rest_assignments', 'faction');
select public.apply_mojibake_fix_if_exists('weekly_rest_history', 'faction');

-- JSON/JSONB payloads
select public.apply_mojibake_fix_jsonb_if_exists('app_settings', 'value');
select public.apply_mojibake_fix_jsonb_if_exists('activity_logs', 'details');

drop function if exists public.apply_mojibake_fix_if_exists(text, text);
drop function if exists public.apply_mojibake_fix_jsonb_if_exists(text, text);

commit;
