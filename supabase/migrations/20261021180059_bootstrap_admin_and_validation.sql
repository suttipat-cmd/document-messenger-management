begin;
create or replace function messenger_private.create_job(p_title text,p_requester text,p_department text,p_messenger_id uuid,p_stops jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare jid uuid; item jsonb; pos integer:=0;
begin
 if auth.uid() is null or coalesce(messenger_private.current_role(),'') not in ('admin','super_user') then raise exception 'Manager access required' using errcode='42501'; end if;
 if not exists(select 1 from public.messenger_profiles where id=p_messenger_id and active and role='messenger') then raise exception 'Active messenger required'; end if;
 if p_stops is null or jsonb_typeof(p_stops)<>'array' or jsonb_array_length(p_stops) not between 1 and 50 then raise exception '1-50 stops required'; end if;
 insert into public.messenger_jobs(title,requester,department,messenger_id) values(trim(p_title),trim(p_requester),coalesce(trim(p_department),''),p_messenger_id) returning id into jid;
 select coalesce(max(s.route_position),0) into pos from public.messenger_stops s join public.messenger_jobs j on j.id=s.job_id where j.messenger_id=p_messenger_id;
 for item in select * from jsonb_array_elements(p_stops) loop
  pos:=pos+1;
  insert into public.messenger_stops(job_id,name,address,kind,contact,phone,route_position)
  values(jid,trim(item->>'name'),trim(item->>'address'),item->>'kind',coalesce(item->>'contact',''),coalesce(item->>'phone',''),pos);
 end loop;
 insert into public.messenger_events(job_id,actor_id,message) values(jid,auth.uid(),'สร้างและมอบหมายงาน');
 return jid;
end $$;

create table messenger_private.bootstrap_accounts (
 email text primary key,
 claimed_at timestamptz
);
alter table messenger_private.bootstrap_accounts enable row level security;
revoke all on messenger_private.bootstrap_accounts from public,anon,authenticated;
insert into messenger_private.bootstrap_accounts(email) values ('suttipat@forwardinsight.co.th');
create function messenger_private.bootstrap_verified_admin() returns trigger
language plpgsql security definer set search_path='' as $$
declare claimed text;
begin
 if new.email_confirmed_at is null then return new; end if;
 update messenger_private.bootstrap_accounts set claimed_at=now() where email=lower(new.email) and claimed_at is null returning email into claimed;
 if claimed is not null then
  insert into public.messenger_profiles(id,display_name,role,active) values(new.id,'Suttipat','admin',true)
  on conflict(id) do update set role='admin',active=true,display_name='Suttipat';
 end if;
 return new;
end $$;
revoke all on function messenger_private.bootstrap_verified_admin() from public,anon,authenticated;
create trigger messenger_verified_admin after insert or update of email_confirmed_at on auth.users for each row execute function messenger_private.bootstrap_verified_admin();

commit;
select 'bootstrap_and_validation_ready' as result;
