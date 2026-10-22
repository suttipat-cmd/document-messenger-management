-- All fixtures and monthly counters roll back. No Google files are created.
begin;
do $$
declare m uuid; other uuid; adm uuid; jid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); eid uuid:=gen_random_uuid(); result jsonb; n integer;
begin
 select id into m from public.messenger_profiles where active and role='messenger' order by id limit 1;
 select id into other from public.messenger_profiles where active and role='messenger' and id<>m limit 1;
 select id into adm from public.messenger_profiles where active and role='admin' limit 1;
 if m is null or other is null or adm is null then raise exception 'Need existing admin and two Messengers'; end if;
 if has_table_privilege('anon','public.messenger_evidence','select') or has_table_privilege('authenticated','public.messenger_evidence','insert') or has_schema_privilege('authenticated','messenger_private','create') or has_function_privilege('authenticated','public.messenger_evidence_file(uuid)','execute') or has_function_privilege('anon','public.messenger_reserve_evidence(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,text)','execute') then raise exception 'Unexpected grant'; end if;
 insert into public.messenger_jobs(id,title,requester,department,messenger_id,status) values(jid,'QA rollback only','QA','โปรแกรมเมอร์',m,'active');
 insert into public.messenger_stops(id,job_id,name,address,kind) values(sid,jid,'QA','QA','ส่งเอกสาร');
 set local role service_role;
 result:=public.messenger_reserve_evidence(eid,m,jid,sid,'stop','pending-'||eid,'folder',repeat('a',64),'image/jpeg',100,'QA.jpg');
 if (result->>'ready')::boolean then raise exception 'Premature ready'; end if;
 perform public.messenger_reserve_evidence(eid,m,jid,sid,'stop','pending-'||eid,'folder',repeat('a',64),'image/jpeg',100,'QA.jpg');
 begin
  perform public.messenger_reserve_evidence(eid,other,jid,sid,'stop','pending-'||eid,'folder',repeat('a',64),'image/jpeg',100,'QA.jpg');
  raise exception 'Other Messenger accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.messenger_reserve_evidence(gen_random_uuid(),adm,jid,sid,'stop','other-file','folder',repeat('a',64),'image/jpeg',100,'QA.jpg');
  raise exception 'Admin wrote accepted job';
 exception when insufficient_privilege then null; end;
 begin
  perform public.messenger_reserve_evidence(eid,m,jid,sid,'stop','pending-'||eid,'folder',repeat('b',64),'image/jpeg',100,'QA.jpg');
  raise exception 'Conflicting retry accepted';
 exception when invalid_parameter_value then null; end;
 perform public.messenger_finalize_evidence(eid,m,'qa_file_id_123456789');
 perform public.messenger_finalize_evidence(eid,m,'qa_file_id_123456789');
 select count(*) into n from public.messenger_evidence where job_id=jid;
 if n<>1 then raise exception 'Idempotency failed'; end if;
 reset role;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated')::text,true);
 set local role authenticated;
 select count(*) into n from public.messenger_evidence where job_id=jid;
 if n<>1 then raise exception 'Owner read denied'; end if;
 reset role;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other,'role','authenticated')::text,true);
 set local role authenticated;
 select count(*) into n from public.messenger_evidence where job_id=jid;
 if n<>0 then raise exception 'Other Messenger read evidence'; end if;
 reset role;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',adm,'role','authenticated')::text,true);
 set local role authenticated;
 select count(*) into n from public.messenger_evidence where job_id=jid;
 if n<>1 then raise exception 'Manager read denied'; end if;
 reset role;
 update public.messenger_jobs set status='done' where id=jid;
 begin
  perform public.messenger_reserve_evidence(gen_random_uuid(),m,jid,sid,'stop','new-file','folder',repeat('a',64),'image/jpeg',100,'QA.jpg');
  raise exception 'Completed job accepted upload';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'drive evidence authorization and idempotency passed' as result;
