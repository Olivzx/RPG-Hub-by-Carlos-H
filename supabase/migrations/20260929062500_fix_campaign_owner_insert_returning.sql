-- INSERT ... RETURNING also requires the new row to pass the SELECT policy.
-- During that statement the new campaign is not yet discoverable by a helper
-- that queries public.campaigns, so allow the owner directly from the row.
drop policy if exists campaigns_select_member on public.campaigns;
create policy campaigns_select_member on public.campaigns
for select to authenticated
using (
  owner_id = (select auth.uid())
  or private.is_campaign_member(id)
);
