begin;
alter table public.messenger_profiles add column email text;
update public.messenger_profiles p set email=u.email from auth.users u where p.id=u.id;
create or replace function messenger_private.on_auth_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.messenger_profiles(id,display_name,email) values(new.id,coalesce(nullif(left(new.raw_user_meta_data->>'display_name',120),''),'Messenger'),new.email) on conflict(id) do update set email=new.email;
 return new;
end $$;
create function messenger_private.sync_profile_email() returns trigger language plpgsql security definer set search_path='' as $$
begin update public.messenger_profiles set email=new.email where id=new.id; return new; end $$;
revoke all on function messenger_private.sync_profile_email() from public,anon,authenticated;
create trigger messenger_sync_email after update of email on auth.users for each row execute function messenger_private.sync_profile_email();
create function messenger_private.set_profile(p_user_id uuid,p_role text,p_active boolean,p_name text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(messenger_private.current_role(),'')<>'admin' then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_role is null or p_role not in ('admin','super_user','messenger') or p_active is null or length(trim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Invalid profile'; end if;
 perform pg_advisory_xact_lock(hashtextextended('messenger_admin_management',0));
 if exists(select 1 from public.messenger_profiles where id=p_user_id and role='admin' and active)
 and (not p_active or p_role<>'admin') and not exists(select 1 from public.messenger_profiles where id<>p_user_id and role='admin' and active) then raise exception 'Cannot remove the last active admin'; end if;
 update public.messenger_profiles set role=p_role,active=p_active,display_name=trim(p_name) where id=p_user_id;
 if not found then raise exception 'Profile not found'; end if;
end $$;
create function public.messenger_set_profile(p_user_id uuid,p_role text,p_active boolean,p_name text)
returns void language sql security invoker set search_path='' as $$select messenger_private.set_profile(p_user_id,p_role,p_active,p_name)$$;
revoke all on function messenger_private.set_profile(uuid,text,boolean,text),public.messenger_set_profile(uuid,text,boolean,text) from public,anon;
grant execute on function messenger_private.set_profile(uuid,text,boolean,text),public.messenger_set_profile(uuid,text,boolean,text) to authenticated;
commit;
select 'admin_profiles_ready' as result;
