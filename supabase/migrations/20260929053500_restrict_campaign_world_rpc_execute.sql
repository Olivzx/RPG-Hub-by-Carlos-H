-- Restrict the SECURITY DEFINER campaign-world initializer to signed-in users.
revoke execute on function public.ensure_campaign_world(uuid) from anon;
grant execute on function public.ensure_campaign_world(uuid) to authenticated;
