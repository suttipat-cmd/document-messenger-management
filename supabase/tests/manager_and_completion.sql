begin;
-- Temporary auth users never receive passwords or emails; everything rolls back.
with u as (insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),'messenger-spoof@example.invalid','{"role":"admin","active":true}'::jsonb) returning id)
 select set_config('messenger.spoof',(select id::text from u),true);
do $$ begin
 if exists(select 1 from public.messenger_profiles where id=current_setting('messenger.spoof')::uuid and (active or role<>'messenger')) then raise exception 'User metadata privilege escalation'; end if;
end $$;
insert into messenger_private.bootstrap_accounts(email) values('messenger-admin-qa@example.invalid');
with u as (insert into auth.users(id,email,email_confirmed_at) values(gen_random_uuid(),'messenger-admin-qa@example.invalid',now()) returning id)
 select set_config('messenger.admin_qa',(select id::text from u),true);
with u as (insert into auth.users(id,email) values(gen_random_uuid(),'messenger-driver-qa@example.invalid') returning id)
 select set_config('messenger.driver_qa',(select id::text from u),true);
do $$ begin
 if not exists(select 1 from public.messenger_profiles where id=current_setting('messenger.admin_qa')::uuid and active and role='admin') then raise exception 'Verified bootstrap failed'; end if;
 if not exists(select 1 from messenger_private.bootstrap_accounts where email='messenger-admin-qa@example.invalid' and claimed_at is not null) then raise exception 'Bootstrap not consumed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('messenger.admin_qa'),true);
select public.messenger_set_profile(current_setting('messenger.driver_qa')::uuid,'messenger',true,'QA Driver');
select set_config('messenger.manager_job', public.messenger_create_job('QA Managed','QA Requester','บัญชี',current_setting('messenger.driver_qa')::uuid,'[{"name":"QA 1","address":"A","kind":"รับเอกสาร"},{"name":"QA 2","address":"B","kind":"ส่งเอกสาร"}]'::jsonb)::text,true);
do $$ begin
 begin
  perform public.messenger_create_job('QA Invalid','QA','',current_setting('messenger.driver_qa')::uuid,null);
  raise exception 'Null stops allowed';
 exception when raise_exception then if sqlerrm='Null stops allowed' then raise; end if; end;
 if (select count(*) from public.messenger_stops where job_id=current_setting('messenger.manager_job')::uuid)<>2 then raise exception 'Creation not atomic'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('messenger.driver_qa'),true);
select public.messenger_command(current_setting('messenger.manager_job')::uuid,'accept',null,'',0);
select public.messenger_reorder(array(select id from public.messenger_stops where job_id=current_setting('messenger.manager_job')::uuid order by name desc));
do $$ declare s record; v integer; begin
 for s in select id from public.messenger_stops where job_id=current_setting('messenger.manager_job')::uuid order by route_position loop
  select version into v from public.messenger_jobs where id=current_setting('messenger.manager_job')::uuid;
  perform public.messenger_command(current_setting('messenger.manager_job')::uuid,'complete_stop',s.id,'',v);
 end loop;
 if not exists(select 1 from public.messenger_jobs where id=current_setting('messenger.manager_job')::uuid and status='done' and completed_at is not null and returned_at is null) then raise exception 'Completion failed'; end if;
 begin
  perform public.messenger_set_profile(current_setting('messenger.driver_qa')::uuid,'admin',true,'HACK');
  raise exception 'Messenger self promotion allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: metadata cannot grant roles, verified one-time Admin bootstrap, manager creation, profile activation, reorder and photo-free completion; all test data rolled back' as result;
