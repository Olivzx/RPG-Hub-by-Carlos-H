-- RPG HUB: account type switching, weapon sheet field, and NPC/monster classification.

alter table public.npcs
  add column if not exists npc_type text;

update public.npcs
set npc_type = case
  when lower(coalesce(data->>'npc_type','')) in ('monster','monstro','creature','criatura') then 'monster'
  else 'npc'
end
where npc_type is null;

alter table public.npcs
  alter column npc_type set default 'npc';

alter table public.npcs
  alter column npc_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'npcs_npc_type_check'
      and conrelid = 'public.npcs'::regclass
  ) then
    alter table public.npcs
      add constraint npcs_npc_type_check
      check (npc_type in ('npc','monster'));
  end if;
end
$$;

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (
  (select auth.uid()) = id
  and account_type in ('master','player')
);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check (
  (select auth.uid()) = id
  and account_type in ('master','player')
);

insert into public.character_field_definitions
  (campaign_id, field_key, label, field_type, data_key, required, sort_order, enabled, player_visible, player_editable, options)
select
  c.id,
  'weapons',
  'Armas',
  'textarea',
  'sheet_data.weapons',
  false,
  168,
  true,
  true,
  true,
  '[]'::jsonb
from public.campaigns c
where not exists (
  select 1
  from public.character_field_definitions f
  where f.campaign_id = c.id
    and f.field_key = 'weapons'
);

update public.character_field_definitions
set
  enabled = true,
  player_visible = true,
  player_editable = true
where field_key = 'weapons';
