begin;
with u as(insert into auth.users(id,email) values(gen_random_uuid(),'fields-driver-qa@example.invalid') returning id) select set_config('qa.driver',(select id::text from u),true);
with u as(insert into auth.users(id,email) values(gen_random_uuid(),'fields-manager-qa@example.invalid') returning id) select set_config('qa.manager',(select id::text from u),true);
update public.messenger_profiles set active=true where id=current_setting('qa.driver')::uuid;
update public.messenger_profiles set active=true,role='admin' where id=current_setting('qa.manager')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.manager'),true);
select set_config('qa.job',public.messenger_create_job('Fields QA','QA','บัญชี',current_setting('qa.driver')::uuid,'[{"name":"First","address":"","kind":"รับเอกสาร"},{"name":"Second","address":"","kind":"ส่งเอกสาร"}]'::jsonb,'2026-12-25'::date,'')::text,true);
do $$ begin
 if not exists(select 1 from public.messenger_jobs where id=current_setting('qa.job')::uuid and job_date='2026-12-25' and requester_phone='') then raise exception 'Date or optional phone missing'; end if;
 begin
  perform public.messenger_create_job('Invalid department','QA','ไม่อยู่ในรายการ',current_setting('qa.driver')::uuid,'[{"name":"First","address":"","kind":"รับเอกสาร"}]'::jsonb,'2026-12-25'::date,'');
  raise exception 'Invalid department accepted';
 exception when sqlstate '22023' then null; end;
end $$;
do $$ begin
 begin
  perform public.messenger_create_job('Invalid date','QA','บัญชี',current_setting('qa.driver')::uuid,'[{"name":"First","address":"","kind":"รับเอกสาร"}]'::jsonb,'infinity'::date,'');raise exception 'Invalid date accepted';
 exception when check_violation then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.driver'),true);
select public.messenger_command(current_setting('qa.job')::uuid,'accept',null,'',0);
select set_config('request.jwt.claim.sub',current_setting('qa.manager'),true);
do $$ declare v integer; sid uuid; begin
 select version into v from public.messenger_jobs where id=current_setting('qa.job')::uuid;
 select id into sid from public.messenger_stops where job_id=current_setting('qa.job')::uuid limit 1;
 if v<>1 then raise exception 'Manager lost read access'; end if;
 begin perform public.messenger_command(current_setting('qa.job')::uuid,'complete_stop',sid,'',v);raise exception 'Admin changed accepted job'; exception when insufficient_privilege then null;end;
 begin perform public.messenger_reorder(array(select id from public.messenger_stops where job_id=current_setting('qa.job')::uuid));raise exception 'Admin reordered accepted job'; exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.messenger_profiles set role='super_user' where id=current_setting('qa.manager')::uuid;
set local role authenticated;
do $$ declare v integer; begin
 select version into v from public.messenger_jobs where id=current_setting('qa.job')::uuid;
 begin perform public.messenger_command(current_setting('qa.job')::uuid,'start_return',null,'QA',v);raise exception 'Super User changed accepted job';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.driver'),true);
select public.messenger_reorder(array(select id from public.messenger_stops where job_id=current_setting('qa.job')::uuid order by name desc));
do $$ declare v integer; sid uuid; begin
 select version into v from public.messenger_jobs where id=current_setting('qa.job')::uuid;
 select id into sid from public.messenger_stops where job_id=current_setting('qa.job')::uuid limit 1;
 perform public.messenger_command(current_setting('qa.job')::uuid,'complete_stop',sid,'',v);
end $$;
reset role;
-- Anonymous intake permits empty optional fields and preserves the requested date.
set local role service_role;
select public.messenger_intake_submit(gen_random_uuid(),jsonb_build_object('jobDate','2026-12-26','title','Public fields QA','requester','QA','requesterPhone','','department','บัญชี','messengerId',current_setting('qa.driver'),'stops',jsonb_build_array(jsonb_build_object('name','Point','address','','kind','ส่งเอกสาร','contact','','phone',''))),repeat('b',64));
reset role;
do $$ begin
 if (select count(*) from messenger_private.departments)<>30 then raise exception 'Department cleanup mismatch'; end if;
 if not exists(select 1 from public.messenger_jobs where title='Public fields QA' and job_date='2026-12-26' and requester_phone='') then raise exception 'Public date/optional fields mismatch';end if;
end $$;
rollback;
select 'PASS: listed departments, optional fields, selected dates, manager read-only after acceptance, Messenger operations retained; all QA data rolled back' as result;
