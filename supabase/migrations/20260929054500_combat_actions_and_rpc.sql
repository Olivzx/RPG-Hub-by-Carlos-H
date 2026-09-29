create table if not exists public.combat_actions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
  attacker_combatant_id uuid references public.combatants(id) on delete set null,
  target_combatant_id uuid references public.combatants(id) on delete set null,
  attacker_name text not null,
  target_name text not null,
  action_name text not null default 'Ataque',
  attack_notation text,
  attack_roll integer,
  attack_modifier integer not null default 0,
  target_defense integer,
  hit_chance numeric(5,2),
  hit boolean not null default false,
  critical boolean not null default false,
  damage_notation text,
  damage_roll integer,
  damage_bonus integer not null default 0,
  damage_total integer not null default 0,
  hp_before integer,
  hp_after integer,
  hp_lost_percent numeric(6,2) not null default 0,
  effect_percent numeric(6,2) not null default 0,
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.combat_actions enable row level security;
alter table public.combat_actions replica identity full;
create index if not exists combat_actions_encounter_created_idx on public.combat_actions(encounter_id,created_at desc);
create index if not exists combat_actions_campaign_created_idx on public.combat_actions(campaign_id,created_at desc);

create policy combat_actions_select_member on public.combat_actions for select using (exists (select 1 from public.campaigns c where c.id=combat_actions.campaign_id and (c.owner_id=auth.uid() or exists (select 1 from public.campaign_members cm where cm.campaign_id=c.id and cm.user_id=auth.uid()))));
create policy combat_actions_insert_owner on public.combat_actions for insert with check (created_by=auth.uid() and exists (select 1 from public.campaigns c where c.id=combat_actions.campaign_id and c.owner_id=auth.uid()));
create policy combat_actions_delete_owner on public.combat_actions for delete using (exists (select 1 from public.campaigns c where c.id=combat_actions.campaign_id and c.owner_id=auth.uid()));

create or replace function public.resolve_combat_attack(p_encounter_id uuid,p_attacker_id uuid,p_target_id uuid,p_action_name text,p_attack_notation text,p_attack_roll integer,p_attack_modifier integer,p_target_defense integer,p_hit_chance numeric,p_hit boolean,p_critical boolean,p_damage_notation text,p_damage_roll integer,p_damage_bonus integer,p_damage_total integer,p_notes text default null)
returns public.combat_actions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_attacker public.combatants%rowtype;
  v_target public.combatants%rowtype;
  v_damage integer;
  v_hp_before integer;
  v_hp_after integer;
  v_max integer;
  v_lost numeric(6,2);
  v_effect numeric(6,2);
  v_action public.combat_actions%rowtype;
begin
  select ce.campaign_id into v_campaign_id
  from public.combat_encounters ce join public.campaigns c on c.id=ce.campaign_id
  where ce.id=p_encounter_id and c.owner_id=(select auth.uid());
  if v_campaign_id is null then raise exception 'Apenas o mestre da campanha pode resolver ataques.'; end if;
  select * into v_attacker from public.combatants where id=p_attacker_id and encounter_id=p_encounter_id;
  if not found then raise exception 'Atacante inválido.'; end if;
  select * into v_target from public.combatants where id=p_target_id and encounter_id=p_encounter_id for update;
  if not found then raise exception 'Alvo inválido.'; end if;
  v_damage:=greatest(0,least(100000,coalesce(p_damage_total,0)));
  v_hp_before:=coalesce(v_target.hp_current,0);
  v_max:=coalesce(v_target.hp_max,v_hp_before);
  v_hp_after:=case when p_hit then greatest(0,v_hp_before-v_damage) else v_hp_before end;
  v_lost:=case when v_hp_before>0 then round((v_hp_before-v_hp_after)::numeric/v_hp_before::numeric*100,2) else 0 end;
  v_effect:=case when v_max>0 then round((v_hp_before-v_hp_after)::numeric/v_max::numeric*100,2) else 0 end;
  if p_hit then update public.combatants set hp_current=v_hp_after,updated_at=now() where id=p_target_id; end if;
  insert into public.combat_actions(campaign_id,encounter_id,attacker_combatant_id,target_combatant_id,attacker_name,target_name,action_name,attack_notation,attack_roll,attack_modifier,target_defense,hit_chance,hit,critical,damage_notation,damage_roll,damage_bonus,damage_total,hp_before,hp_after,hp_lost_percent,effect_percent,notes,created_by)
  values(v_campaign_id,p_encounter_id,p_attacker_id,p_target_id,v_attacker.name,v_target.name,coalesce(nullif(trim(p_action_name),''),'Ataque'),p_attack_notation,p_attack_roll,coalesce(p_attack_modifier,0),p_target_defense,p_hit_chance,p_hit,p_critical,p_damage_notation,p_damage_roll,coalesce(p_damage_bonus,0),v_damage,v_hp_before,v_hp_after,v_lost,v_effect,p_notes,(select auth.uid()))
  returning * into v_action;
  return v_action;
end;
$$;

revoke execute on function public.resolve_combat_attack(uuid,uuid,uuid,text,text,integer,integer,integer,numeric,boolean,boolean,text,integer,integer,integer,text) from public,anon;
grant execute on function public.resolve_combat_attack(uuid,uuid,uuid,text,text,integer,integer,integer,numeric,boolean,boolean,text) to authenticated;

drop trigger if exists rpg_campaign_realtime_broadcast on public.combat_actions;
create trigger rpg_campaign_realtime_broadcast after insert or update or delete on public.combat_actions for each row execute function private.rpg_broadcast_campaign_change();
