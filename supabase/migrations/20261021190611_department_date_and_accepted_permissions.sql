begin;
create table messenger_private.departments(name text primary key);
alter table messenger_private.departments enable row level security;
revoke all on messenger_private.departments from public,anon,authenticated;
insert into messenger_private.departments(name) values
('ขนส่ง'),
('ขายและการตลาด'),
('ความปลอดภัย'),
('จัดส่ง (กรุงเทพ-ปริมณฑล)'),
('จัดส่ง (ขอนแก่น)'),
('จัดส่ง (สระบุรี)'),
('จัดส่ง LLC - กิ่งแก้วเงินสด (สำนักงานใหญ่)'),
('จัดส่ง TL - ส่วนกลาง (สำนักงานใหญ่)'),
('จัดส่ง ตะวันออก'),
('จัดส่ง สำนักงาน (กรุงเทพ-ปริมณฑล)'),
('จัดส่ง สำนักงาน (ขอนแก่น)'),
('จัดส่ง สำนักงาน (ตะวันออก)'),
('จัดส่ง สำนักงาน (วังน้อย)'),
('จัดส่ง สำนักงาน (สระบุรี)'),
('ซ่อมบำรุง'),
('ซ่อมบำรุง (อู่42-เฉลิมพระเกียรติ ร.9)'),
('ซ่อมบำรุง (อู่ขอนแก่น)'),
('ซ่อมบำรุง (อู่หินกอง)'),
('ทรัพยากรบุคคล'),
('บริหาร'),
('บัญชี'),
('บัญชี-การเงิน'),
('บุคคลและธุรการ'),
('ฝ่ายควบคุมระบบคุณภาพ'),
('ฝ่ายบริหารทั่วไป'),
('พัฒนาซอฟต์แวร์'),
('พัฒนาธุรกิจ'),
('สนับสนุน'),
('แรงงาน (คนพิการ)'),
('โปรแกรมเมอร์');
alter table public.messenger_jobs add column job_date date;
update public.messenger_jobs set job_date=(created_at at time zone 'Asia/Bangkok')::date;
alter table public.messenger_jobs alter column job_date set default ((now() at time zone 'Asia/Bangkok')::date), alter column job_date set not null;
alter table public.messenger_stops drop constraint messenger_stops_address_check;
alter table public.messenger_stops add constraint messenger_stops_address_check check(length(address)<=1000);
create function messenger_private.validate_job_fields() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from messenger_private.departments where name=new.department) then raise exception 'Choose a listed department' using errcode='22023'; end if;
 return new;
end $$;
revoke all on function messenger_private.validate_job_fields() from public,anon,authenticated;
create trigger validate_job_fields before insert on public.messenger_jobs for each row execute function messenger_private.validate_job_fields();
create or replace function messenger_private.command(p_job_id uuid, p_action text, p_stop_id uuid, p_note text, p_expected_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.messenger_jobs; st public.messenger_stops; msg text; r text;
begin
 r:=messenger_private.current_role();
 if auth.uid() is null or r is null then raise exception 'Account is not active' using errcode='42501'; end if;
 select * into j from public.messenger_jobs where id=p_job_id for update;
 if not found or not (j.messenger_id=auth.uid() or r in ('admin','super_user')) then raise exception 'Job unavailable' using errcode='42501'; end if;
 if r in ('admin','super_user') and j.status<>'new' then raise exception 'Accepted jobs are read only for managers' using errcode='42501'; end if;
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
  msg:='ยืนยันคืนเอกสารให้ผู้มอบหมายแล้ว';
 else raise exception 'Invalid job transition';
 end if;
 update public.messenger_jobs set version=version+1,updated_at=now() where id=j.id;
 insert into public.messenger_events(job_id,actor_id,message) values(j.id,auth.uid(),msg);
end $$;
-- Correct the PL/pgSQL record name that shadowed the SQL table alias.
create or replace function messenger_private.reorder(p_stop_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare ids uuid[]; n integer; v_job record;
begin
 if auth.uid() is null or messenger_private.current_role() is null then raise exception 'Account is not active' using errcode='42501'; end if;
 n:=coalesce(cardinality(p_stop_ids),0);
 if n<2 or n>500 or (select count(distinct v) from unnest(p_stop_ids) v)<>n then raise exception 'Invalid stop list'; end if;
 -- Lock all affected jobs in a deterministic order before validating/mutating.
 for v_job in select distinct job_id from public.messenger_stops where id=any(p_stop_ids) order by job_id loop
  perform 1 from public.messenger_jobs where id=v_job.job_id for update;
 end loop;
 select array_agg(s.id) into ids from public.messenger_stops s join public.messenger_jobs j on j.id=s.job_id
 where s.id=any(p_stop_ids) and j.status='active'
 and j.messenger_id=auth.uid() and messenger_private.current_role()='messenger';
 if coalesce(cardinality(ids),0)<>n then raise exception 'Stops unavailable' using errcode='42501'; end if;
 update public.messenger_stops s set route_position=u.pos from unnest(p_stop_ids) with ordinality u(id,pos) where s.id=u.id;
 for v_job in select distinct job_id from public.messenger_stops where id=any(p_stop_ids) loop
  update public.messenger_jobs set version=version+1,updated_at=now() where id=v_job.job_id;
  insert into public.messenger_events(job_id,actor_id,message) values(v_job.job_id,auth.uid(),'ปรับลำดับจุดรับ–ส่ง');
 end loop;
end $$;

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
 insert into public.messenger_jobs(title,requester,requester_phone,department,messenger_id,job_date)
 values(trim(p_payload->>'title'),trim(p_payload->>'requester'),trim(p_payload->>'requesterPhone'),trim(p_payload->>'department'),mid,coalesce((p_payload->>'jobDate')::date,(now() at time zone 'Asia/Bangkok')::date)) returning id,code into jid,result_code;
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

-- Keep the original signature compatible; the new form sends date and optional phone.
create function public.messenger_create_job(p_title text,p_requester text,p_department text,p_messenger_id uuid,p_stops jsonb,p_job_date date,p_requester_phone text) returns uuid
language plpgsql security invoker set search_path='' as $$
begin return messenger_private.create_job_dated(p_title,p_requester,p_department,p_messenger_id,p_stops,p_job_date,p_requester_phone); end $$;
create function messenger_private.create_job_dated(p_title text,p_requester text,p_department text,p_messenger_id uuid,p_stops jsonb,p_job_date date,p_requester_phone text) returns uuid
language plpgsql security definer set search_path='' as $$
declare jid uuid;
begin
 if p_job_date is null or p_requester_phone is null or length(p_requester_phone)>40 then raise exception 'Invalid fields' using errcode='22023'; end if;
 jid:=messenger_private.create_job(p_title,p_requester,p_department,p_messenger_id,p_stops);
 update public.messenger_jobs set job_date=p_job_date,requester_phone=trim(p_requester_phone) where id=jid;
 return jid;
end $$;
revoke all on function public.messenger_create_job(text,text,text,uuid,jsonb,date,text),messenger_private.create_job_dated(text,text,text,uuid,jsonb,date,text) from public,anon;
grant execute on function public.messenger_create_job(text,text,text,uuid,jsonb,date,text),messenger_private.create_job_dated(text,text,text,uuid,jsonb,date,text) to authenticated;
commit;
