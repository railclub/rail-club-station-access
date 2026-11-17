-- Journey Partner: sights found in OpenStreetMap along each stretch of line between two
-- stations, kept so each stretch is looked up once (journey-sights Edge Function).
-- Only the function reads and writes it (with the service key); nobody else needs access.
create table if not exists public.journey_segments (
  key text primary key,                 -- "CODEA|CODEB", alphabetical, same both directions
  sights jsonb not null default '[]',
  fetched_at timestamptz not null default now()
);
create index if not exists journey_segments_fetched_at on public.journey_segments (fetched_at);
alter table public.journey_segments enable row level security;
revoke all on public.journey_segments from anon, authenticated;
