begin;
do $$ declare a text; b text; who uuid; m text; n integer; begin
 select id into who from public.messenger_profiles where role='messenger' and active limit 1;
 if who is null then raise exception 'Active Messenger required for rollback test'; end if;
 m:=to_char(statement_timestamp() at time zone 'Asia/Bangkok','YYMM');
 select coalesce((select last_number from messenger_private.job_counters where month=m),0) into n;
 insert into public.messenger_jobs(title,requester,department,messenger_id) values('Number QA','QA','บัญชี',who) returning code into a;
 insert into public.messenger_jobs(title,requester,department,messenger_id,code) values('Number QA','QA','บัญชี',who,'CLIENT-OVERRIDE') returning code into b;
 if a<>'MSG-'||m||lpad((n+1)::text,4,'0') or b<>'MSG-'||m||lpad((n+2)::text,4,'0') then raise exception 'Invalid sequential numbers: %, %',a,b; end if;
 if has_table_privilege('anon','messenger_private.job_counters','SELECT') or has_table_privilege('authenticated','messenger_private.job_counters','UPDATE') then raise exception 'Counter grants exposed'; end if;
 if exists(select 1 from public.messenger_jobs where code !~ '^MSG-[0-9]{8}$') then raise exception 'Legacy number remains'; end if;
end $$;
rollback;
select 'PASS: Bangkok monthly sequence, caller override prevented, private counter grants, legacy conversion; temporary inserts rolled back' as result;
