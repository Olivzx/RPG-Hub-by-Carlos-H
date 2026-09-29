-- Keep campaign-world initialization under caller RLS instead of SECURITY DEFINER.
alter function public.ensure_campaign_world(uuid) security invoker;
revoke execute on function public.ensure_campaign_world(uuid) from anon;
grant execute on function public.ensure_campaign_world(uuid) to authenticated;
