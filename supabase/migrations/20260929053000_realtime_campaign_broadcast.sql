-- RPG HUB: realtime broadcast for committed campaign changes.
-- Uses Supabase Realtime Broadcast from Database so connected players receive
-- committed campaign changes without manual page refreshes.

create or replace function private.rpg_broadcast_campaign_change()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  v_campaign_id uuid;
  v_row jsonb := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  v_table text := TG_TABLE_NAME;
begin
  if v_row ? 'campaign_id' and nullif(v_row->>'campaign_id','') is not null then
    v_campaign_id := (v_row->>'campaign_id')::uuid;
  end if;

  if v_table = 'rooms' then
    select l.campaign_id into v_campaign_id
    from public.floors f
    join public.locations l on l.id = f.location_id
    where f.id = nullif(v_row->>'floor_id','')::uuid;
  elsif v_table = 'floors' then
    select l.campaign_id into v_campaign_id
    from public.locations l
    where l.id = nullif(v_row->>'location_id','')::uuid;
  elsif v_table = 'map_settings' then
    select l.campaign_id into v_campaign_id
    from public.floors f
    join public.locations l on l.id = f.location_id
    where f.id = nullif(v_row->>'floor_id','')::uuid;
  elsif v_table = 'combatants' then
    select ce.campaign_id into v_campaign_id
    from public.combat_encounters ce
    where ce.id = nullif(v_row->>'encounter_id','')::uuid;
  elsif v_table = 'audio_playlist_items' then
    select ap.campaign_id into v_campaign_id
    from public.audio_playlists ap
    where ap.id = nullif(v_row->>'playlist_id','')::uuid;
  end if;

  if v_campaign_id is null then
    return coalesce(NEW, OLD);
  end if;

  begin
    perform realtime.broadcast_changes(
      'rpg-hub-campaign-' || v_campaign_id::text,
      TG_OP,
      TG_OP,
      v_table,
      TG_TABLE_SCHEMA,
      case when TG_OP <> 'DELETE' then NEW else null end,
      case when TG_OP <> 'INSERT' then OLD else null end
    );
  exception when others then
    raise warning 'RPG HUB realtime broadcast failed for %.% (%): %', TG_TABLE_SCHEMA, v_table, TG_OP, SQLERRM;
  end;

  return coalesce(NEW, OLD);
end;
$$;

do $$
declare
  t text;
  targets text[] := array[
    'campaign_members',
    'locations',
    'floors',
    'rooms',
    'characters',
    'character_field_definitions',
    'npcs',
    'world_entities',
    'sessions',
    'dice_rolls',
    'audio_assets',
    'audio_playlists',
    'audio_playlist_items',
    'campaign_audio_state',
    'campaign_chronicles',
    'campaign_activity',
    'map_settings',
    'map_walls',
    'fog_regions',
    'aoe_effects',
    'vision_sources',
    'combat_encounters',
    'combatants'
  ];
begin
  foreach t in array targets loop
    execute format('drop trigger if exists rpg_campaign_realtime_broadcast on public.%I', t);
    execute format(
      'create trigger rpg_campaign_realtime_broadcast after insert or update or delete on public.%I for each row execute function private.rpg_broadcast_campaign_change()',
      t
    );
  end loop;
end
$$;
