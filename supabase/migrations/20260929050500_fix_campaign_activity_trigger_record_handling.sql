-- Fix campaign activity triggers for tables that do not expose campaign_id directly.
-- Use JSONB row access so DELETE/UPDATE events never dereference missing record fields.

create or replace function private.record_campaign_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_row jsonb := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  v_campaign_id uuid;
  v_entity_id uuid;
  v_name text;
  v_summary text;
begin
  if v_uid is null then
    return coalesce(new, old);
  end if;

  v_entity_id := nullif(v_row->>'id','')::uuid;
  v_name := coalesce(
    nullif(v_row->>'name',''),
    nullif(v_row->>'display_name',''),
    nullif(v_row->>'title',''),
    nullif(v_row->>'label',''),
    'Registro'
  );

  if v_row ? 'campaign_id' and nullif(v_row->>'campaign_id','') is not null then
    v_campaign_id := (v_row->>'campaign_id')::uuid;
  end if;

  if TG_TABLE_NAME = 'rooms' then
    select l.campaign_id
      into v_campaign_id
      from public.floors f
      join public.locations l on l.id = f.location_id
     where f.id = nullif(v_row->>'floor_id','')::uuid;
  elsif TG_TABLE_NAME = 'floors' then
    select l.campaign_id
      into v_campaign_id
      from public.locations l
     where l.id = nullif(v_row->>'location_id','')::uuid;
  elsif TG_TABLE_NAME = 'combatants' then
    select ce.campaign_id
      into v_campaign_id
      from public.combat_encounters ce
     where ce.id = nullif(v_row->>'encounter_id','')::uuid;
  elsif TG_TABLE_NAME = 'combat_encounters' then
    v_name := 'Combate';
  end if;

  if v_campaign_id is null then
    return coalesce(new, old);
  end if;

  v_summary := case TG_TABLE_NAME
    when 'characters' then
      case TG_OP
        when 'INSERT' then 'Novo personagem: ' || v_name
        when 'UPDATE' then 'Personagem atualizado: ' || v_name
        else 'Personagem excluído: ' || v_name
      end
    when 'npcs' then
      case TG_OP
        when 'INSERT' then 'Novo NPC/monstro: ' || v_name
        when 'UPDATE' then 'NPC/monstro atualizado: ' || v_name
        else 'NPC/monstro excluído: ' || v_name
      end
    when 'world_entities' then
      case TG_OP
        when 'INSERT' then 'Entidade adicionada à mesa: ' || v_name
        when 'UPDATE' then 'Entidade alterada: ' || v_name
        else 'Entidade removida da mesa: ' || v_name
      end
    when 'rooms' then
      case TG_OP
        when 'INSERT' then 'Cômodo criado: ' || v_name
        when 'UPDATE' then 'Cômodo atualizado: ' || v_name
        else 'Cômodo excluído: ' || v_name
      end
    when 'floors' then
      case TG_OP
        when 'INSERT' then 'Andar criado: ' || v_name
        when 'UPDATE' then 'Andar atualizado: ' || v_name
        else 'Andar excluído: ' || v_name
      end
    when 'locations' then
      case TG_OP
        when 'INSERT' then 'Local criado: ' || v_name
        when 'UPDATE' then 'Local atualizado: ' || v_name
        else 'Local excluído: ' || v_name
      end
    when 'sessions' then
      case TG_OP
        when 'INSERT' then 'Sessão criada: ' || v_name
        when 'UPDATE' then 'Sessão atualizada: ' || v_name
        else 'Sessão excluída: ' || v_name
      end
    when 'dice_rolls' then
      'Rolagem ' ||
      coalesce(nullif(v_row->>'notation',''),'dado') ||
      ' = ' ||
      coalesce(nullif(v_row->>'final_result',''),'?')
    when 'combat_encounters' then
      case TG_OP
        when 'INSERT' then 'Combate iniciado'
        when 'UPDATE' then 'Combate atualizado'
        else 'Combate encerrado'
      end
    when 'combatants' then
      case TG_OP
        when 'INSERT' then 'Combatente adicionado: ' || v_name
        when 'UPDATE' then 'Combatente atualizado: ' || v_name
        else 'Combatente removido: ' || v_name
      end
    else
      TG_OP || ' em ' || TG_TABLE_NAME || ': ' || v_name
  end;

  insert into public.campaign_activity
    (campaign_id, actor_id, action, entity_type, entity_id, summary, metadata)
  values
    (
      v_campaign_id,
      v_uid,
      TG_OP,
      TG_TABLE_NAME,
      v_entity_id,
      v_summary,
      jsonb_build_object('table', TG_TABLE_NAME, 'operation', TG_OP)
    );

  return coalesce(new, old);
end;
$function$;
