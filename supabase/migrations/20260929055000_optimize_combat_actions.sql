create index if not exists combat_actions_attacker_idx on public.combat_actions(attacker_combatant_id);
create index if not exists combat_actions_target_idx on public.combat_actions(target_combatant_id);

drop policy if exists combat_actions_select_member on public.combat_actions;
create policy combat_actions_select_member on public.combat_actions for select using (exists (select 1 from public.campaigns c where c.id=combat_actions.campaign_id and (c.owner_id=(select auth.uid()) or exists (select 1 from public.campaign_members cm where cm.campaign_id=c.id and cm.user_id=(select auth.uid())))));

drop policy if exists combat_actions_insert_owner on public.combat_actions;
create policy combat_actions_insert_owner on public.combat_actions for insert with check (created_by=(select auth.uid()) and exists (select 1 from public.campaigns c where c.id=combat_actions.campaign_id and c.owner_id=(select auth.uid())));

drop policy if exists combat_actions_delete_owner on public.combat_actions;
create policy combat_actions_delete_owner on public.combat_actions for delete using (exists (select 1 from public.campaigns c where c.id=combat_actions.campaign_id and c.owner_id=(select auth.uid())));
