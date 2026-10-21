begin;
create schema if not exists messenger_private;
revoke all on schema messenger_private from public, anon;
grant usage on schema messenger_private to authenticated;

create table public.messenger_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (length(display_name) between 1 and 120),
 role text not null default 'messenger' check (role in ('admin','super_user','messenger')),
 active boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.messenger_jobs (
 id uuid primary key default gen_random_uuid(),
 code text not null unique default ('MSG-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
 title text not null check (length(title) between 1 and 200),
 requester text not null check (length(requester) between 1 and 120),
 department text not null default '' check (length(department) <= 120),
 messenger_id uuid not null references public.messenger_profiles(id),
 status text not null default 'new' check (status in ('new','active','returning','done')),
 return_reason text check (length(return_reason) <= 2000),
 returned_at timestamptz,
 completed_at timestamptz,
 version integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.messenger_stops (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.messenger_jobs(id) on delete cascade,
 name text not null check (length(name) between 1 and 200),
 address text not null check (length(address) between 1 and 1000),
 kind text not null check (kind in ('รับเอกสาร','ส่งเอกสาร')),
 contact text not null default '' check (length(contact) <= 120),
 phone text not null default '' check (length(phone) <= 40),
 status text not null default 'pending' check (status in ('pending','retry','done')),
 route_position integer not null default 0 check (route_position >= 0),
 note text not null default '' check (length(note) <= 2000),
 completed_at timestamptz
);
create table public.messenger_events (
 id bigint generated always as identity primary key,
 job_id uuid not null references public.messenger_jobs(id) on delete cascade,
 actor_id uuid references public.messenger_profiles(id),
 message text not null,
 created_at timestamptz not null default now()
);
create index on public.messenger_jobs(messenger_id, status);
create index on public.messenger_stops(job_id);
create index on public.messenger_events(job_id,created_at);
create index on public.messenger_events(actor_id);

alter table public.messenger_profiles enable row level security;
alter table public.messenger_jobs enable row level security;
alter table public.messenger_stops enable row level security;
alter table public.messenger_events enable row level security;
revoke all on public.messenger_profiles, public.messenger_jobs, public.messenger_stops, public.messenger_events from anon, authenticated;
grant select on public.messenger_profiles, public.messenger_jobs, public.messenger_stops, public.messenger_events to authenticated;

-- Definer helpers are deliberately non-exposed and have fixed search paths.
-- All authorization uses database-owned role/active fields, never user_metadata.
create function messenger_private.current_role() returns text
language sql stable security definer set search_path = '' as $$
 select p.role from public.messenger_profiles p where p.id = (select auth.uid()) and p.active and (select auth.uid()) is not null
$$;
create function messenger_private.can_read_job(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select (select auth.uid()) is not null and exists (
 select 1 from public.messenger_jobs j where j.id=p_id and messenger_private.current_role() is not null
 and (j.messenger_id=(select auth.uid()) or messenger_private.current_role() in ('admin','super_user')))
$$;
create policy profile_read on public.messenger_profiles for select to authenticated using (
 id=(select auth.uid()) or (select messenger_private.current_role()) in ('admin','super_user'));
create policy job_read on public.messenger_jobs for select to authenticated using (
 (select messenger_private.current_role()) is not null and (messenger_id=(select auth.uid()) or (select messenger_private.current_role()) in ('admin','super_user')));
create policy stop_read on public.messenger_stops for select to authenticated using (messenger_private.can_read_job(job_id));
create policy event_read on public.messenger_events for select to authenticated using (messenger_private.can_read_job(job_id));

create function messenger_private.on_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.messenger_profiles(id,display_name) values(new.id,coalesce(nullif(left(new.raw_user_meta_data->>'display_name',120),''),'Messenger')) on conflict(id) do nothing;
 return new;
end $$;
create trigger messenger_profile_after_signup after insert on auth.users for each row execute function messenger_private.on_auth_user();
insert into public.messenger_profiles(id,display_name) select id,'Messenger' from auth.users on conflict do nothing;

-- Only this command path can change operational data. It checks identity,
-- role, ownership, state and optimistic version inside one transaction.
create function messenger_private.command(p_job_id uuid, p_action text, p_stop_id uuid, p_note text, p_expected_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.messenger_jobs; st public.messenger_stops; msg text; r text;
begin
 r:=messenger_private.current_role();
 if auth.uid() is null or r is null then raise exception 'Account is not active' using errcode='42501'; end if;
 select * into j from public.messenger_jobs where id=p_job_id for update;
 if not found or not (j.messenger_id=auth.uid() or r in ('admin','super_user')) then raise exception 'Job unavailable' using errcode='42501'; end if;
 if p_expected_version is null or p_expected_version<>j.version then raise exception 'Job changed. Refresh and try again.' using errcode='40001'; end if;
 if length(coalesce(p_note,''))>2000 then raise exception 'Note is too long'; end if;
 if p_action='accept' and j.status='new' then
  update public.messenger_jobs set status='active' where id=j.id; msg:='รับงานแล้ว';
 elsif p_action in ('complete_stop','retry_stop') and j.status='active' then
  select * into st from public.messenger_stops where id=p_stop_id and job_id=j.id for update;
  if not found or st.status='done' then raise exception 'Stop unavailable'; end if;
  if p_action='retry_stop' and length(trim(coalesce(p_note,'')))=0 then raise exception 'Reason is required'; end if;
  update public.messenger_stops set status=case when p_action='complete_stop' then 'done' else 'retry' end,
   note=coalesce(p_note,''), completed_at=case when p_action='complete_stop' then now() else null end where id=st.id;
  msg:=case when p_action='complete_stop' then 'สำเร็จ: ' else 'กลับมาทำใหม่: ' end || st.name;
  if length(trim(coalesce(p_note,'')))>0 then msg:=msg || ' · ' || trim(p_note); end if;
  if not exists(select 1 from public.messenger_stops where job_id=j.id and status<>'done') then
   update public.messenger_jobs set status='done',completed_at=now() where id=j.id;
  end if;
 elsif p_action='start_return' and j.status='active' then
  if length(trim(coalesce(p_note,'')))=0 then raise exception 'Reason is required'; end if;
  update public.messenger_jobs set status='returning',return_reason=trim(p_note) where id=j.id;
  msg:='เริ่มคืนเอกสาร · ' || trim(p_note);
 elsif p_action='confirm_return' and j.status='returning' then
  update public.messenger_jobs set status='done',returned_at=now(),completed_at=now() where id=j.id;
  msg:='ยืนยันคืนเอกสารให้ผู้มอบหมายแล้ว (Phase 1 ไม่มีรูปหลักฐาน)';
 else raise exception 'Invalid job transition';
 end if;
 update public.messenger_jobs set version=version+1,updated_at=now() where id=j.id;
 insert into public.messenger_events(job_id,actor_id,message) values(j.id,auth.uid(),msg);
end $$;
create function public.messenger_command(p_job_id uuid, p_action text, p_stop_id uuid default null, p_note text default '', p_expected_version integer default null)
returns void language sql security invoker set search_path='' as $$
 select messenger_private.command(p_job_id,p_action,p_stop_id,p_note,p_expected_version)
$$;

create function messenger_private.reorder(p_stop_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare ids uuid[]; n integer; j record;
begin
 if auth.uid() is null or messenger_private.current_role() is null then raise exception 'Account is not active' using errcode='42501'; end if;
 n:=coalesce(cardinality(p_stop_ids),0);
 if n<2 or n>500 or (select count(distinct v) from unnest(p_stop_ids) v)<>n then raise exception 'Invalid stop list'; end if;
 -- Lock all affected jobs in a deterministic order before validating/mutating.
 for j in select distinct job_id from public.messenger_stops where id=any(p_stop_ids) order by job_id loop
  perform 1 from public.messenger_jobs where id=j.job_id for update;
 end loop;
 select array_agg(s.id) into ids from public.messenger_stops s join public.messenger_jobs j on j.id=s.job_id
 where s.id=any(p_stop_ids) and j.status='active'
 and (j.messenger_id=auth.uid() or messenger_private.current_role() in ('admin','super_user'));
 if coalesce(cardinality(ids),0)<>n then raise exception 'Stops unavailable' using errcode='42501'; end if;
 update public.messenger_stops s set route_position=u.pos from unnest(p_stop_ids) with ordinality u(id,pos) where s.id=u.id;
 for j in select distinct job_id from public.messenger_stops where id=any(p_stop_ids) loop
  update public.messenger_jobs set version=version+1,updated_at=now() where id=j.job_id;
  insert into public.messenger_events(job_id,actor_id,message) values(j.job_id,auth.uid(),'ปรับลำดับจุดรับ–ส่ง');
 end loop;
end $$;
create function public.messenger_reorder(p_stop_ids uuid[]) returns void
language sql security invoker set search_path='' as $$ select messenger_private.reorder(p_stop_ids) $$;

-- Manager-only creation for this phase; anonymous job submission is not exposed.
create function messenger_private.create_job(p_title text,p_requester text,p_department text,p_messenger_id uuid,p_stops jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare jid uuid; item jsonb; pos integer:=0;
begin
 if auth.uid() is null or coalesce(messenger_private.current_role(),'') not in ('admin','super_user') then raise exception 'Manager access required' using errcode='42501'; end if;
 if not exists(select 1 from public.messenger_profiles where id=p_messenger_id and active and role='messenger') then raise exception 'Active messenger required'; end if;
 if jsonb_typeof(p_stops)<>'array' or jsonb_array_length(p_stops) not between 1 and 50 then raise exception '1-50 stops required'; end if;
 insert into public.messenger_jobs(title,requester,department,messenger_id) values(trim(p_title),trim(p_requester),coalesce(trim(p_department),''),p_messenger_id) returning id into jid;
 for item in select * from jsonb_array_elements(p_stops) loop
  pos:=pos+1;
  insert into public.messenger_stops(job_id,name,address,kind,contact,phone,route_position)
  values(jid,trim(item->>'name'),trim(item->>'address'),item->>'kind',coalesce(item->>'contact',''),coalesce(item->>'phone',''),pos);
 end loop;
 insert into public.messenger_events(job_id,actor_id,message) values(jid,auth.uid(),'สร้างและมอบหมายงาน');
 return jid;
end $$;
create function public.messenger_create_job(p_title text,p_requester text,p_department text,p_messenger_id uuid,p_stops jsonb)
returns uuid language sql security invoker set search_path='' as $$ select messenger_private.create_job(p_title,p_requester,p_department,p_messenger_id,p_stops) $$;

revoke all on all functions in schema messenger_private from public, anon, authenticated;
grant execute on function messenger_private.current_role(),messenger_private.can_read_job(uuid),messenger_private.command(uuid,text,uuid,text,integer),messenger_private.reorder(uuid[]),messenger_private.create_job(text,text,text,uuid,jsonb) to authenticated;
revoke all on function public.messenger_command(uuid,text,uuid,text,integer),public.messenger_reorder(uuid[]),public.messenger_create_job(text,text,text,uuid,jsonb) from public,anon;
grant execute on function public.messenger_command(uuid,text,uuid,text,integer),public.messenger_reorder(uuid[]),public.messenger_create_job(text,text,text,uuid,jsonb) to authenticated;

alter publication supabase_realtime add table public.messenger_jobs,public.messenger_stops,public.messenger_events,public.messenger_profiles;
commit;
select 'messenger_core_ready' as result;
