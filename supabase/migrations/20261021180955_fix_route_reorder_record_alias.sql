-- Correct the PL/pgSQL record name that shadowed the SQL table alias.
create or replace function messenger_private.reorder(p_stop_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare ids uuid[]; n integer; v_job record;
begin
 if auth.uid() is null or messenger_private.current_role() is null then raise exception 'Account is not active' using errcode='42501'; end if;
 n:=coalesce(cardinality(p_stop_ids),0);
 if n<2 or n>500 or (select count(distinct v) from unnest(p_stop_ids) v)<>n then raise exception 'Invalid stop list'; end if;
 -- Lock all affected jobs in a deterministic order before validating/mutating.
 for v_job in select distinct job_id from public.messenger_stops where id=any(p_stop_ids) order by job_id loop
  perform 1 from public.messenger_jobs where id=v_job.job_id for update;
 end loop;
 select array_agg(s.id) into ids from public.messenger_stops s join public.messenger_jobs j on j.id=s.job_id
 where s.id=any(p_stop_ids) and j.status='active'
 and (j.messenger_id=auth.uid() or messenger_private.current_role() in ('admin','super_user'));
 if coalesce(cardinality(ids),0)<>n then raise exception 'Stops unavailable' using errcode='42501'; end if;
 update public.messenger_stops s set route_position=u.pos from unnest(p_stop_ids) with ordinality u(id,pos) where s.id=u.id;
 for v_job in select distinct job_id from public.messenger_stops where id=any(p_stop_ids) loop
  update public.messenger_jobs set version=version+1,updated_at=now() where id=v_job.job_id;
  insert into public.messenger_events(job_id,actor_id,message) values(v_job.job_id,auth.uid(),'ปรับลำดับจุดรับ–ส่ง');
 end loop;
end $$;

select 'reorder_fixed' as result;
