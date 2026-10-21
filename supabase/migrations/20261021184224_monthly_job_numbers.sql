begin;
lock table public.messenger_jobs in access exclusive mode;
create table messenger_private.job_counters (month text primary key, last_number integer not null check(last_number between 0 and 9999));
alter table messenger_private.job_counters enable row level security;
revoke all on messenger_private.job_counters from public, anon, authenticated;
-- Preserve valid monthly numbers, convert legacy numbers in creation order.
do $$ declare r record; n integer; m text; begin
 for r in select * from public.messenger_jobs where code ~ '^MSG-[0-9]{8}$' loop
  insert into messenger_private.job_counters values(substring(r.code from 5 for 4),right(r.code,4)::integer) on conflict(month) do update set last_number=greatest(job_counters.last_number,excluded.last_number);
 end loop;
 for r in select * from public.messenger_jobs where code !~ '^MSG-[0-9]{8}$' order by created_at,id loop
  m:=to_char(r.created_at at time zone 'Asia/Bangkok','YYMM');
  insert into messenger_private.job_counters values(m,1) on conflict(month) do update set last_number=job_counters.last_number+1 returning last_number into n;
  update public.messenger_jobs set code='MSG-'||m||lpad(n::text,4,'0') where id=r.id;
 end loop;
end $$;
create function messenger_private.assign_job_number() returns trigger language plpgsql security definer set search_path='' as $$
declare m text; n integer;
begin
 m:=to_char(statement_timestamp() at time zone 'Asia/Bangkok','YYMM');
 insert into messenger_private.job_counters values(m,1) on conflict(month) do update set last_number=job_counters.last_number+1 returning last_number into n;
 new.code:='MSG-'||m||lpad(n::text,4,'0');
 return new;
end $$;
revoke all on function messenger_private.assign_job_number() from public,anon,authenticated;
alter table public.messenger_jobs alter column code drop default;
create trigger assign_job_number before insert on public.messenger_jobs for each row execute function messenger_private.assign_job_number();
commit;
