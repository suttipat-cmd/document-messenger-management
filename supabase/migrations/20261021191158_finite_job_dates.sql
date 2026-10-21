alter table public.messenger_jobs add constraint messenger_jobs_job_date_valid check(job_date between date '0001-01-01' and date '9999-12-31');
