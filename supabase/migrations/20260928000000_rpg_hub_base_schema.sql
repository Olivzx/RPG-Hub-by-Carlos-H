-- RPG HUB — base schema, membership authorization and private campaign data
-- This migration is intentionally applied before the existing incremental migrations.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Aventureiro',
  account_type text not null default 'player' check (account_type in ('master','player')),
  avatar_url text,
  bio text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  system_name text not null default 'Sistema próprio',
  cover_url text,
  discord_url text,
  discord_guild_id text,
  timezone text not null default 'America/Maceio',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'player' check (role in ('owner','player')),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (campaign_id,user_id)
);

create table if not exists public.campaign_invites (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  invite_code text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  location_type text not null default 'Local',
  description text not null default '',
  image_url text,
  created_by uuid references auth.users(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.location_private_notes (
  location_id uuid primary key references public.locations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  notes text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.floors (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null,
  floor_number integer not null default 0,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.floor_private_notes (
  floor_id uuid primary key references public.floors(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  notes text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null references public.floors(id) on delete cascade,
  name text not null,
  description text not null default '',
  image_url text,
  x numeric not null default 20,
  y numeric not null default 20,
  width numeric not null default 30,
  height numeric not null default 25,
  rotation numeric not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (width > 0 and height > 0)
);

create table if not exists public.room_private_notes (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  notes text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  player_id uuid references auth.users(id) on delete set null,
  name text not null,
  class_name text not null default '',
  ancestry_name text not null default '',
  level integer not null default 1,
  hp_current numeric,
  hp_max numeric,
  armor_class numeric,
  luck numeric not null default 0,
  luck_points numeric not null default 0,
  attributes jsonb not null default '{}'::jsonb,
  sheet_data jsonb not null default '{}'::jsonb,
  notes text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.character_field_definitions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  field_key text not null,
  label text not null,
  field_type text not null default 'text',
  data_key text not null,
  options jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  player_visible boolean not null default true,
  player_editable boolean not null default true,
  required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (campaign_id,field_key)
);

create table if not exists public.character_private_data (
  character_id uuid primary key references public.characters(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.npcs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  description text not null default '',
  avatar_url text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.npc_private_notes (
  npc_id uuid primary key references public.npcs(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  notes text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.world_entities (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  floor_id uuid references public.floors(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  character_id uuid references public.characters(id) on delete set null,
  npc_id uuid references public.npcs(id) on delete set null,
  entity_kind text not null default 'npc',
  display_name text not null,
  icon text,
  color text,
  x numeric not null default 50,
  y numeric not null default 50,
  visible boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  session_number integer not null default 1,
  title text not null,
  summary text not null default '',
  history text not null default '',
  starts_at timestamptz,
  status text not null default 'planned' check (status in ('planned','live','finished','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  active_floor_id uuid references public.floors(id) on delete set null,
  active_room_id uuid references public.rooms(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dice_rolls (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  roller_user_id uuid not null references auth.users(id) on delete cascade,
  roller_display_name text not null default 'Jogador',
  character_id uuid references public.characters(id) on delete set null,
  notation text not null,
  base_results jsonb not null default '[]'::jsonb,
  rule_results jsonb not null default '{}'::jsonb,
  final_result numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.audio_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  kind text not null default 'other',
  url text not null,
  loop boolean not null default false,
  default_volume numeric not null default 0.75 check (default_volume between 0 and 1),
  created_by uuid references auth.users(id) on delete set null,
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audio_playlists (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audio_playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.audio_playlists(id) on delete cascade,
  audio_asset_id uuid not null references public.audio_assets(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (playlist_id,audio_asset_id)
);

create table if not exists public.campaign_audio_state (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  layers jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_chronicles (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  content text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_activity (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_chat_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  message_type text not null default 'chat',
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_rulesets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  system text not null default 'generic',
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.character_inventory (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  name text not null,
  quantity integer not null default 1 check (quantity >= 0),
  weight numeric not null default 0 check (weight >= 0),
  slot text not null default '',
  equipped boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  description text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.character_abilities (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  name text not null,
  category text not null default 'ability',
  action_type text not null default 'action',
  cost text not null default '',
  damage_formula text not null default '',
  damage_type text not null default 'physical',
  save_ability text not null default '',
  save_dc numeric not null default 0,
  uses_max integer not null default 0 check (uses_max >= 0),
  uses_remaining integer not null default 0 check (uses_remaining >= 0),
  description text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.character_history (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  character_name text not null,
  event_type text not null,
  hp_before numeric,
  hp_after numeric,
  message text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.combat_encounters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  status text not null default 'active',
  round integer not null default 1,
  current_index integer not null default 0,
  started_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.combatants (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  npc_id uuid references public.npcs(id) on delete set null,
  name text not null,
  kind text not null default 'enemy',
  initiative numeric not null default 0,
  hp_current numeric,
  hp_max numeric,
  conditions text not null default '',
  turn_order integer not null default 0,
  movement_remaining numeric not null default 0,
  actions_available integer not null default 1,
  reactions_available integer not null default 1,
  rules_state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.fog_exploration_cells (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  floor_id uuid not null references public.floors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cell_x integer not null,
  cell_y integer not null,
  last_seen_at timestamptz not null default now(),
  unique (campaign_id,floor_id,user_id,cell_x,cell_y)
);

create index if not exists campaign_members_user_campaign_idx on public.campaign_members(user_id,campaign_id);
create index if not exists locations_campaign_sort_idx on public.locations(campaign_id,sort_order);
create index if not exists floors_location_sort_idx on public.floors(location_id,sort_order);
create index if not exists rooms_floor_sort_idx on public.rooms(floor_id,sort_order);
create index if not exists characters_campaign_player_idx on public.characters(campaign_id,player_id);
create index if not exists character_fields_campaign_sort_idx on public.character_field_definitions(campaign_id,sort_order);
create index if not exists npcs_campaign_name_idx on public.npcs(campaign_id,name);
create index if not exists world_entities_campaign_created_idx on public.world_entities(campaign_id,created_at);
create index if not exists sessions_campaign_number_idx on public.sessions(campaign_id,session_number desc);
create index if not exists dice_rolls_campaign_created_idx on public.dice_rolls(campaign_id,created_at desc);
create index if not exists campaign_activity_campaign_created_idx on public.campaign_activity(campaign_id,created_at desc);
create index if not exists campaign_chat_campaign_created_idx on public.campaign_chat_messages(campaign_id,created_at);
create index if not exists audio_assets_campaign_created_idx on public.audio_assets(campaign_id,created_at);
create index if not exists audio_playlists_campaign_created_idx on public.audio_playlists(campaign_id,created_at);
create index if not exists inventory_character_created_idx on public.character_inventory(character_id,created_at);
create index if not exists abilities_character_created_idx on public.character_abilities(character_id,created_at);
create index if not exists combat_encounters_campaign_session_idx on public.combat_encounters(campaign_id,session_id,created_at desc);
create index if not exists combatants_encounter_order_idx on public.combatants(encounter_id,turn_order);
create index if not exists fog_cells_campaign_floor_user_idx on public.fog_exploration_cells(campaign_id,floor_id,user_id);

create or replace function private.is_campaign_owner(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id and c.owner_id = (select auth.uid())
  );
$$;

create or replace function private.is_campaign_member(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id and c.owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = p_campaign_id and cm.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_location_member(p_location_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.locations l
    where l.id=p_location_id and private.is_campaign_member(l.campaign_id)
  );
$$;

create or replace function private.is_location_owner(p_location_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.locations l
    where l.id=p_location_id and private.is_campaign_owner(l.campaign_id)
  );
$$;

create or replace function private.is_floor_member(p_floor_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.floors f
    join public.locations l on l.id=f.location_id
    where f.id=p_floor_id and private.is_campaign_member(l.campaign_id)
  );
$$;

create or replace function private.is_floor_owner(p_floor_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.floors f
    join public.locations l on l.id=f.location_id
    where f.id=p_floor_id and private.is_campaign_owner(l.campaign_id)
  );
$$;

create or replace function private.is_room_member(p_room_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.rooms r
    join public.floors f on f.id=r.floor_id
    join public.locations l on l.id=f.location_id
    where r.id=p_room_id and private.is_campaign_member(l.campaign_id)
  );
$$;

create or replace function private.is_room_owner(p_room_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.rooms r
    join public.floors f on f.id=r.floor_id
    join public.locations l on l.id=f.location_id
    where r.id=p_room_id and private.is_campaign_owner(l.campaign_id)
  );
$$;

create or replace function private.can_edit_character(p_character_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.characters ch
    where ch.id=p_character_id
      and (private.is_campaign_owner(ch.campaign_id) or ch.player_id=(select auth.uid()))
  );
$$;

create or replace function private.can_edit_world_entity(p_entity_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.world_entities we
    where we.id=p_entity_id and (
      private.is_campaign_owner(we.campaign_id)
      or exists (
        select 1 from public.characters ch
        where ch.id=we.character_id and ch.player_id=(select auth.uid())
      )
    )
  );
$$;

create or replace function private.can_read_profile(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_profile_id=(select auth.uid()) or exists (
    select 1 from public.campaign_members mine
    join public.campaign_members other on other.campaign_id=mine.campaign_id
    where mine.user_id=(select auth.uid()) and other.user_id=p_profile_id
  ) or exists (
    select 1 from public.campaigns c
    where c.owner_id=(select auth.uid())
      and exists (select 1 from public.campaign_members cm where cm.campaign_id=c.id and cm.user_id=p_profile_id)
  ) or exists (
    select 1 from public.campaigns c
    where c.owner_id=p_profile_id
      and exists (select 1 from public.campaign_members cm where cm.campaign_id=c.id and cm.user_id=(select auth.uid()))
  );
$$;

create or replace function private.realtime_campaign_from_topic(p_topic text)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  prefix text;
  suffix text;
  prefixes text[] := array[
    'rpg-hub-campaign',
    'rpg-hub-presence-v2',
    'rpg-hub-combat-actions',
    'rpg-hub-combat',
    'rpg-hub-world-realtime',
    'rpg-hub-audit',
    'rpg-hub-dice',
    'rpg-hub-vtt-engine',
    'rpg-hub-real-vision',
    'rpg-hub-loadout'
  ];
begin
  foreach prefix in array prefixes loop
    if left(p_topic,char_length(prefix)+1)=prefix||'-' then
      suffix := substring(p_topic from char_length(prefix)+2);
      if suffix ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        return suffix::uuid;
      end if;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function private.can_access_realtime_topic(p_topic text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_session_id uuid;
begin
  v_campaign_id := private.realtime_campaign_from_topic(p_topic);
  if v_campaign_id is not null then
    return private.is_campaign_member(v_campaign_id);
  end if;

  if left(p_topic,16)='rpg-hub-session-' then
    v_session_id := substring(p_topic from 17)::uuid;
    select s.campaign_id into v_campaign_id
    from public.sessions s where s.id=v_session_id;
    return v_campaign_id is not null and private.is_campaign_member(v_campaign_id);
  end if;

  return false;
exception when invalid_text_representation then
  return false;
end;
$$;

alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.campaign_invites enable row level security;
alter table public.locations enable row level security;
alter table public.location_private_notes enable row level security;
alter table public.floors enable row level security;
alter table public.floor_private_notes enable row level security;
alter table public.rooms enable row level security;
alter table public.room_private_notes enable row level security;
alter table public.characters enable row level security;
alter table public.character_field_definitions enable row level security;
alter table public.character_private_data enable row level security;
alter table public.npcs enable row level security;
alter table public.npc_private_notes enable row level security;
alter table public.world_entities enable row level security;
alter table public.sessions enable row level security;
alter table public.dice_rolls enable row level security;
alter table public.audio_assets enable row level security;
alter table public.audio_playlists enable row level security;
alter table public.audio_playlist_items enable row level security;
alter table public.campaign_audio_state enable row level security;
alter table public.campaign_chronicles enable row level security;
alter table public.campaign_activity enable row level security;
alter table public.campaign_chat_messages enable row level security;
alter table public.campaign_rulesets enable row level security;
alter table public.character_inventory enable row level security;
alter table public.character_abilities enable row level security;
alter table public.character_history enable row level security;
alter table public.combat_encounters enable row level security;
alter table public.combatants enable row level security;
alter table public.fog_exploration_cells enable row level security;

create policy profiles_select_related on public.profiles for select to authenticated
using (private.can_read_profile(id));
create policy profiles_insert_self on public.profiles for insert to authenticated
with check (id=(select auth.uid()) and account_type in ('master','player'));
create policy profiles_update_self on public.profiles for update to authenticated
using (id=(select auth.uid()))
with check (id=(select auth.uid()) and account_type in ('master','player'));

create policy campaigns_select_member on public.campaigns for select to authenticated
using (private.is_campaign_member(id));
create policy campaigns_insert_owner on public.campaigns for insert to authenticated
with check (owner_id=(select auth.uid()));
create policy campaigns_update_owner on public.campaigns for update to authenticated
using (private.is_campaign_owner(id))
with check (private.is_campaign_owner(id) and owner_id=(select auth.uid()));
create policy campaigns_delete_owner on public.campaigns for delete to authenticated
using (private.is_campaign_owner(id));

create policy campaign_members_select_member on public.campaign_members for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy campaign_members_insert_owner_self on public.campaign_members for insert to authenticated
with check (
  user_id=(select auth.uid()) and role='owner'
  and campaign_owner_id=(select auth.uid())
  and private.is_campaign_owner(campaign_id)
);
create policy campaign_members_update_owner_self on public.campaign_members for update to authenticated
using (user_id=(select auth.uid()) and private.is_campaign_owner(campaign_id))
with check (user_id=(select auth.uid()) and role='owner' and campaign_owner_id=(select auth.uid()) and private.is_campaign_owner(campaign_id));
create policy campaign_members_delete_owner on public.campaign_members for delete to authenticated
using (private.is_campaign_owner(campaign_id));

create policy campaign_invites_select_owner on public.campaign_invites for select to authenticated
using (private.is_campaign_owner(campaign_id));
create policy campaign_invites_insert_owner on public.campaign_invites for insert to authenticated
with check (private.is_campaign_owner(campaign_id) and created_by=(select auth.uid()));
create policy campaign_invites_update_owner on public.campaign_invites for update to authenticated
using (private.is_campaign_owner(campaign_id))
with check (private.is_campaign_owner(campaign_id) and created_by=(select auth.uid()));
create policy campaign_invites_delete_owner on public.campaign_invites for delete to authenticated
using (private.is_campaign_owner(campaign_id));

create policy locations_select_member on public.locations for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy locations_insert_owner on public.locations for insert to authenticated
with check (private.is_campaign_owner(campaign_id) and created_by=(select auth.uid()));
create policy locations_update_owner on public.locations for update to authenticated
using (private.is_campaign_owner(campaign_id))
with check (private.is_campaign_owner(campaign_id));
create policy locations_delete_owner on public.locations for delete to authenticated
using (private.is_campaign_owner(campaign_id));

create policy location_private_notes_owner_all on public.location_private_notes for all to authenticated
using (private.is_campaign_owner(campaign_id))
with check (private.is_campaign_owner(campaign_id) and (updated_by is null or updated_by=(select auth.uid())));

create policy floors_select_member on public.floors for select to authenticated
using (private.is_location_member(location_id));
create policy floors_insert_owner on public.floors for insert to authenticated
with check (private.is_location_owner(location_id));
create policy floors_update_owner on public.floors for update to authenticated
using (private.is_location_owner(location_id))
with check (private.is_location_owner(location_id));
create policy floors_delete_owner on public.floors for delete to authenticated
using (private.is_location_owner(location_id));

create policy floor_private_notes_owner_all on public.floor_private_notes for all to authenticated
using (private.is_campaign_owner(campaign_id))
with check (private.is_campaign_owner(campaign_id) and (updated_by is null or updated_by=(select auth.uid())));

create policy rooms_select_member on public.rooms for select to authenticated
using (private.is_floor_member(floor_id));
create policy rooms_insert_owner on public.rooms for insert to authenticated
with check (private.is_floor_owner(floor_id));
create policy rooms_update_owner on public.rooms for update to authenticated
using (private.is_floor_owner(floor_id))
with check (private.is_floor_owner(floor_id));
create policy rooms_delete_owner on public.rooms for delete to authenticated
using (private.is_floor_owner(floor_id));

create policy room_private_notes_owner_all on public.room_private_notes for all to authenticated
using (private.is_campaign_owner(campaign_id))
with check (private.is_campaign_owner(campaign_id) and (updated_by is null or updated_by=(select auth.uid())));

create policy characters_select_member on public.characters for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy characters_insert_member on public.characters for insert to authenticated
with check (
  private.is_campaign_member(campaign_id)
  and (private.is_campaign_owner(campaign_id) or player_id=(select auth.uid()))
);
create policy characters_update_owner_or_player on public.characters for update to authenticated
using (private.is_campaign_owner(campaign_id) or player_id=(select auth.uid()))
with check (
  private.is_campaign_member(campaign_id)
  and (private.is_campaign_owner(campaign_id) or player_id=(select auth.uid()))
);
create policy characters_delete_owner_or_player on public.characters for delete to authenticated
using (private.is_campaign_owner(campaign_id) or player_id=(select auth.uid()));

create policy character_field_definitions_select_member on public.character_field_definitions for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy character_field_definitions_insert_owner on public.character_field_definitions for insert to authenticated
with check (private.is_campaign_owner(campaign_id));
create policy character_field_definitions_update_owner on public.character_field_definitions for update to authenticated
using (private.is_campaign_owner(campaign_id))
with check (private.is_campaign_owner(campaign_id));
create policy character_field_definitions_delete_owner on public.character_field_definitions for delete to authenticated
using (private.is_campaign_owner(campaign_id));

create policy character_private_data_owner_all on public.character_private_data for all to authenticated
using (private.is_campaign_owner(campaign_id))
with check (private.is_campaign_owner(campaign_id) and (updated_by is null or updated_by=(select auth.uid())));

create policy npcs_select_member on public.npcs for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy npcs_insert_owner on public.npcs for insert to authenticated
with check (private.is_campaign_owner(campaign_id));
create policy npcs_update_owner on public.npcs for update to authenticated
using (private.is_campaign_owner(campaign_id))
with check (private.is_campaign_owner(campaign_id));
create policy npcs_delete_owner on public.npcs for delete to authenticated
using (private.is_campaign_owner(campaign_id));

create policy npc_private_notes_owner_all on public.npc_private_notes for all to authenticated
using (private.is_campaign_owner(campaign_id))
with check (private.is_campaign_owner(campaign_id) and (updated_by is null or updated_by=(select auth.uid())));

create policy world_entities_select_member on public.world_entities for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy world_entities_insert_owner on public.world_entities for insert to authenticated
with check (private.is_campaign_owner(campaign_id));
create policy world_entities_update_owner_or_character_player on public.world_entities for update to authenticated
using (private.can_edit_world_entity(id))
with check (
  private.is_campaign_member(campaign_id)
  and (private.is_campaign_owner(campaign_id) or (
    character_id is not null and exists (
      select 1 from public.characters ch where ch.id=world_entities.character_id and ch.player_id=(select auth.uid())
    )
  ))
);
create policy world_entities_delete_owner on public.world_entities for delete to authenticated
using (private.is_campaign_owner(campaign_id));

create policy sessions_select_member on public.sessions for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy sessions_insert_owner on public.sessions for insert to authenticated
with check (private.is_campaign_owner(campaign_id) and (created_by is null or created_by=(select auth.uid())));
create policy sessions_update_owner on public.sessions for update to authenticated
using (private.is_campaign_owner(campaign_id))
with check (private.is_campaign_owner(campaign_id));
create policy sessions_delete_owner on public.sessions for delete to authenticated
using (private.is_campaign_owner(campaign_id));

create policy dice_rolls_select_member on public.dice_rolls for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy dice_rolls_insert_self on public.dice_rolls for insert to authenticated
with check (private.is_campaign_member(campaign_id) and roller_user_id=(select auth.uid()));
create policy dice_rolls_update_owner on public.dice_rolls for update to authenticated
using (private.is_campaign_owner(campaign_id))
with check (private.is_campaign_owner(campaign_id));
create policy dice_rolls_delete_owner on public.dice_rolls for delete to authenticated
using (private.is_campaign_owner(campaign_id));

create policy audio_assets_select_member on public.audio_assets for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy audio_assets_insert_owner on public.audio_assets for insert to authenticated
with check (private.is_campaign_owner(campaign_id) and (created_by is null or created_by=(select auth.uid())));
create policy audio_assets_update_owner on public.audio_assets for update to authenticated
using (private.is_campaign_owner(campaign_id))
with check (private.is_campaign_owner(campaign_id));
create policy audio_assets_delete_owner on public.audio_assets for delete to authenticated
using (private.is_campaign_owner(campaign_id));

create policy audio_playlists_select_member on public.audio_playlists for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy audio_playlists_insert_owner on public.audio_playlists for insert to authenticated
with check (private.is_campaign_owner(campaign_id));
create policy audio_playlists_update_owner on public.audio_playlists for update to authenticated
using (private.is_campaign_owner(campaign_id))
with check (private.is_campaign_owner(campaign_id));
create policy audio_playlists_delete_owner on public.audio_playlists for delete to authenticated
using (private.is_campaign_owner(campaign_id));

create policy audio_playlist_items_select_member on public.audio_playlist_items for select to authenticated
using (exists (
  select 1 from public.audio_playlists ap
  where ap.id=playlist_id and private.is_campaign_member(ap.campaign_id)
));
create policy audio_playlist_items_insert_owner on public.audio_playlist_items for insert to authenticated
with check (exists (
  select 1 from public.audio_playlists ap
  where ap.id=playlist_id and private.is_campaign_owner(ap.campaign_id)
));
create policy audio_playlist_items_update_owner on public.audio_playlist_items for update to authenticated
using (exists (
  select 1 from public.audio_playlists ap
  where ap.id=playlist_id and private.is_campaign_owner(ap.campaign_id)
))
with check (exists (
  select 1 from public.audio_playlists ap
  where ap.id=playlist_id and private.is_campaign_owner(ap.campaign_id)
));
create policy audio_playlist_items_delete_owner on public.audio_playlist_items for delete to authenticated
using (exists (
  select 1 from public.audio_playlists ap
  where ap.id=playlist_id and private.is_campaign_owner(ap.campaign_id)
));

create policy campaign_audio_state_select_member on public.campaign_audio_state for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy campaign_audio_state_insert_owner on public.campaign_audio_state for insert to authenticated
with check (private.is_campaign_owner(campaign_id) and (updated_by is null or updated_by=(select auth.uid())));
create policy campaign_audio_state_update_owner on public.campaign_audio_state for update to authenticated
using (private.is_campaign_owner(campaign_id))
with check (private.is_campaign_owner(campaign_id) and (updated_by is null or updated_by=(select auth.uid())));
create policy campaign_audio_state_delete_owner on public.campaign_audio_state for delete to authenticated
using (private.is_campaign_owner(campaign_id));

create policy campaign_chronicles_owner_all on public.campaign_chronicles for all to authenticated
using (private.is_campaign_owner(campaign_id))
with check (private.is_campaign_owner(campaign_id) and (updated_by is null or updated_by=(select auth.uid())));

create policy campaign_activity_select_member on public.campaign_activity for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy campaign_activity_insert_self on public.campaign_activity for insert to authenticated
with check (private.is_campaign_member(campaign_id) and (actor_id is null or actor_id=(select auth.uid())));
create policy campaign_activity_update_owner on public.campaign_activity for update to authenticated
using (private.is_campaign_owner(campaign_id))
with check (private.is_campaign_owner(campaign_id));
create policy campaign_activity_delete_owner on public.campaign_activity for delete to authenticated
using (private.is_campaign_owner(campaign_id));

create policy campaign_chat_select_member on public.campaign_chat_messages for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy campaign_chat_insert_self on public.campaign_chat_messages for insert to authenticated
with check (private.is_campaign_member(campaign_id) and user_id=(select auth.uid()));

create policy campaign_rulesets_select_member on public.campaign_rulesets for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy campaign_rulesets_insert_owner on public.campaign_rulesets for insert to authenticated
with check (private.is_campaign_owner(campaign_id) and (updated_by is null or updated_by=(select auth.uid())));
create policy campaign_rulesets_update_owner on public.campaign_rulesets for update to authenticated
using (private.is_campaign_owner(campaign_id))
with check (private.is_campaign_owner(campaign_id) and (updated_by is null or updated_by=(select auth.uid())));
create policy campaign_rulesets_delete_owner on public.campaign_rulesets for delete to authenticated
using (private.is_campaign_owner(campaign_id));

create policy character_inventory_select_member on public.character_inventory for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy character_inventory_insert_owner_or_player on public.character_inventory for insert to authenticated
with check (private.is_campaign_member(campaign_id) and private.can_edit_character(character_id)
  and exists(select 1 from public.characters ch where ch.id=character_inventory.character_id and ch.campaign_id=character_inventory.campaign_id));
create policy character_inventory_update_owner_or_player on public.character_inventory for update to authenticated
using (private.can_edit_character(character_id))
with check (private.can_edit_character(character_id) and private.is_campaign_member(campaign_id));
create policy character_inventory_delete_owner_or_player on public.character_inventory for delete to authenticated
using (private.can_edit_character(character_id));

create policy character_abilities_select_member on public.character_abilities for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy character_abilities_insert_owner_or_player on public.character_abilities for insert to authenticated
with check (private.is_campaign_member(campaign_id) and private.can_edit_character(character_id)
  and exists(select 1 from public.characters ch where ch.id=character_abilities.character_id and ch.campaign_id=character_abilities.campaign_id));
create policy character_abilities_update_owner_or_player on public.character_abilities for update to authenticated
using (private.can_edit_character(character_id))
with check (private.can_edit_character(character_id) and private.is_campaign_member(campaign_id));
create policy character_abilities_delete_owner_or_player on public.character_abilities for delete to authenticated
using (private.can_edit_character(character_id));

create policy character_history_select_member on public.character_history for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy character_history_insert_owner on public.character_history for insert to authenticated
with check (private.is_campaign_owner(campaign_id));
create policy character_history_delete_owner on public.character_history for delete to authenticated
using (private.is_campaign_owner(campaign_id));

create policy combat_encounters_select_member on public.combat_encounters for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy combat_encounters_insert_owner on public.combat_encounters for insert to authenticated
with check (private.is_campaign_owner(campaign_id) and (started_by is null or started_by=(select auth.uid())));
create policy combat_encounters_update_owner on public.combat_encounters for update to authenticated
using (private.is_campaign_owner(campaign_id))
with check (private.is_campaign_owner(campaign_id));
create policy combat_encounters_delete_owner on public.combat_encounters for delete to authenticated
using (private.is_campaign_owner(campaign_id));

create policy combatants_select_member on public.combatants for select to authenticated
using (exists (
  select 1 from public.combat_encounters ce
  where ce.id=encounter_id and private.is_campaign_member(ce.campaign_id)
));
create policy combatants_insert_owner on public.combatants for insert to authenticated
with check (exists (
  select 1 from public.combat_encounters ce
  where ce.id=encounter_id and private.is_campaign_owner(ce.campaign_id)
));
create policy combatants_update_owner on public.combatants for update to authenticated
using (exists (
  select 1 from public.combat_encounters ce
  where ce.id=encounter_id and private.is_campaign_owner(ce.campaign_id)
))
with check (exists (
  select 1 from public.combat_encounters ce
  where ce.id=encounter_id and private.is_campaign_owner(ce.campaign_id)
));
create policy combatants_delete_owner on public.combatants for delete to authenticated
using (exists (
  select 1 from public.combat_encounters ce
  where ce.id=encounter_id and private.is_campaign_owner(ce.campaign_id)
));

create policy fog_cells_select_self on public.fog_exploration_cells for select to authenticated
using (user_id=(select auth.uid()) and private.is_campaign_member(campaign_id));
create policy fog_cells_insert_self on public.fog_exploration_cells for insert to authenticated
with check (
  user_id=(select auth.uid()) and private.is_campaign_member(campaign_id)
  and exists(
    select 1 from public.floors f join public.locations l on l.id=f.location_id
    where f.id=floor_id and l.campaign_id=fog_exploration_cells.campaign_id
  )
);
create policy fog_cells_update_self on public.fog_exploration_cells for update to authenticated
using (user_id=(select auth.uid()) and private.is_campaign_member(campaign_id))
with check (user_id=(select auth.uid()) and private.is_campaign_member(campaign_id));
create policy fog_cells_delete_self on public.fog_exploration_cells for delete to authenticated
using (user_id=(select auth.uid()) and private.is_campaign_member(campaign_id));

grant select,insert,update,delete on all tables in schema public to authenticated;
grant execute on function private.is_campaign_owner(uuid) to authenticated;
grant execute on function private.is_campaign_member(uuid) to authenticated;
grant execute on function private.is_location_member(uuid) to authenticated;
grant execute on function private.is_location_owner(uuid) to authenticated;
grant execute on function private.is_floor_member(uuid) to authenticated;
grant execute on function private.is_floor_owner(uuid) to authenticated;
grant execute on function private.is_room_member(uuid) to authenticated;
grant execute on function private.is_room_owner(uuid) to authenticated;
grant execute on function private.can_edit_character(uuid) to authenticated;
grant execute on function private.can_edit_world_entity(uuid) to authenticated;
grant execute on function private.can_read_profile(uuid) to authenticated;
grant execute on function private.can_access_realtime_topic(text) to authenticated;
revoke all on function private.realtime_campaign_from_topic(text) from public, anon, authenticated;

create or replace function public.ensure_campaign_world(p_campaign_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_location_id uuid;
  v_floor_id uuid;
begin
  if not private.is_campaign_owner(p_campaign_id) then
    raise exception 'Apenas o mestre da campanha pode inicializar o mundo.' using errcode='42501';
  end if;

  select l.id into v_location_id
  from public.locations l where l.campaign_id=p_campaign_id
  order by l.sort_order,l.created_at limit 1;

  if v_location_id is null then
    insert into public.locations(campaign_id,name,location_type,description,created_by,sort_order)
    values(p_campaign_id,'Primeiro cenário','Local','',(select auth.uid()),0)
    returning id into v_location_id;
  end if;

  select f.id into v_floor_id
  from public.floors f where f.location_id=v_location_id
  order by f.sort_order,f.created_at limit 1;

  if v_floor_id is null then
    insert into public.floors(location_id,name,floor_number,description,sort_order)
    values(v_location_id,'Térreo',0,'',0)
    returning id into v_floor_id;
  end if;

  return jsonb_build_object('location_id',v_location_id,'floor_id',v_floor_id);
end;
$$;

create or replace function public.get_campaign_invite(p_campaign_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not private.is_campaign_owner(p_campaign_id) then
    raise exception 'Somente o mestre pode consultar o convite.' using errcode='42501';
  end if;
  select ci.invite_code into v_code
  from public.campaign_invites ci where ci.campaign_id=p_campaign_id;
  if v_code is null then
    v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    insert into public.campaign_invites(campaign_id,invite_code,created_by)
    values(p_campaign_id,v_code,(select auth.uid()))
    on conflict (campaign_id) do update
      set invite_code=excluded.invite_code,created_by=excluded.created_by,updated_at=now();
  end if;
  return v_code;
end;
$$;

create or replace function public.regenerate_campaign_invite(p_campaign_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
begin
  if not private.is_campaign_owner(p_campaign_id) then
    raise exception 'Somente o mestre pode renovar o convite.' using errcode='42501';
  end if;
  insert into public.campaign_invites(campaign_id,invite_code,created_by)
  values(p_campaign_id,v_code,(select auth.uid()))
  on conflict (campaign_id) do update
    set invite_code=excluded.invite_code,created_by=excluded.created_by,updated_at=now();
  return v_code;
end;
$$;

create or replace function public.join_campaign_by_code(p_invite_code text)
returns table(campaign_id uuid, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_owner_id uuid;
  v_role text;
begin
  if (select auth.uid()) is null then
    raise exception 'Faça login antes de entrar em uma campanha.' using errcode='28000';
  end if;

  select c.id,c.owner_id into v_campaign_id,v_owner_id
  from public.campaign_invites ci
  join public.campaigns c on c.id=ci.campaign_id
  where upper(ci.invite_code)=upper(trim(p_invite_code))
  limit 1;

  if v_campaign_id is null then
    raise exception 'Código de convite inválido ou expirado.' using errcode='P0001';
  end if;

  v_role := case when v_owner_id=(select auth.uid()) then 'owner' else 'player' end;
  insert into public.campaign_members(campaign_id,campaign_owner_id,user_id,role)
  values(v_campaign_id,v_owner_id,(select auth.uid()),v_role)
  on conflict(campaign_id,user_id) do nothing;

  return query select v_campaign_id,v_role;
end;
$$;

create or replace function public.delete_campaign(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_campaign_owner(p_campaign_id) then
    raise exception 'Somente o mestre pode excluir a campanha.' using errcode='42501';
  end if;
  delete from public.campaigns c where c.id=p_campaign_id and c.owner_id=(select auth.uid());
  if not found then
    raise exception 'Campanha não encontrada ou sem permissão.' using errcode='42501';
  end if;
end;
$$;

revoke all on function public.ensure_campaign_world(uuid) from public, anon;
grant execute on function public.ensure_campaign_world(uuid) to authenticated;
revoke all on function public.get_campaign_invite(uuid) from public, anon;
grant execute on function public.get_campaign_invite(uuid) to authenticated;
revoke all on function public.regenerate_campaign_invite(uuid) from public, anon;
grant execute on function public.regenerate_campaign_invite(uuid) to authenticated;
revoke all on function public.join_campaign_by_code(text) from public, anon;
grant execute on function public.join_campaign_by_code(text) to authenticated;
revoke all on function public.delete_campaign(uuid) from public, anon;
grant execute on function public.delete_campaign(uuid) to authenticated;


-- Create a profile for every Auth user. The metadata is user-supplied and is
-- used only for display/account mode; RLS never treats it as campaign ownership.
create or replace function private.handle_new_auth_user()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  v_name text;
  v_type text;
begin
  v_name := coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'),''),'Aventureiro');
  v_type := case when lower(coalesce(new.raw_user_meta_data->>'account_type',''))='master' then 'master' else 'player' end;
  insert into public.profiles(id,display_name,account_type)
  values(new.id,v_name,v_type)
  on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_rpg_profile on auth.users;
create trigger on_auth_user_created_rpg_profile
after insert on auth.users
for each row execute function private.handle_new_auth_user();

revoke all on function private.handle_new_auth_user() from public,anon,authenticated;

-- When a custom field is switched from player-visible to GM-only, move its
-- stored value out of the publicly-readable character JSON immediately.
create or replace function private.sync_character_field_visibility()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  v_root text;
  v_key text;
  v_character record;
  v_value jsonb;
begin
  if old.player_visible is not distinct from new.player_visible then
    return new;
  end if;

  v_root := split_part(new.data_key,'.',1);
  v_key := split_part(new.data_key,'.',2);
  if split_part(new.data_key,'.',3) <> '' or v_root not in ('attributes','sheet_data') or v_key = '' then
    return new;
  end if;

  if new.player_visible = false then
    for v_character in
      select id,
        case when v_root='sheet_data' then sheet_data->v_key else attributes->v_key end as value
      from public.characters
      where campaign_id=new.campaign_id
    loop
      v_value := v_character.value;
      if v_value is not null then
        insert into public.character_private_data(character_id,campaign_id,data,updated_at)
        values(v_character.id,new.campaign_id,jsonb_build_object(v_key,v_value),now())
        on conflict(character_id) do update
          set data=public.character_private_data.data || excluded.data,updated_at=now();
        if v_root='sheet_data' then
          update public.characters set sheet_data=coalesce(sheet_data,'{}'::jsonb)-v_key where id=v_character.id;
        else
          update public.characters set attributes=coalesce(attributes,'{}'::jsonb)-v_key where id=v_character.id;
        end if;
      end if;
    end loop;
  else
    for v_character in
      select c.id,p.data->v_key as value
      from public.characters c
      join public.character_private_data p on p.character_id=c.id
      where c.campaign_id=new.campaign_id and p.data ? v_key
    loop
      v_value := v_character.value;
      if v_value is not null then
        if v_root='sheet_data' then
          update public.characters set sheet_data=coalesce(sheet_data,'{}'::jsonb)||jsonb_build_object(v_key,v_value) where id=v_character.id;
        else
          update public.characters set attributes=coalesce(attributes,'{}'::jsonb)||jsonb_build_object(v_key,v_value) where id=v_character.id;
        end if;
        update public.character_private_data
        set data=data-v_key,updated_at=now()
        where character_id=v_character.id;
      end if;
    end loop;
    delete from public.character_private_data
    where campaign_id=new.campaign_id and data='{}'::jsonb;
  end if;
  return new;
end;
$$;

drop trigger if exists character_field_visibility_sync on public.character_field_definitions;
create trigger character_field_visibility_sync
after update of player_visible on public.character_field_definitions
for each row execute function private.sync_character_field_visibility();

revoke all on function private.sync_character_field_visibility() from public,anon,authenticated;

create or replace function private.record_campaign_activity()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  v_row jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_campaign_id uuid;
  v_entity_id uuid;
  v_actor_id uuid;
  v_entity_type text := tg_table_name;
begin
  v_campaign_id := nullif(v_row->>'campaign_id','')::uuid;
  v_entity_id := nullif(v_row->>'id','')::uuid;
  v_actor_id := coalesce(nullif(v_row->>'created_by','')::uuid,nullif(v_row->>'updated_by','')::uuid,(select auth.uid()));

  if tg_table_name='rooms' then
    select l.campaign_id into v_campaign_id
    from public.floors f join public.locations l on l.id=f.location_id
    where f.id=nullif(v_row->>'floor_id','')::uuid;
  elsif tg_table_name='floors' then
    select l.campaign_id into v_campaign_id
    from public.locations l where l.id=nullif(v_row->>'location_id','')::uuid;
  elsif tg_table_name='combatants' then
    select ce.campaign_id into v_campaign_id
    from public.combat_encounters ce where ce.id=nullif(v_row->>'encounter_id','')::uuid;
  end if;

  if v_campaign_id is not null then
    insert into public.campaign_activity(campaign_id,actor_id,action,entity_type,entity_id,summary,metadata)
    values(v_campaign_id,v_actor_id,tg_op,v_entity_type,v_entity_id,
      initcap(replace(v_entity_type,'_',' '))||' · '||lower(tg_op),
      jsonb_build_object('source','database_trigger'));
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['locations','floors','rooms','characters','npcs','world_entities','sessions','dice_rolls','combat_encounters','combatants'] loop
    execute format('drop trigger if exists rpg_campaign_activity_log on public.%I',t);
    execute format('create trigger rpg_campaign_activity_log after insert or update or delete on public.%I for each row execute function private.record_campaign_activity()',t);
  end loop;
end
$$;

create or replace function private.record_character_history()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
begin
  if tg_op='DELETE' then
    insert into public.character_history(campaign_id,character_id,character_name,event_type,hp_before,hp_after,message)
    values(old.campaign_id,old.id,old.name,'deleted',old.hp_current,null,'Ficha de personagem excluída.');
    return old;
  end if;

  if old.hp_current is distinct from new.hp_current then
    if coalesce(old.hp_current,0)>0 and coalesce(new.hp_current,0)<=0 then
      insert into public.character_history(campaign_id,character_id,character_name,event_type,hp_before,hp_after,message)
      values(new.campaign_id,new.id,new.name,'defeated',old.hp_current,new.hp_current,'Personagem ficou fora de combate.');
    elsif coalesce(old.hp_current,0)<=0 and coalesce(new.hp_current,0)>0 then
      insert into public.character_history(campaign_id,character_id,character_name,event_type,hp_before,hp_after,message)
      values(new.campaign_id,new.id,new.name,'revived',old.hp_current,new.hp_current,'Personagem retornou ao combate.');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists rpg_character_history_change on public.characters;
create trigger rpg_character_history_change
after update of hp_current or delete on public.characters
for each row execute function private.record_character_history();

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','campaigns','locations','floors','rooms','characters','npcs','world_entities',
    'sessions','audio_assets','audio_playlists','campaign_audio_state','campaign_chronicles',
    'campaign_rulesets','character_inventory','character_abilities','combat_encounters','combatants'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I',t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.touch_updated_at()',t);
  end loop;
end
$$;

insert into storage.buckets(id,name,public,file_size_limit)
values('rpg-media','rpg-media',true,52428800)
on conflict(id) do update set public=true,file_size_limit=greatest(coalesce(storage.buckets.file_size_limit,0),52428800);

drop policy if exists rpg_media_public_read on storage.objects;
drop policy if exists rpg_media_insert_own_folder on storage.objects;
drop policy if exists rpg_media_update_own_folder on storage.objects;
drop policy if exists rpg_media_delete_own_folder on storage.objects;
create policy rpg_media_public_read on storage.objects for select to public
using (bucket_id='rpg-media');
create policy rpg_media_insert_own_folder on storage.objects for insert to authenticated
with check (bucket_id='rpg-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy rpg_media_update_own_folder on storage.objects for update to authenticated
using (bucket_id='rpg-media' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='rpg-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy rpg_media_delete_own_folder on storage.objects for delete to authenticated
using (bucket_id='rpg-media' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Browser clients use authenticated private channels. Access is tied to the campaign
-- (or session) encoded in the topic, never to a globally open authenticated policy.
alter table realtime.messages enable row level security;
drop policy if exists rpg_hub_private_channel_read on realtime.messages;
drop policy if exists rpg_hub_private_channel_send on realtime.messages;
create policy rpg_hub_private_channel_read on realtime.messages for select to authenticated
using (
  extension in ('broadcast','presence')
  and private.can_access_realtime_topic((select realtime.topic()))
);
create policy rpg_hub_private_channel_send on realtime.messages for insert to authenticated
with check (
  extension in ('broadcast','presence')
  and private.can_access_realtime_topic((select realtime.topic()))
);

do $$
declare
  t text;
  targets text[] := array[
    'campaign_members','locations','floors','rooms','characters','character_field_definitions',
    'npcs','world_entities','sessions','dice_rolls','audio_assets','audio_playlists',
    'audio_playlist_items','campaign_audio_state','campaign_chronicles','campaign_activity',
    'campaign_chat_messages','character_abilities','character_inventory','character_history',
    'campaign_rulesets','combat_encounters','combatants'
  ];
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array targets loop
      if not exists(
        select 1 from pg_publication_tables
        where pubname='supabase_realtime' and schemaname='public' and tablename=t
      ) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end
$$;

revoke all on function private.record_campaign_activity() from public, anon;
revoke all on function private.record_character_history() from public, anon;
revoke all on function private.touch_updated_at() from public, anon;
