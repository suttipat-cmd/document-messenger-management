begin;
do $$
declare m uuid; k uuid:=gen_random_uuid(); context jsonb; jid uuid; sid uuid; eid uuid:=gen_random_uuid(); r jsonb; rider uuid:=gen_random_uuid(); count_rows integer; idx integer;
begin
 select id into m from public.messenger_profiles where active and role='messenger' limit 1;
 if has_function_privilege('anon','public.messenger_intake_photo_context(uuid)','execute') or has_function_privilege('authenticated','public.messenger_reserve_intake_photo(uuid,uuid,uuid,integer,text,text,integer)','execute') then raise exception 'Capability functions exposed'; end if;
 set local role service_role;
 perform public.messenger_intake_submit(k,jsonb_build_object('title','Photo rollback QA','requester','QA','requesterPhone','','department','โปรแกรมเมอร์','messengerId',m,'jobDate','2026-10-12','photoCounts',jsonb_build_array(1),'stops',jsonb_build_array(jsonb_build_object('name','QA','address','','kind','รับเอกสาร','contact','','phone',''))),repeat('a',64));
 context:=public.messenger_intake_photo_context(k);jid:=(context->>'jobId')::uuid;sid:=(context->'stops'->0->>'id')::uuid;
 if context->>'jobDate'<>'2026-10-12' or not (context->>'pending')::boolean then raise exception 'Date or pending flag failed'; end if;
 begin
  perform public.messenger_finish_intake_photos(k);raise exception 'Incomplete submission finished';
 exception when invalid_parameter_value then null;end;
 r:=public.messenger_reserve_intake_photo(k,eid,sid,1,repeat('a',64),'image/jpeg',100);
 if r->>'filename'<>(context->>'code')||' (จุดที่ 1) - 01.jpg' then raise exception 'Filename failed';end if;
 perform public.messenger_reserve_intake_photo(k,eid,sid,1,repeat('a',64),'image/jpeg',100);
 begin
  perform public.messenger_reserve_intake_photo(k,gen_random_uuid(),sid,6,repeat('a',64),'image/jpeg',100);raise exception 'Sixth accepted';
 exception when invalid_parameter_value then null;end;
 begin
  perform public.messenger_reserve_intake_photo(gen_random_uuid(),gen_random_uuid(),sid,1,repeat('a',64),'image/jpeg',100);raise exception 'Foreign request accepted';
 exception when insufficient_privilege then null;end;
 perform public.messenger_finalize_intake_photo(k,eid,'qa_assignment_file_123');
 perform public.messenger_finalize_intake_photo(k,eid,'qa_assignment_file_123');
 select count(*) into count_rows from public.messenger_evidence where job_id=jid;
 if count_rows<>1 then raise exception 'Duplicate evidence';end if;
 reset role;
 begin
  update public.messenger_jobs set status='active' where id=jid;raise exception 'Accepted incomplete intake';
 exception when serialization_failure then null;end;
 set local role service_role;
 perform public.messenger_finish_intake_photos(k);
 reset role;
 update public.messenger_jobs set job_date=date '2026-10-14',status='active' where id=jid;
 set local role service_role;
 r:=public.messenger_reserve_evidence_v2(rider,m,jid,sid,'stop',repeat('b',64),'image/jpeg',100,date '2026-10-13');
 if r->>'job_date'<>'2026-10-12' or r->>'photo_date'<>'2026-10-13' then raise exception 'Rider changed root date';end if;
 if r->>'filename'<>(context->>'code')||' (จุดที่ 1) - 01.jpg' then raise exception 'Rider filename failed';end if;
 perform public.messenger_finalize_evidence(rider,m,'qa_rider_file_123456');
 if (select photo_date from public.messenger_evidence where id=rider)<>date '2026-10-13' then raise exception 'Date not published';end if;
 for idx in 2..5 loop perform public.messenger_reserve_evidence_v2(gen_random_uuid(),m,jid,sid,'stop',repeat('c',64),'image/jpeg',100,date '2026-10-13'); end loop;
 begin
  perform public.messenger_reserve_evidence_v2(gen_random_uuid(),m,jid,sid,'stop',repeat('d',64),'image/jpeg',100,date '2026-10-13');raise exception 'Sixth rider photo accepted';
 exception when invalid_parameter_value then null;end;
 reset role;
end $$;
rollback;
select 'assignment photos, capability grants, idempotency and separate rider date passed' as result;
