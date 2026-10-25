begin;
alter table public.messenger_jobs add column drive_job_date date;
grant update(drive_job_date) on public.messenger_jobs to service_role;
create or replace function public.messenger_reserve_intake_photo(p_key uuid,p_id uuid,p_stop uuid,p_slot integer,p_sha text,p_mime text,p_bytes integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.messenger_jobs; r messenger_private.intake_requests; u messenger_private.evidence_uploads; point integer; ext text;
begin
 select * into r from messenger_private.intake_requests where request_key=p_key;
 if not found then raise exception 'Unavailable' using errcode='42501'; end if;
 select * into j from public.messenger_jobs where id=r.job_id for update;
 if j.drive_job_date is null then update public.messenger_jobs set drive_job_date=job_date where id=j.id returning * into j; end if;
 select point_number into point from public.messenger_stops where id=p_stop and job_id=j.id;
 if point is null or p_slot is null or p_slot<1 or p_slot>coalesce((r.photo_counts->>(point-1))::integer,0) then raise exception 'Invalid photo slot' using errcode='22023'; end if;
 select * into u from messenger_private.evidence_uploads where id=p_id;
 if found then
  if u.job_id<>j.id or u.stop_id<>p_stop or u.purpose<>'assignment' or u.image_number<>p_slot or u.sha256<>p_sha or u.mime_type<>p_mime or u.byte_size<>p_bytes then raise exception 'Conflict' using errcode='22023'; end if;
  return to_jsonb(u)||jsonb_build_object('job_date',j.drive_job_date,'job_code',j.code,'point_number',point);
 end if;
 if r.created_at<now()-interval '2 hours' or j.status<>'new' or not j.intake_pending then raise exception 'Upload closed' using errcode='42501'; end if;
 if exists(select 1 from messenger_private.evidence_uploads where job_id=j.id and stop_id=p_stop and purpose='assignment' and image_number=p_slot) then raise exception 'Slot conflict' using errcode='22023'; end if;
 ext:=case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
 insert into messenger_private.evidence_uploads(id,actor_id,job_id,stop_id,purpose,drive_file_id,folder_id,sha256,mime_type,byte_size,filename,photo_date,image_number)
 values(p_id,null,j.id,p_stop,'assignment','pending-'||p_id,'11Iyc7T1iJdhRzUOmow_rIUx8bvu8om1O',p_sha,p_mime,p_bytes,j.code||' (จุดที่ '||point||') - '||lpad(p_slot::text,2,'0')||'.'||ext,j.job_date,p_slot) returning * into u;
 return to_jsonb(u)||jsonb_build_object('job_date',j.drive_job_date,'job_code',j.code,'point_number',point);
end $$;
create or replace function public.messenger_reserve_evidence_v2(p_id uuid,p_actor uuid,p_job uuid,p_stop uuid,p_purpose text,p_sha text,p_mime text,p_bytes integer,p_date date) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare u messenger_private.evidence_uploads; j public.messenger_jobs; point integer; n integer; ext text;
begin
 if p_date is null or p_date not between date '0001-01-01' and date '9999-12-31' then raise exception 'Invalid date' using errcode='22023'; end if;
 perform public.messenger_reserve_evidence(p_id,p_actor,p_job,p_stop,p_purpose,'pending-'||p_id,'11Iyc7T1iJdhRzUOmow_rIUx8bvu8om1O',p_sha,p_mime,p_bytes,'pending');
 select * into u from messenger_private.evidence_uploads where id=p_id;
 select * into j from public.messenger_jobs where id=p_job;
 if j.drive_job_date is null then update public.messenger_jobs set drive_job_date=job_date where id=j.id returning * into j; end if;
 select point_number into point from public.messenger_stops where id=p_stop and job_id=p_job;
 if not u.ready and u.photo_date is null then
  select count(*) into n from messenger_private.evidence_uploads where job_id=p_job and stop_id is not distinct from p_stop and purpose=p_purpose;
  ext:=case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
  update messenger_private.evidence_uploads set photo_date=p_date,image_number=n,filename=j.code||' ('||case when p_purpose='return' then 'คืนเอกสาร' else 'จุดที่ '||point end||') - '||lpad(n::text,2,'0')||'.'||ext where id=p_id returning * into u;
 end if;
 return to_jsonb(u)||jsonb_build_object('job_date',j.drive_job_date,'job_code',j.code,'point_number',point);
end $$;
commit;
