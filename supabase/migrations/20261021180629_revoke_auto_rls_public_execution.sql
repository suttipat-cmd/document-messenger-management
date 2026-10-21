-- Keep automatic RLS enabled, but do not expose its trigger helper as an RPC.
do $$ begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
 end if;
end $$;
select 'auto_rls_execution_restricted' as result;

create or replace function messenger_private.set_profile(p_user_id uuid,p_role text,p_active boolean,p_name text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_role is null or p_role not in ('admin','super_user','messenger') or p_active is null or length(trim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Invalid profile'; end if;
 perform pg_advisory_xact_lock(hashtextextended('messenger_admin_management',0));
 if auth.uid() is null or coalesce(messenger_private.current_role(),'')<>'admin' then raise exception 'Admin access required' using errcode='42501'; end if;
 if exists(select 1 from public.messenger_profiles where id=p_user_id and role='admin' and active)
 and (not p_active or p_role<>'admin') and not exists(select 1 from public.messenger_profiles where id<>p_user_id and role='admin' and active) then raise exception 'Cannot remove the last active admin'; end if;
 update public.messenger_profiles set role=p_role,active=p_active,display_name=trim(p_name) where id=p_user_id;
 if not found then raise exception 'Profile not found'; end if;
end $$;

select 'profile_lock_hardened' as result;
