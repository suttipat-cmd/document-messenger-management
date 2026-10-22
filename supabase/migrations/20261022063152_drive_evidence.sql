begin;
create table public.messenger_evidence (
 id uuid primary key,
 job_id uuid not null references public.messenger_jobs(id),
 stop_id uuid references public.messenger_stops(id),
 purpose text not null check(purpose in ('stop','return')),
 filename text not null check(length(filename) between 1 and 160),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 byte_size integer not null check(byte_size between 1 and 2097152),
 created_at timestamptz not null default now(),
 check((purpose='stop' and stop_id is not null) or (purpose='return' and stop_id is null))
);
create index messenger_evidence_job_idx on public.messenger_evidence(job_id);
create index messenger_evidence_stop_idx on public.messenger_evidence(stop_id);
alter table public.messenger_evidence enable row level security;
revoke all on public.messenger_evidence from public,anon,authenticated;
grant select on public.messenger_evidence to authenticated;
create policy evidence_read on public.messenger_evidence for select to authenticated using(messenger_private.can_read_job(job_id));
-- Google IDs and upload reservations are never exposed through the Data API.
create table messenger_private.evidence_uploads (
 id uuid primary key,
 actor_id uuid not null references public.messenger_profiles(id),
 job_id uuid not null references public.messenger_jobs(id),
 stop_id uuid references public.messenger_stops(id),
 purpose text not null check(purpose in ('stop','return')),
 drive_file_id text not null unique,
 folder_id text not null,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 byte_size integer not null check(byte_size between 1 and 2097152),
 filename text not null check(length(filename) between 1 and 160),
 ready boolean not null default false,
 created_at timestamptz not null default now(),
 check((purpose='stop' and stop_id is not null) or (purpose='return' and stop_id is null))
);
create index evidence_uploads_job_idx on messenger_private.evidence_uploads(job_id);
create index evidence_uploads_stop_idx on messenger_private.evidence_uploads(stop_id);
create index evidence_uploads_actor_idx on messenger_private.evidence_uploads(actor_id);
alter table messenger_private.evidence_uploads enable row level security;
revoke all on messenger_private.evidence_uploads from public,anon,authenticated;
grant usage on schema messenger_private to service_role;
grant select,insert,update on messenger_private.evidence_uploads to service_role;
grant select,insert on public.messenger_evidence to service_role;

create function public.messenger_reserve_evidence(p_id uuid,p_actor uuid,p_job uuid,p_stop uuid,p_purpose text,p_drive_id text,p_folder text,p_sha text,p_mime text,p_bytes integer,p_name text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.messenger_jobs; u messenger_private.evidence_uploads; n integer;
begin
 select * into j from public.messenger_jobs where id=p_job for update;
 if not found then raise exception 'Job unavailable' using errcode='42501'; end if;
 if not exists(select 1 from public.messenger_profiles where id=p_actor and active and role='messenger') or j.messenger_id<>p_actor then raise exception 'Write denied' using errcode='42501'; end if;
 select * into u from messenger_private.evidence_uploads where id=p_id;
 if found then
  if u.actor_id<>p_actor or u.job_id<>p_job or u.stop_id is distinct from p_stop or u.purpose<>p_purpose or u.sha256<>p_sha or u.mime_type<>p_mime or u.byte_size<>p_bytes then raise exception 'Upload conflict' using errcode='22023'; end if;
  if u.ready then return to_jsonb(u); end if;
 end if;
 if not ((p_purpose='stop' and j.status='active' and exists(select 1 from public.messenger_stops where id=p_stop and job_id=j.id and status<>'done')) or (p_purpose='return' and p_stop is null and j.status='returning')) then raise exception 'Evidence unavailable' using errcode='42501'; end if;
 if u.id is not null then return to_jsonb(u); end if;
 select count(*) into n from messenger_private.evidence_uploads where job_id=p_job and stop_id is not distinct from p_stop and purpose=p_purpose;
 if n>=5 then raise exception 'Five photos per point' using errcode='22023'; end if;
 insert into messenger_private.evidence_uploads(id,actor_id,job_id,stop_id,purpose,drive_file_id,folder_id,sha256,mime_type,byte_size,filename)
 values(p_id,p_actor,p_job,p_stop,p_purpose,p_drive_id,p_folder,p_sha,p_mime,p_bytes,p_name) returning * into u;
 return to_jsonb(u);
end $$;
revoke all on function public.messenger_reserve_evidence(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.messenger_reserve_evidence(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,text) to service_role;

create function public.messenger_finalize_evidence(p_id uuid,p_actor uuid,p_drive_id text) returns void
language plpgsql security invoker set search_path='' as $$
declare j public.messenger_jobs; u messenger_private.evidence_uploads;
begin
 select * into u from messenger_private.evidence_uploads where id=p_id;
 if not found or u.actor_id<>p_actor then raise exception 'Upload unavailable' using errcode='42501'; end if;
 select * into j from public.messenger_jobs where id=u.job_id for update;
 select * into u from messenger_private.evidence_uploads where id=p_id for update;
 if not exists(select 1 from public.messenger_profiles where id=p_actor and active and role='messenger') or j.messenger_id<>p_actor then raise exception 'Write denied' using errcode='42501'; end if;
 if u.ready then
  if u.drive_file_id<>p_drive_id then raise exception 'File conflict' using errcode='22023'; end if;
  return;
 end if;
 if p_drive_id is null or p_drive_id !~ '^[A-Za-z0-9_-]{10,200}$' then raise exception 'Invalid file' using errcode='22023'; end if;
 if not ((u.purpose='stop' and j.status='active' and exists(select 1 from public.messenger_stops where id=u.stop_id and job_id=j.id and status<>'done')) or (u.purpose='return' and j.status='returning')) then raise exception 'Job changed' using errcode='40001'; end if;
 insert into public.messenger_evidence(id,job_id,stop_id,purpose,filename,mime_type,byte_size) values(u.id,u.job_id,u.stop_id,u.purpose,u.filename,u.mime_type,u.byte_size);
 update messenger_private.evidence_uploads set ready=true,drive_file_id=p_drive_id where id=u.id;
 insert into public.messenger_events(job_id,actor_id,message) values(j.id,p_actor,'แนบรูปหลักฐาน' || case when u.purpose='return' then 'การคืนเอกสาร' else 'ที่จุดรับ–ส่ง' end);
end $$;
revoke all on function public.messenger_finalize_evidence(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.messenger_finalize_evidence(uuid,uuid,text) to service_role;
-- Read mapping only after a caller-scoped RLS check in the Edge Function.
create function public.messenger_evidence_file(p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select to_jsonb(u) from messenger_private.evidence_uploads u where id=p_id and ready $$;
revoke all on function public.messenger_evidence_file(uuid) from public,anon,authenticated;
grant execute on function public.messenger_evidence_file(uuid) to service_role;
commit;
