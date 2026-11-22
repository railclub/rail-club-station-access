-- Journey Partner warm-up: every minute a job asks journey-sights to look up the next train's
-- whole line, popular trains first, so visitors find most journeys already done.
create table if not exists public.journey_warm (
  train text primary key,
  tries integer not null default 0,   -- minutes in a row without progress
  missing integer,                    -- stretches still to look up, last time
  done boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.journey_warm enable row level security;
revoke all on public.journey_warm from anon, authenticated;

-- Shared secret between the job and the function; generated here, never leaves the database.
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'journey_warm_secret',
  'Shared secret between the journey-warm-up cron job and the journey-sights Edge Function'
)
where not exists (select 1 from vault.secrets where name = 'journey_warm_secret');

create or replace function public.journey_warm_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_secret, '') <> '' and exists (
    select 1 from vault.decrypted_secrets
    where name = 'journey_warm_secret' and decrypted_secret = p_secret
  );
$$;

revoke all on function public.journey_warm_ok(text) from public, anon, authenticated;
grant execute on function public.journey_warm_ok(text) to service_role;

select cron.schedule(
  'journey-warm-up',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://szhspqlvgiuqgbavfuhz.supabase.co/functions/v1/journey-sights',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'journey_warm_secret')
    ),
    body := '{"warm": true}'::jsonb,
    timeout_milliseconds := 45000
  );
  $job$
);
