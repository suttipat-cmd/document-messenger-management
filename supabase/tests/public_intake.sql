begin;
with u as (insert into auth.users(id,email) values(gen_random_uuid(),'public-intake-qa@example.invalid') returning id)
 select set_config('messenger.intake_qa',(select id::text from u),true);
update public.messenger_profiles set active=true,display_name='Public Intake QA' where id=current_setting('messenger.intake_qa')::uuid;
select set_config('messenger.intake_key',gen_random_uuid()::text,true);
select set_config('messenger.intake_payload',jsonb_build_object('title','PUBLIC INTAKE QA','requester','QA','requesterPhone','00000','department','บัญชี','messengerId',current_setting('messenger.intake_qa'),'stops',jsonb_build_array(jsonb_build_object('name','Pickup','address','QA Address','kind','รับเอกสาร','contact','','phone',''),jsonb_build_object('name','Delivery','address','QA Address 2','kind','ส่งเอกสาร','contact','','phone','')))::text,true);
-- Isolate test throttle counters inside this rolled-back transaction.
update messenger_private.intake_limits set used=0 where bucket in ('global:ten','global:day');
set local role anon;
do $$ begin
 begin perform public.messenger_intake_options(); raise exception 'Anon RPC options allowed'; exception when insufficient_privilege then null; end;
 begin perform public.messenger_intake_submit(null,null,null); raise exception 'Anon bypass allowed'; exception when insufficient_privilege then null; end;
 begin perform count(*) from public.messenger_jobs; raise exception 'Anon read allowed'; exception when insufficient_privilege then null; end;
end $$;
set local role service_role;
do $$ declare a jsonb; b jsonb; v jsonb; i integer; begin
 v:=public.messenger_intake_options();
 if not v @> jsonb_build_array(jsonb_build_object('id',current_setting('messenger.intake_qa'))) then raise exception 'Active option missing'; end if;
 if exists(select 1 from jsonb_array_elements(v) o cross join lateral jsonb_object_keys(o) k where k not in ('id','name')) then raise exception 'Options leak private fields'; end if;
 a:=public.messenger_intake_submit(current_setting('messenger.intake_key')::uuid,current_setting('messenger.intake_payload')::jsonb,'qa-intake-bucket-unique');
 b:=public.messenger_intake_submit(current_setting('messenger.intake_key')::uuid,current_setting('messenger.intake_payload')::jsonb,'qa-intake-bucket-unique');
 if a<>b or not a ? 'code' or (select count(*) from jsonb_object_keys(a))<>1 then raise exception 'Receipt or idempotency failed'; end if;
 begin
  perform public.messenger_intake_submit(current_setting('messenger.intake_key')::uuid,jsonb_set(current_setting('messenger.intake_payload')::jsonb,'{title}','"Changed"'),'qa-intake-bucket-unique');
  raise exception 'Conflicting key accepted';
 exception when sqlstate 'P0409' then null; end;
 begin
  perform public.messenger_intake_submit(gen_random_uuid(),jsonb_set(current_setting('messenger.intake_payload')::jsonb,'{stops}','[]'),'qa-intake-bucket-unique');
  raise exception 'Empty stops accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.messenger_intake_submit(gen_random_uuid(),jsonb_set(current_setting('messenger.intake_payload')::jsonb,'{messengerId}',to_jsonb(gen_random_uuid()::text)),'qa-intake-bucket-unique');
  raise exception 'Invalid messenger accepted';
 exception when sqlstate 'P0404' then null; end;
 for i in 2..30 loop perform public.messenger_intake_submit(gen_random_uuid(),current_setting('messenger.intake_payload')::jsonb,'qa-intake-bucket-unique'); end loop;
 begin
  perform public.messenger_intake_submit(gen_random_uuid(),current_setting('messenger.intake_payload')::jsonb,'qa-intake-bucket-unique');
  raise exception 'Throttle bypassed';
 exception when sqlstate 'P0429' then null; end;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.messenger_jobs where messenger_id=current_setting('messenger.intake_qa')::uuid)<>30 then raise exception 'Duplicate requests or failed rollback'; end if;
 if (select count(*) from public.messenger_stops s join public.messenger_jobs j on j.id=s.job_id where j.messenger_id=current_setting('messenger.intake_qa')::uuid)<>60 then raise exception 'Stop transaction failed'; end if;
 if exists(select 1 from public.messenger_jobs where messenger_id=current_setting('messenger.intake_qa')::uuid and (requester_phone<>'00000' or status<>'new')) then raise exception 'Wrong job data'; end if;
end $$;
rollback;
select 'PASS: public create-only permissions, minimal roster, atomic multi-stop creation, idempotency, input validation and throttle; all temporary jobs rolled back' as result;
