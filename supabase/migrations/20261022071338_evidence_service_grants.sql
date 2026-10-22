begin;
-- SECURITY INVOKER evidence RPCs use the service role. Existing core tables
-- intentionally did not grant this role access. Grant only what these RPCs need.
grant select on public.messenger_jobs,public.messenger_profiles,public.messenger_stops to service_role;
-- PostgreSQL FOR UPDATE needs UPDATE privilege on at least one column.
-- Evidence functions lock jobs, but never change job fields.
grant update(id) on public.messenger_jobs to service_role;
grant insert on public.messenger_events to service_role;
do $$ begin
 execute format('grant usage on sequence %s to service_role',pg_get_serial_sequence('public.messenger_events','id'));
end $$;
commit;
