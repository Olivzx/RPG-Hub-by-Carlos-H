-- Avoid PL/pgSQL output parameter "campaign_id" shadowing campaign_members columns.
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
  on conflict do nothing;

  return query select v_campaign_id,v_role;
end;
$$;

revoke all on function public.join_campaign_by_code(text) from public,anon;
grant execute on function public.join_campaign_by_code(text) to authenticated;
