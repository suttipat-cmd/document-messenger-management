begin;
alter table public.messenger_jobs add column intake_pending boolean not null default false;
alter table messenger_private.intake_requests add column photo_counts jsonb not null default '[]';
grant select on messenger_private.intake_requests to service_role;
alter table public.messenger_stops add column point_number integer;
with ordered as (select id,row_number() over(partition by job_id order by route_position,id) n from public.messenger_stops)
update public.messenger_stops s set point_number=o.n from ordered o where o.id=s.id;
alter table public.messenger_stops alter column point_number set not null;
create unique index messenger_stop_point_number on public.messenger_stops(job_id,point_number);
create function messenger_private.assign_point_number() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.point_number is null then select coalesce(max(point_number),0)+1 into new.point_number from public.messenger_stops where job_id=new.job_id; end if;
 return new;
end $$;
create trigger assign_point_number before insert on public.messenger_stops for each row execute function messenger_private.assign_point_number();
create function messenger_private.prevent_incomplete_intake() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.status='new' and new.status<>'new' and old.intake_pending and old.created_at>now()-interval '2 hours' then raise exception 'กำลังบันทึกภาพผู้มอบหมาย กรุณารอสักครู่' using errcode='40001'; end if;
 return new;
end $$;
create trigger prevent_incomplete_intake before update of status on public.messenger_jobs for each row execute function messenger_private.prevent_incomplete_intake();
alter table public.messenger_evidence drop constraint messenger_evidence_purpose_check, drop constraint messenger_evidence_check;
alter table messenger_private.evidence_uploads drop constraint evidence_uploads_purpose_check, drop constraint evidence_uploads_check;
alter table public.messenger_evidence add check(purpose in ('stop','return','assignment')), add check((purpose in ('stop','assignment') and stop_id is not null) or (purpose='return' and stop_id is null)), add column photo_date date;
alter table messenger_private.evidence_uploads alter column actor_id drop not null;
alter table messenger_private.evidence_uploads add check(purpose in ('stop','return','assignment')), add check((purpose in ('stop','assignment') and stop_id is not null) or (purpose='return' and stop_id is null)), add column photo_date date, add column image_number integer;
alter table public.messenger_evidence add check(photo_date between date '0001-01-01' and date '9999-12-31');
alter table messenger_private.evidence_uploads add check(photo_date between date '0001-01-01' and date '9999-12-31');
-- Old records retain their original Google locations, filenames and dates.
create or replace function messenger_private.intake_submit(p_key uuid,p_payload jsonb,p_bucket text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare jid uuid; result_code text; stored_hash text; payload_hash text; mid uuid; item jsonb; pos integer; b text; used_count integer; cutoff timestamptz; lim integer;
begin
 if p_key is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or length(coalesce(p_bucket,'')) not between 16 and 128 then raise exception 'Invalid request' using errcode='22023'; end if;
 if jsonb_typeof(p_payload->'title') is distinct from 'string' or length(trim(p_payload->>'title')) not between 1 and 200
 or jsonb_typeof(p_payload->'requester') is distinct from 'string' or length(trim(p_payload->>'requester')) not between 1 and 120
 or jsonb_typeof(p_payload->'requesterPhone') is distinct from 'string' or length(trim(p_payload->>'requesterPhone'))>40
 or jsonb_typeof(p_payload->'department') is distinct from 'string' or length(p_payload->>'department')>120
 or jsonb_typeof(p_payload->'stops') is distinct from 'array' then raise exception 'Invalid fields' using errcode='22023'; end if;
 if jsonb_array_length(p_payload->'stops') not between 1 and 20 then raise exception '1-20 stops required' using errcode='22023'; end if;
 for item in select * from jsonb_array_elements(p_payload->'stops') loop
  if jsonb_typeof(item->'name') is distinct from 'string' or length(trim(item->>'name')) not between 1 and 200
  or jsonb_typeof(item->'address') is distinct from 'string' or length(trim(item->>'address'))>1000
  or coalesce(item->>'kind','') not in ('รับเอกสาร','ส่งเอกสาร')
  or jsonb_typeof(item->'contact') is distinct from 'string' or length(item->>'contact')>120
  or jsonb_typeof(item->'phone') is distinct from 'string' or length(item->>'phone')>40 then raise exception 'Invalid stop' using errcode='22023'; end if;
 end loop;
 if p_payload ? 'photoCounts' then
  if jsonb_typeof(p_payload->'photoCounts')<>'array' or jsonb_array_length(p_payload->'photoCounts')<>jsonb_array_length(p_payload->'stops') then raise exception 'Invalid photo counts' using errcode='22023'; end if;
  for item in select * from jsonb_array_elements(p_payload->'photoCounts') loop
   if item::text !~ '^[0-5]$' then raise exception 'Five photos per stop' using errcode='22023'; end if;
  end loop;
 end if;
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
 insert into public.messenger_jobs(title,requester,requester_phone,department,messenger_id,job_date,intake_pending)
 values(trim(p_payload->>'title'),trim(p_payload->>'requester'),trim(p_payload->>'requesterPhone'),trim(p_payload->>'department'),mid,coalesce((p_payload->>'jobDate')::date,(now() at time zone 'Asia/Bangkok')::date),exists(select 1 from jsonb_array_elements(coalesce(p_payload->'photoCounts','[]'::jsonb)) x where x::text::integer>0)) returning id,code into jid,result_code;
 select coalesce(max(s.route_position),0) into pos from public.messenger_stops s join public.messenger_jobs j on j.id=s.job_id where j.messenger_id=mid;
 for item in select * from jsonb_array_elements(p_payload->'stops') loop
  pos:=pos+1;
  insert into public.messenger_stops(job_id,name,address,kind,contact,phone,route_position)
  values(jid,trim(item->>'name'),trim(item->>'address'),item->>'kind',trim(item->>'contact'),trim(item->>'phone'),pos);
 end loop;
 insert into public.messenger_events(job_id,actor_id,message) values(jid,null,'สร้างงานผ่านฟอร์มสาธารณะ');
 insert into messenger_private.intake_requests(request_key,payload_hash,job_id,photo_counts) values(p_key,payload_hash,jid,coalesce(p_payload->'photoCounts','[]'::jsonb));
 delete from messenger_private.intake_limits where window_start<now()-interval '2 days';
 return jsonb_build_object('code',result_code);
end $$;


-- Service-only context: never exposes this lookup to anonymous clients.
create function public.messenger_intake_photo_context(p_key uuid) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('jobId',j.id,'code',j.code,'jobDate',j.job_date,'pending',j.intake_pending,'open',r.created_at>now()-interval '2 hours' and j.status='new','counts',r.photo_counts,'stops',(select jsonb_agg(jsonb_build_object('id',s.id,'point',s.point_number) order by s.point_number) from public.messenger_stops s where s.job_id=j.id))
 from messenger_private.intake_requests r join public.messenger_jobs j on j.id=r.job_id where r.request_key=p_key
$$;
revoke all on function public.messenger_intake_photo_context(uuid) from public,anon,authenticated;
grant execute on function public.messenger_intake_photo_context(uuid) to service_role;

create function public.messenger_reserve_intake_photo(p_key uuid,p_id uuid,p_stop uuid,p_slot integer,p_sha text,p_mime text,p_bytes integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.messenger_jobs; r messenger_private.intake_requests; u messenger_private.evidence_uploads; point integer; ext text;
begin
 select * into r from messenger_private.intake_requests where request_key=p_key;
 if not found then raise exception 'Unavailable' using errcode='42501'; end if;
 select * into j from public.messenger_jobs where id=r.job_id for update;
 select point_number into point from public.messenger_stops where id=p_stop and job_id=j.id;
 if point is null or p_slot is null or p_slot<1 or p_slot>coalesce((r.photo_counts->>(point-1))::integer,0) then raise exception 'Invalid photo slot' using errcode='22023'; end if;
 select * into u from messenger_private.evidence_uploads where id=p_id;
 if found then
  if u.job_id<>j.id or u.stop_id<>p_stop or u.purpose<>'assignment' or u.image_number<>p_slot or u.sha256<>p_sha or u.mime_type<>p_mime or u.byte_size<>p_bytes then raise exception 'Conflict' using errcode='22023'; end if;
  return to_jsonb(u)||jsonb_build_object('job_date',j.job_date,'job_code',j.code,'point_number',point);
 end if;
 if r.created_at<now()-interval '2 hours' or j.status<>'new' or not j.intake_pending then raise exception 'Upload closed' using errcode='42501'; end if;
 if exists(select 1 from messenger_private.evidence_uploads where job_id=j.id and stop_id=p_stop and purpose='assignment' and image_number=p_slot) then raise exception 'Slot conflict' using errcode='22023'; end if;
 ext:=case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
 insert into messenger_private.evidence_uploads(id,actor_id,job_id,stop_id,purpose,drive_file_id,folder_id,sha256,mime_type,byte_size,filename,photo_date,image_number)
 values(p_id,null,j.id,p_stop,'assignment','pending-'||p_id,'11Iyc7T1iJdhRzUOmow_rIUx8bvu8om1O',p_sha,p_mime,p_bytes,j.code||' (จุดที่ '||point||') - '||lpad(p_slot::text,2,'0')||'.'||ext,j.job_date,p_slot) returning * into u;
 return to_jsonb(u)||jsonb_build_object('job_date',j.job_date,'job_code',j.code,'point_number',point);
end $$;
create function public.messenger_finalize_intake_photo(p_key uuid,p_id uuid,p_drive_id text) returns void language plpgsql security invoker set search_path='' as $$
declare j public.messenger_jobs; u messenger_private.evidence_uploads;
begin
 select j0.* into j from messenger_private.intake_requests r join public.messenger_jobs j0 on j0.id=r.job_id where r.request_key=p_key and r.created_at>now()-interval '2 hours' for update of j0;
 select * into u from messenger_private.evidence_uploads where id=p_id for update;
 if j.id is null or u.id is null or u.job_id<>j.id or u.purpose<>'assignment' then raise exception 'Unavailable' using errcode='42501'; end if;
 if u.ready then
  if u.drive_file_id<>p_drive_id then raise exception 'Conflict' using errcode='22023'; end if;
  return;
 end if;
 if j.status<>'new' or not j.intake_pending or p_drive_id !~ '^[A-Za-z0-9_-]{10,200}$' then raise exception 'Upload closed' using errcode='42501'; end if;
 insert into public.messenger_evidence(id,job_id,stop_id,purpose,filename,mime_type,byte_size,photo_date) values(u.id,u.job_id,u.stop_id,u.purpose,u.filename,u.mime_type,u.byte_size,u.photo_date);
 update messenger_private.evidence_uploads set ready=true,drive_file_id=p_drive_id where id=u.id;
end $$;
create function public.messenger_finish_intake_photos(p_key uuid) returns void language plpgsql security invoker set search_path='' as $$
declare j public.messenger_jobs; r messenger_private.intake_requests; expected integer; actual integer;
begin
 select * into r from messenger_private.intake_requests where request_key=p_key;
 select * into j from public.messenger_jobs where id=r.job_id for update;
 if j.id is null then raise exception 'Unavailable' using errcode='42501'; end if;
 if not j.intake_pending then return; end if;
 select coalesce(sum(value::text::integer),0) into expected from jsonb_array_elements(r.photo_counts);
 select count(*) into actual from public.messenger_evidence where job_id=j.id and purpose='assignment';
 if actual<>expected then raise exception 'Photos incomplete' using errcode='22023'; end if;
 update public.messenger_jobs set intake_pending=false where id=j.id;
 insert into public.messenger_events(job_id,actor_id,message) values(j.id,null,'แนบภาพผู้มอบหมายครบแล้ว '||actual||' ภาพ');
end $$;
grant update(intake_pending) on public.messenger_jobs to service_role;
revoke all on function public.messenger_reserve_intake_photo(uuid,uuid,uuid,integer,text,text,integer),public.messenger_finalize_intake_photo(uuid,uuid,text),public.messenger_finish_intake_photos(uuid) from public,anon,authenticated;
grant execute on function public.messenger_reserve_intake_photo(uuid,uuid,uuid,integer,text,text,integer),public.messenger_finalize_intake_photo(uuid,uuid,text),public.messenger_finish_intake_photos(uuid) to service_role;

create function public.messenger_reserve_evidence_v2(p_id uuid,p_actor uuid,p_job uuid,p_stop uuid,p_purpose text,p_sha text,p_mime text,p_bytes integer,p_date date) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare u messenger_private.evidence_uploads; j public.messenger_jobs; point integer; n integer; ext text;
begin
 if p_date is null or p_date not between date '0001-01-01' and date '9999-12-31' then raise exception 'Invalid date' using errcode='22023'; end if;
 perform public.messenger_reserve_evidence(p_id,p_actor,p_job,p_stop,p_purpose,'pending-'||p_id,'11Iyc7T1iJdhRzUOmow_rIUx8bvu8om1O',p_sha,p_mime,p_bytes,'pending');
 select * into u from messenger_private.evidence_uploads where id=p_id;
 select * into j from public.messenger_jobs where id=p_job;
 select point_number into point from public.messenger_stops where id=p_stop and job_id=p_job;
 if not u.ready and u.photo_date is null then
  select count(*) into n from messenger_private.evidence_uploads where job_id=p_job and stop_id is not distinct from p_stop and purpose=p_purpose;
  ext:=case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
  update messenger_private.evidence_uploads set photo_date=p_date,image_number=n,filename=j.code||' ('||case when p_purpose='return' then 'คืนเอกสาร' else 'จุดที่ '||point end||') - '||lpad(n::text,2,'0')||'.'||ext where id=p_id returning * into u;
 end if;
 return to_jsonb(u)||jsonb_build_object('job_date',j.job_date,'job_code',j.code,'point_number',point);
end $$;
revoke all on function public.messenger_reserve_evidence_v2(uuid,uuid,uuid,uuid,text,text,text,integer,date) from public,anon,authenticated;
grant execute on function public.messenger_reserve_evidence_v2(uuid,uuid,uuid,uuid,text,text,text,integer,date) to service_role;
-- Populate the selected date alongside the existing atomic finalization.
create function messenger_private.copy_evidence_date() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 select photo_date into new.photo_date from messenger_private.evidence_uploads where id=new.id;
 return new;
end $$;
create trigger copy_evidence_date before insert on public.messenger_evidence for each row execute function messenger_private.copy_evidence_date();
commit;
