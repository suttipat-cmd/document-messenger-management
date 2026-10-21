begin;
with u as (insert into auth.users(id,email) values(gen_random_uuid(),'messenger-qa-a@example.invalid') returning id)
 select set_config('messenger.qa_a',(select id::text from u),true);
with u as (insert into auth.users(id,email) values(gen_random_uuid(),'messenger-qa-b@example.invalid') returning id)
 select set_config('messenger.qa_b',(select id::text from u),true);
update public.messenger_profiles set active=true where id in(current_setting('messenger.qa_a')::uuid,current_setting('messenger.qa_b')::uuid);
with j as (insert into public.messenger_jobs(title,requester,department,messenger_id) values('QA A','QA','บัญชี',current_setting('messenger.qa_a')::uuid) returning id)
 select set_config('messenger.qa_job_a',(select id::text from j),true);
with j as (insert into public.messenger_jobs(title,requester,department,messenger_id) values('QA B','QA','บัญชี',current_setting('messenger.qa_b')::uuid) returning id)
 select set_config('messenger.qa_job_b',(select id::text from j),true);
with s as (insert into public.messenger_stops(job_id,name,address,kind) values(current_setting('messenger.qa_job_a')::uuid,'QA Stop','QA Address','ส่งเอกสาร') returning id)
 select set_config('messenger.qa_stop',(select id::text from s),true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('messenger.qa_a'),true);
do $$
begin
 if (select count(*) from public.messenger_jobs where id in(current_setting('messenger.qa_job_a')::uuid,current_setting('messenger.qa_job_b')::uuid))<>1 then raise exception 'RLS visibility failed'; end if;
 begin
  update public.messenger_jobs set title='INVALID' where id=current_setting('messenger.qa_job_a')::uuid;
  raise exception 'Direct update unexpectedly allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.messenger_command(current_setting('messenger.qa_job_b')::uuid,'accept',null,'',0);
  raise exception 'Foreign job mutation unexpectedly allowed';
 exception when insufficient_privilege then null; end;
 perform public.messenger_command(current_setting('messenger.qa_job_a')::uuid,'accept',null,'',0);
 begin
  perform public.messenger_command(current_setting('messenger.qa_job_a')::uuid,'start_return',null,'reason',0);
  raise exception 'Stale version unexpectedly allowed';
 exception when serialization_failure then null; end;
 perform public.messenger_command(current_setting('messenger.qa_job_a')::uuid,'retry_stop',current_setting('messenger.qa_stop')::uuid,'สถานที่ปิด',1);
 perform public.messenger_command(current_setting('messenger.qa_job_a')::uuid,'start_return',null,'คืนผู้มอบหมาย',2);
 perform public.messenger_command(current_setting('messenger.qa_job_a')::uuid,'confirm_return',null,'',3);
 if not exists(select 1 from public.messenger_jobs where id=current_setting('messenger.qa_job_a')::uuid and status='done' and returned_at is not null) then raise exception 'Return workflow failed'; end if;
 if (select count(*) from public.messenger_events where job_id=current_setting('messenger.qa_job_a')::uuid)<>4 then raise exception 'Audit trail failed'; end if;
 begin
  perform public.messenger_create_job('INVALID','QA','',current_setting('messenger.qa_a')::uuid,'[]'::jsonb);
  raise exception 'Messenger creation unexpectedly allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform count(*) from public.messenger_jobs; raise exception 'Anon read allowed'; exception when insufficient_privilege then null; end;
 begin perform public.messenger_command(null,'accept'); raise exception 'Anon command allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: RLS isolation, no direct writes, no anonymous access, version conflict, return flow and audit trail; all test data rolled back' as result;
