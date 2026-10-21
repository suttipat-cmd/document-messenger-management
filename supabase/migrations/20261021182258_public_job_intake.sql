begin;
alter table public.messenger_jobs add column requester_phone text not null default '' check(length(requester_phone)<=40);
create table messenger_private.intake_requests (
 request_key uuid primary key,
 payload_hash text not null,
 job_id uuid not null references public.messenger_jobs(id),
 created_at timestamptz not null default now()
);
create index on messenger_private.intake_requests(job_id);
create table messenger_private.intake_limits (
 bucket text primary key,
 window_start timestamptz not null,
 used integer not null
);
alter table messenger_private.intake_requests enable row level security;
alter table messenger_private.intake_limits enable row level security;
revoke all on messenger_private.intake_requests,messenger_private.intake_limits from public,anon,authenticated;
grant usage on schema messenger_private to service_role;
create function messenger_private.intake_options() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',display_name) order by display_name,id),'[]'::jsonb)
 from public.messenger_profiles where role='messenger' and active
$$;
create function public.messenger_intake_options() returns jsonb language sql security invoker set search_path='' as $$select messenger_private.intake_options()$$;
create function messenger_private.intake_submit(p_key uuid,p_payload jsonb,p_bucket text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare jid uuid; result_code text; stored_hash text; payload_hash text; mid uuid; item jsonb; pos integer; b text; used_count integer; cutoff timestamptz; lim integer;
begin
 if p_key is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or length(coalesce(p_bucket,'')) not between 16 and 128 then raise exception 'Invalid request' using errcode='22023'; end if;
 if jsonb_typeof(p_payload->'title') is distinct from 'string' or length(trim(p_payload->>'title')) not between 1 and 200
 or jsonb_typeof(p_payload->'requester') is distinct from 'string' or length(trim(p_payload->>'requester')) not between 1 and 120
 or jsonb_typeof(p_payload->'requesterPhone') is distinct from 'string' or length(trim(p_payload->>'requesterPhone')) not between 5 and 40
 or jsonb_typeof(p_payload->'department') is distinct from 'string' or length(p_payload->>'department')>120
 or jsonb_typeof(p_payload->'stops') is distinct from 'array' then raise exception 'Invalid fields' using errcode='22023'; end if;
 if jsonb_array_length(p_payload->'stops') not between 1 and 20 then raise exception '1-20 stops required' using errcode='22023'; end if;
 for item in select * from jsonb_array_elements(p_payload->'stops') loop
  if jsonb_typeof(item->'name') is distinct from 'string' or length(trim(item->>'name')) not between 1 and 200
  or jsonb_typeof(item->'address') is distinct from 'string' or length(trim(item->>'address')) not between 1 and 1000
  or coalesce(item->>'kind','') not in ('รับเอกสาร','ส่งเอกสาร')
  or jsonb_typeof(item->'contact') is distinct from 'string' or length(item->>'contact')>120
  or jsonb_typeof(item->'phone') is distinct from 'string' or length(item->>'phone')>40 then raise exception 'Invalid stop' using errcode='22023'; end if;
 end loop;
 payload_hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,42));
 select r.job_id,r.payload_hash into jid,stored_hash from messenger_private.intake_requests r where r.request_key=p_key;
 if found then
  if stored_hash<>payload_hash then raise exception 'Request key conflict' using errcode='P0409'; end if;
  select code into result_code from public.messenger_jobs where id=jid;
  return jsonb_build_object('code',result_code);
 end if;
 mid:=(p_payload->>'messengerId')::uuid;
 perform 1 from public.messenger_profiles where id=mid and role='messenger' and active for share;
 if not found then raise exception 'Messenger unavailable' using errcode='P0404'; end if;
 -- Basic anonymous abuse controls without another paid service. A hashed IP is
 -- a best-effort signal; global caps also apply regardless of proxy headers.
 foreach b in array array['global:ten','global:day','ip:'||p_bucket] loop
  cutoff:=case when b='global:day' then (date_trunc('day',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok') else to_timestamp(floor(extract(epoch from now())/600)*600) end;
  lim:=case when b='global:day' then 300 when b='global:ten' then 60 else 30 end;
  insert into messenger_private.intake_limits(bucket,window_start,used) values(b,cutoff,1)
  on conflict(bucket) do update set window_start=excluded.window_start,used=case when intake_limits.window_start=excluded.window_start then intake_limits.used+1 else 1 end
  returning used into used_count;
  if used_count>lim then raise exception 'Submission limit reached' using errcode='P0429'; end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('messenger-route:'||mid::text,42));
 insert into public.messenger_jobs(title,requester,requester_phone,department,messenger_id)
 values(trim(p_payload->>'title'),trim(p_payload->>'requester'),trim(p_payload->>'requesterPhone'),trim(p_payload->>'department'),mid) returning id,code into jid,result_code;
 select coalesce(max(s.route_position),0) into pos from public.messenger_stops s join public.messenger_jobs j on j.id=s.job_id where j.messenger_id=mid;
 for item in select * from jsonb_array_elements(p_payload->'stops') loop
  pos:=pos+1;
  insert into public.messenger_stops(job_id,name,address,kind,contact,phone,route_position)
  values(jid,trim(item->>'name'),trim(item->>'address'),item->>'kind',trim(item->>'contact'),trim(item->>'phone'),pos);
 end loop;
 insert into public.messenger_events(job_id,actor_id,message) values(jid,null,'สร้างงานผ่านฟอร์มสาธารณะ');
 insert into messenger_private.intake_requests(request_key,payload_hash,job_id) values(p_key,payload_hash,jid);
 delete from messenger_private.intake_limits where window_start<now()-interval '2 days';
 return jsonb_build_object('code',result_code);
end $$;
create function public.messenger_intake_submit(p_key uuid,p_payload jsonb,p_bucket text) returns jsonb
language sql security invoker set search_path='' as $$select messenger_private.intake_submit(p_key,p_payload,p_bucket)$$;
revoke all on function messenger_private.intake_options(),messenger_private.intake_submit(uuid,jsonb,text),public.messenger_intake_options(),public.messenger_intake_submit(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function messenger_private.intake_options(),messenger_private.intake_submit(uuid,jsonb,text),public.messenger_intake_options(),public.messenger_intake_submit(uuid,jsonb,text) to service_role;
commit;
select 'public_intake_ready' as result;
