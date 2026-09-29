-- RPG HUB — real token vision, line of sight and walls
alter table public.map_settings add column if not exists vision_enabled boolean not null default true;
create table if not exists public.map_walls (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  floor_id uuid not null references public.floors(id) on delete cascade,
  x1 numeric not null check (x1 between 0 and 100),
  y1 numeric not null check (y1 between 0 and 100),
  x2 numeric not null check (x2 between 0 and 100),
  y2 numeric not null check (y2 between 0 and 100),
  thickness numeric not null default 2 check (thickness > 0 and thickness <= 10),
  blocks_vision boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.vision_sources (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  floor_id uuid not null references public.floors(id) on delete cascade,
  entity_id uuid not null references public.world_entities(id) on delete cascade,
  enabled boolean not null default true,
  range_units numeric not null default 60 check (range_units between 0 and 10000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(campaign_id,floor_id,entity_id)
);
create index if not exists map_walls_campaign_floor_idx on public.map_walls(campaign_id,floor_id);
create index if not exists map_walls_floor_id_idx on public.map_walls(floor_id);
create index if not exists vision_sources_campaign_floor_idx on public.vision_sources(campaign_id,floor_id);
create index if not exists vision_sources_entity_idx on public.vision_sources(entity_id);
alter table public.map_walls enable row level security;
alter table public.vision_sources enable row level security;