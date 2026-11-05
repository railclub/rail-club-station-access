-- The daily cleanup job and the cleanup function share a secret. It is generated here, kept in
-- Supabase Vault and never leaves the database, so nobody has to copy it between dashboards.

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'cleanup_cron_secret',
  'Shared secret between the cleanup-videos cron job and the cleanup Edge Function'
)
where not exists (select 1 from vault.secrets where name = 'cleanup_cron_secret');

-- The cleanup function asks this instead of reading the secret itself.
create or replace function public.cleanup_secret_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_secret, '') <> '' and exists (
    select 1 from vault.decrypted_secrets
    where name = 'cleanup_cron_secret' and decrypted_secret = p_secret
  );
$$;

revoke all on function public.cleanup_secret_ok(text) from public, anon, authenticated;
grant execute on function public.cleanup_secret_ok(text) to service_role;

-- 03:00 India time every day. Re-scheduling under the same name replaces the job.
select cron.schedule(
  'cleanup-videos',
  '30 21 * * *',
  $job$
  select net.http_post(
    url := 'https://szhspqlvgiuqgbavfuhz.supabase.co/functions/v1/cleanup',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $job$
);
