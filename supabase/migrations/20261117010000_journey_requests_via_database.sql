-- Journey Partner: OpenStreetMap's main Overpass server refuses requests from Supabase Edge
-- Functions (HTTP 406 for every request) but answers the database's own HTTP client (pg_net).
-- So journey-sights asks the database to fetch, keeps the request id here, and collects the
-- answer on a later call (the page keeps asking until every stretch is done).
create table if not exists public.journey_requests (
  run_key text primary key,             -- first station > last station # number of stations
  request_id bigint not null,           -- pg_net request id
  run jsonb not null,                   -- the stations the query covers
  created_at timestamptz not null default now()
);
alter table public.journey_requests enable row level security;
revoke all on public.journey_requests from anon, authenticated;

-- Start one Overpass request. Only the main Overpass endpoint, only for the service role.
create or replace function public.journey_fetch(p_query text) returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  if length(p_query) > 4000 then
    raise exception 'query too long';
  end if;
  return net.http_get(
    url := 'https://overpass-api.de/api/interpreter',
    params := jsonb_build_object('data', p_query),
    headers := jsonb_build_object('user-agent', 'RailClub-JourneyPartner/1.0 (railclub.support@gmail.com)'),
    timeout_milliseconds := 90000);
end $$;

-- The answer to a request started above, once it has arrived (no row until then).
create or replace function public.journey_result(p_id bigint)
returns table (status_code integer, content text, timed_out boolean, error_msg text)
language sql security definer set search_path = '' as $$
  select r.status_code, r.content, r.timed_out, r.error_msg from net._http_response r where r.id = p_id;
$$;

revoke all on function public.journey_fetch(text) from public, anon, authenticated;
revoke all on function public.journey_result(bigint) from public, anon, authenticated;
grant execute on function public.journey_fetch(text) to service_role;
grant execute on function public.journey_result(bigint) to service_role;
