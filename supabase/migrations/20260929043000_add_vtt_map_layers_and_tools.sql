create table if not exists public.map_settings (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  floor_id uuid not null references public.floors(id) on delete cascade,
  grid_enabled boolean not null default true,
  snap_enabled boolean not null default true,
  grid_size numeric not null default 5 check (grid_size > 0 and grid_size <= 25),
  unit_per_cell numeric not null default 5 check (unit_per_cell > 0 and unit_per_cell <= 1000),
  fog_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(campaign_id,floor_id)
);
create index if not exists map_settings_campaign_floor_idx on public.map_settings(campaign_id,floor_id);
create index if not exists map_settings_updated_by_idx on public.map_settings(updated_by);

create table if not exists public.fog_regions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  floor_id uuid not null references public.floors(id) on delete cascade,
  x numeric not null check (x >= 0 and x <= 100),
  y numeric not null check (y >= 0 and y <= 100),
  width numeric not null check (width > 0 and width <= 100),
  height numeric not null check (height > 0 and height <= 100),
  revealed boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists fog_regions_campaign_floor_idx on public.fog_regions(campaign_id,floor_id);
create index if not exists fog_regions_created_by_idx on public.fog_regions(created_by);

create table if not exists public.aoe_effects (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  floor_id uuid not null references public.floors(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  shape text not null default 'circle' check (shape in ('circle','square','cone','line')),
  x numeric not null check (x >= 0 and x <= 100),
  y numeric not null check (y >= 0 and y <= 100),
  size numeric not null default 10 check (size > 0 and size <= 100),
  length numeric not null default 20 check (length > 0 and length <= 100),
  rotation numeric not null default 0 check (rotation >= -180 and rotation <= 180),
  color text not null default '#9487ff',
  opacity numeric not null default 0.22 check (opacity >= 0.05 and opacity <= 0.8),
  label text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists aoe_effects_campaign_floor_idx on public.aoe_effects(campaign_id,floor_id,created_at desc);
create index if not exists aoe_effects_session_idx on public.aoe_effects(session_id);
create index if not exists aoe_effects_created_by_idx on public.aoe_effects(created_by);

alter table public.map_settings enable row level security;
alter table public.fog_regions enable row level security;
alter table public.aoe_effects enable row level security;

create policy map_settings_select_member on public.map_settings for select to authenticated using (
  exists (select 1 from public.campaigns c where c.id=map_settings.campaign_id
    and (c.owner_id=(select auth.uid()) or exists (select 1 from public.campaign_members cm where cm.campaign_id=c.id and cm.user_id=(select auth.uid()))))
);
create policy map_settings_insert_owner on public.map_settings for insert to authenticated with check (
  exists (select 1 from public.campaigns c where c.id=map_settings.campaign_id and c.owner_id=(select auth.uid()))
  and updated_by=(select auth.uid())
);
create policy map_settings_update_owner on public.map_settings for update to authenticated
using (exists (select 1 from public.campaigns c where c.id=map_settings.campaign_id and c.owner_id=(select auth.uid())))
with check (exists (select 1 from public.campaigns c where c.id=map_settings.campaign_id and c.owner_id=(select auth.uid())) and updated_by=(select auth.uid()));
create policy map_settings_delete_owner on public.map_settings for delete to authenticated
using (exists (select 1 from public.campaigns c where c.id=map_settings.campaign_id and c.owner_id=(select auth.uid())));

create policy fog_regions_select_member on public.fog_regions for select to authenticated using (
  exists (select 1 from public.campaigns c where c.id=fog_regions.campaign_id
    and (c.owner_id=(select auth.uid()) or exists (select 1 from public.campaign_members cm where cm.campaign_id=c.id and cm.user_id=(select auth.uid()))))
);
create policy fog_regions_insert_owner on public.fog_regions for insert to authenticated with check (
  exists (select 1 from public.campaigns c where c.id=fog_regions.campaign_id and c.owner_id=(select auth.uid()))
  and created_by=(select auth.uid())
);
create policy fog_regions_update_owner on public.fog_regions for update to authenticated
using (exists (select 1 from public.campaigns c where c.id=fog_regions.campaign_id and c.owner_id=(select auth.uid())))
with check (exists (select 1 from public.campaigns c where c.id=fog_regions.campaign_id and c.owner_id=(select auth.uid())));
create policy fog_regions_delete_owner on public.fog_regions for delete to authenticated
using (exists (select 1 from public.campaigns c where c.id=fog_regions.campaign_id and c.owner_id=(select auth.uid())));

create policy aoe_effects_select_member on public.aoe_effects for select to authenticated using (
  exists (select 1 from public.campaigns c where c.id=aoe_effects.campaign_id
    and (c.owner_id=(select auth.uid()) or exists (select 1 from public.campaign_members cm where cm.campaign_id=c.id and cm.user_id=(select auth.uid()))))
);
create policy aoe_effects_insert_owner on public.aoe_effects for insert to authenticated with check (
  exists (select 1 from public.campaigns c where c.id=aoe_effects.campaign_id and c.owner_id=(select auth.uid()))
  and created_by=(select auth.uid())
);
create policy aoe_effects_update_owner on public.aoe_effects for update to authenticated
using (exists (select 1 from public.campaigns c where c.id=aoe_effects.campaign_id and c.owner_id=(select auth.uid())))
with check (exists (select 1 from public.campaigns c where c.id=aoe_effects.campaign_id and c.owner_id=(select auth.uid())));
create policy aoe_effects_delete_owner on public.aoe_effects for delete to authenticated
using (exists (select 1 from public.campaigns c where c.id=aoe_effects.campaign_id and c.owner_id=(select auth.uid())));

grant select on public.map_settings,public.fog_regions,public.aoe_effects to authenticated;
grant insert,update,delete on public.map_settings,public.fog_regions,public.aoe_effects to authenticated;

alter publication supabase_realtime add table public.map_settings;
alter publication supabase_realtime add table public.fog_regions;
alter publication supabase_realtime add table public.aoe_effects;
