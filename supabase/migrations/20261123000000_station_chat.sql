-- Station Chat: a live chat room for every station, open only to people who are there.
--
-- How it fits together:
--   * The station-pass Edge Function checks the visitor's live location against the station
--     (the same rules as video reports) and writes a short pass here: chat_passes. Nothing
--     about the location is kept except which station and how far from it.
--   * Everything else goes through the functions below (security definer). The browser can't
--     read or write the tables directly: no policies on them.
--   * chat_send saves a message and pushes it to the room's private Realtime channel
--     ("chat:<station>:<room>") over WebSockets. The realtime.messages policy at the end lets
--     only pass holders listen, and nobody can broadcast into a room directly.
--   * A job every 10 minutes deletes messages after a few hours, and old rooms and passes.
--   * settings 'chat' holds the switches: chat off everywhere, closed stations, limits.

insert into public.settings (key, value) values ('chat', '{
  "enabled": true,
  "closed_stations": [],
  "pass_minutes": 20,
  "message_hours": 2,
  "per_minute": 5,
  "per_10_minutes": 30,
  "max_len": 500,
  "max_accuracy_m": 75,
  "room_hours": 3,
  "hide_after_reports": 3
}') on conflict (key) do nothing;

-- ---------- tables (no policies: only the functions below and the service role use them) ----------

create table if not exists public.chat_profiles (
  user_id    uuid primary key references auth.users on delete cascade,
  nickname   text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_passes (
  user_id     uuid primary key references auth.users on delete cascade,
  station_id  text not null,
  distance_m  integer,
  expires_at  timestamptz not null,
  updated_at  timestamptz not null default now()
);
create index if not exists chat_passes_station on public.chat_passes (station_id, expires_at);

-- Friends' rooms: made at a station, joined with a short code by others at the same station.
create table if not exists public.chat_rooms (
  id          uuid primary key default gen_random_uuid(),
  station_id  text not null,
  code        text not null unique,
  created_by  uuid not null references auth.users on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create table if not exists public.chat_room_members (
  room_id  uuid not null references public.chat_rooms on delete cascade,
  user_id  uuid not null references auth.users on delete cascade,
  primary key (room_id, user_id)
);

create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  station_id  text not null,
  room        text not null,                 -- 'open', or a chat_rooms id
  user_id     uuid not null references auth.users on delete cascade,
  nickname    text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_room on public.chat_messages (station_id, room, created_at desc);
create index if not exists chat_messages_user on public.chat_messages (user_id, created_at desc);

-- A copy of what was reported, so it survives the message being deleted.
create table if not exists public.chat_reports (
  id          bigint generated always as identity primary key,
  message_id  bigint,
  station_id  text not null,
  room        text not null,
  author      uuid not null references auth.users on delete cascade,
  nickname    text not null,
  body        text not null,
  reporter    uuid not null references auth.users on delete cascade,
  reason      text not null,
  created_at  timestamptz not null default now(),
  handled     boolean not null default false,
  unique (message_id, reporter)
);

alter table public.chat_profiles     enable row level security;
alter table public.chat_passes       enable row level security;
alter table public.chat_rooms        enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.chat_messages     enable row level security;
alter table public.chat_reports      enable row level security;
revoke all on public.chat_profiles, public.chat_passes, public.chat_rooms, public.chat_room_members,
  public.chat_messages, public.chat_reports from anon, authenticated;

-- ---------- helpers ----------

create or replace function public.chat_settings() returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from public.settings where key = 'chat';
$$;

-- The signed-in visitor's valid pass for a station, if any (and not banned, chat on, station open).
create or replace function public.chat_has_pass(p_station text) returns boolean
language sql stable security definer set search_path = '' as $$
  -- coalesce: never "unknown", which an "if not ..." check would let through
  select coalesce((
    select coalesce((s.value ->> 'enabled')::boolean, false)
      and not coalesce((s.value -> 'closed_stations') ? p_station, false)
      and auth.uid() is not null
      and exists (select 1 from public.chat_passes p
                  where p.user_id = auth.uid() and p.station_id = p_station and p.expires_at > now())
      and not exists (select 1 from public.contributors c where c.user_id = auth.uid() and c.blocked)
    from public.settings s where s.key = 'chat'), false);
$$;

-- May the visitor be in this room ('open', or a friends' room they joined) at this station?
create or replace function public.chat_in_room(p_station text, p_room text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.chat_has_pass(p_station) and (
    p_room = 'open' or exists (
      select 1 from public.chat_rooms r join public.chat_room_members m on m.room_id = r.id
      where r.id::text = p_room and r.station_id = p_station and r.expires_at > now()
        and m.user_id = auth.uid())), false);
$$;

-- For the Realtime policy: topic "chat:<station>:<room>".
create or replace function public.chat_can_listen(p_topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_topic like 'chat:%:%'
    and public.chat_in_room(split_part(p_topic, ':', 2), split_part(p_topic, ':', 3)), false);
$$;

-- A short stable tag per person, so others can block someone without seeing their account id.
create or replace function public.chat_author_tag(p_user uuid) returns text
language sql immutable set search_path = '' as $$
  select substr(md5('railclub-chat:' || p_user::text), 1, 12);
$$;

create or replace function public.chat_nickname() returns text
language plpgsql security definer set search_path = '' as $$
declare n text;
begin
  select nickname into n from public.chat_profiles where user_id = auth.uid();
  if n is null then
    n := 'Traveller ' || (1000 + floor(random() * 9000))::int;
    insert into public.chat_profiles (user_id, nickname) values (auth.uid(), n)
      on conflict (user_id) do update set nickname = public.chat_profiles.nickname returning nickname into n;
  end if;
  return n;
end $$;

-- Why a text can't be posted (links, phone numbers, emails), or null when it's fine.
create or replace function public.chat_refuse(p_text text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_text ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|in|net|org|io|co|me|ly|xyz|app|link|info|biz|online|site|shop|top|tk)\M)'
      then 'Links aren''t allowed in station chat'
    when regexp_replace(p_text, '[\s().+-]', '', 'g') ~ '(91)?[6-9][0-9]{9}'
      then 'Phone numbers aren''t allowed in station chat. Stay safe: don''t share contact details with strangers'
    when p_text ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
      then 'Email addresses aren''t allowed in station chat'
    else null end;
$$;

-- ---------- what the visitor can do ----------

create or replace function public.chat_set_nickname(p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  if n !~ '^[[:alnum:] _.-]{3,20}$' then raise exception 'Use 3 to 20 letters, numbers or spaces'; end if;
  if public.chat_refuse(n) is not null or n ~ '[0-9]{6,}' then raise exception 'Please pick another nickname'; end if;
  insert into public.chat_profiles (user_id, nickname) values (auth.uid(), n)
    on conflict (user_id) do update set nickname = excluded.nickname;
  return n;
end $$;

-- The last messages in a room (before the live ones start arriving), newest last.
create or replace function public.chat_recent(p_station text, p_room text)
returns table (id bigint, author text, nickname text, body text, created_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.chat_in_room(p_station, p_room) then raise exception 'No pass for this room'; end if;
  return query
    select x.* from (
      select m.id, public.chat_author_tag(m.user_id), m.nickname, m.body, m.created_at, m.user_id = auth.uid()
      from public.chat_messages m
      where m.station_id = p_station and m.room = p_room
        and m.created_at > now() - make_interval(hours => (public.chat_settings() ->> 'message_hours')::int)
      order by m.created_at desc limit 100) x
    order by x.created_at;
end $$;

create or replace function public.chat_send(p_station text, p_room text, p_body text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  s jsonb := public.chat_settings();
  b text := btrim(coalesce(p_body, ''));
  why text;
  nick text;
  new_id bigint;
  sent_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  if not public.chat_in_room(p_station, p_room) then
    raise exception 'Your pass for this room has run out. Check your location again to rejoin';
  end if;
  if b = '' then raise exception 'Type a message first'; end if;
  if length(b) > (s ->> 'max_len')::int then raise exception 'Keep it under % characters', s ->> 'max_len'; end if;
  why := public.chat_refuse(b);
  if why is not null then raise exception '%', why; end if;
  if (select count(*) from public.chat_messages where user_id = auth.uid() and created_at > now() - interval '1 minute')
       >= (s ->> 'per_minute')::int
     or (select count(*) from public.chat_messages where user_id = auth.uid() and created_at > now() - interval '10 minutes')
       >= (s ->> 'per_10_minutes')::int then
    raise exception 'Slow down a little: try again in a minute';
  end if;
  if exists (select 1 from public.chat_messages where user_id = auth.uid() and body = b
             and created_at > now() - interval '2 minutes') then
    raise exception 'You just sent that';
  end if;
  nick := public.chat_nickname();
  insert into public.chat_messages (station_id, room, user_id, nickname, body)
    values (p_station, p_room, auth.uid(), nick, b) returning id, created_at into new_id, sent_at;
  perform realtime.send(
    jsonb_build_object('id', new_id, 'author', public.chat_author_tag(auth.uid()), 'nickname', nick,
                       'body', b, 'created_at', sent_at),
    'message', 'chat:' || p_station || ':' || p_room, true);
  return new_id;
end $$;

create or replace function public.chat_create_room(p_station text)
returns table (room text, code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  c text;
  r public.chat_rooms;
begin
  if not public.chat_has_pass(p_station) then raise exception 'You need to be at the station to start a room'; end if;
  if (select count(*) from public.chat_rooms where created_by = auth.uid() and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'You''ve started enough rooms for now';
  end if;
  loop
    -- 6 characters without look-alikes (no 0/O, 1/I/L)
    c := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
          from generate_series(1, 6));
    exit when not exists (select 1 from public.chat_rooms where chat_rooms.code = c);
  end loop;
  insert into public.chat_rooms (station_id, code, created_by, expires_at)
    values (p_station, c, auth.uid(), now() + make_interval(hours => (public.chat_settings() ->> 'room_hours')::int))
    returning * into r;
  insert into public.chat_room_members (room_id, user_id) values (r.id, auth.uid());
  return query select r.id::text, r.code, r.expires_at;
end $$;

create or replace function public.chat_join_room(p_station text, p_code text)
returns table (room text, code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare r public.chat_rooms;
begin
  if not public.chat_has_pass(p_station) then raise exception 'You need to be at the station to join'; end if;
  select * into r from public.chat_rooms
    where chat_rooms.code = upper(btrim(coalesce(p_code, ''))) and chat_rooms.expires_at > now();
  -- the same answer for "no such room" and "a room at another station": codes can't be probed
  if r.id is null or r.station_id <> p_station then
    raise exception 'No room with that code here. Check the code, and that you''re both at this station';
  end if;
  insert into public.chat_room_members (room_id, user_id) values (r.id, auth.uid()) on conflict do nothing;
  return query select r.id::text, r.code, r.expires_at;
end $$;

-- The friends' rooms the visitor is in at this station.
create or replace function public.chat_my_rooms(p_station text)
returns table (room text, code text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id::text, r.code, r.expires_at
  from public.chat_rooms r join public.chat_room_members m on m.room_id = r.id
  where m.user_id = auth.uid() and r.station_id = p_station and r.expires_at > now()
    and public.chat_has_pass(p_station)
  order by r.created_at;
$$;

create or replace function public.chat_report(p_message bigint, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.chat_messages;
  n int;
begin
  select * into m from public.chat_messages where id = p_message;
  if m.id is null or not public.chat_in_room(m.station_id, m.room) then raise exception 'Message not found'; end if;
  if m.user_id = auth.uid() then raise exception 'That''s your own message'; end if;
  insert into public.chat_reports (message_id, station_id, room, author, nickname, body, reporter, reason)
    values (m.id, m.station_id, m.room, m.user_id, m.nickname, m.body, auth.uid(),
            left(coalesce(nullif(btrim(p_reason), ''), 'Not given'), 200))
    on conflict (message_id, reporter) do nothing;
  -- enough people reporting the same message hides it for everyone straight away
  select count(*) into n from public.chat_reports where message_id = m.id;
  if n >= (public.chat_settings() ->> 'hide_after_reports')::int then
    delete from public.chat_messages where id = m.id;
    perform realtime.send(jsonb_build_object('id', m.id), 'delete', 'chat:' || m.station_id || ':' || m.room, true);
  end if;
end $$;

-- ---------- admins (the review page) ----------

create or replace function public.chat_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u join public.admins a on a.email = lower(u.email)
                 where u.id = auth.uid() and u.email_confirmed_at is not null);
$$;

create or replace function public.chat_admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.chat_is_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'settings', public.chat_settings(),
    'in_chat_now', (select count(*) from public.chat_passes where expires_at > now()),
    'stations_now', (select count(distinct station_id) from public.chat_passes where expires_at > now()),
    'messages_24h', (select count(*) from public.chat_messages where created_at > now() - interval '24 hours'),
    'busiest', (select coalesce(jsonb_agg(x), '[]') from (
        select station_id, count(*) people from public.chat_passes where expires_at > now()
        group by 1 order by 2 desc limit 5) x),
    'reports', (select coalesce(jsonb_agg(x order by x.created_at), '[]') from (
        select r.id, r.message_id, r.station_id, r.nickname, r.body, r.reason, r.created_at,
               public.chat_author_tag(r.author) author,
               (select count(*) from public.chat_reports o where o.author = r.author) author_reports,
               exists (select 1 from public.contributors c where c.user_id = r.author and c.blocked) banned
        from public.chat_reports r where not r.handled) x));
end $$;

-- action: 'dismiss' (keep the message), 'delete' (remove it), 'ban' (remove all their
-- messages and stop them using chat and video reports)
create or replace function public.chat_admin_act(p_report bigint, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.chat_reports;
begin
  if not public.chat_is_admin() then raise exception 'Admins only'; end if;
  select * into r from public.chat_reports where id = p_report;
  if r.id is null then raise exception 'Report not found'; end if;
  if p_action in ('delete', 'ban') and r.message_id is not null then
    delete from public.chat_messages where id = r.message_id;
    perform realtime.send(jsonb_build_object('id', r.message_id), 'delete', 'chat:' || r.station_id || ':' || r.room, true);
  end if;
  if p_action = 'ban' then
    insert into public.contributors (user_id, blocked) values (r.author, true)
      on conflict (user_id) do update set blocked = true;
    delete from public.chat_passes where user_id = r.author;
    delete from public.chat_messages where user_id = r.author;
  elsif p_action not in ('dismiss', 'delete') then
    raise exception 'Unknown action';
  end if;
  update public.chat_reports set handled = true
    where id = p_report or (p_action = 'ban' and author = r.author);
end $$;

-- Switches: chat on or off everywhere, and close or reopen one station.
create or replace function public.chat_admin_switch(p_enabled boolean, p_station text default null, p_closed boolean default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s jsonb := public.chat_settings();
begin
  if not public.chat_is_admin() then raise exception 'Admins only'; end if;
  if p_enabled is not null then s := jsonb_set(s, '{enabled}', to_jsonb(p_enabled)); end if;
  if p_station is not null and p_closed is not null then
    s := jsonb_set(s, '{closed_stations}', coalesce((
      select jsonb_agg(distinct x) from jsonb_array_elements_text(s -> 'closed_stations') x where x <> p_station), '[]'));
    if p_closed then s := jsonb_set(s, '{closed_stations}', (s -> 'closed_stations') || to_jsonb(p_station)); end if;
  end if;
  update public.settings set value = s where key = 'chat';
  return s;
end $$;

-- ---------- who may call what ----------

revoke all on function public.chat_settings(), public.chat_has_pass(text), public.chat_in_room(text, text),
  public.chat_can_listen(text), public.chat_author_tag(uuid), public.chat_nickname(), public.chat_refuse(text),
  public.chat_set_nickname(text), public.chat_recent(text, text), public.chat_send(text, text, text),
  public.chat_create_room(text), public.chat_join_room(text, text), public.chat_my_rooms(text),
  public.chat_report(bigint, text), public.chat_is_admin(), public.chat_admin_overview(),
  public.chat_admin_act(bigint, text), public.chat_admin_switch(boolean, text, boolean)
  from public, anon;
grant execute on function public.chat_set_nickname(text), public.chat_recent(text, text),
  public.chat_send(text, text, text), public.chat_create_room(text), public.chat_join_room(text, text),
  public.chat_my_rooms(text), public.chat_report(bigint, text), public.chat_nickname(),
  public.chat_admin_overview(), public.chat_admin_act(bigint, text), public.chat_admin_switch(boolean, text, boolean),
  public.chat_can_listen(text)
  to authenticated;
-- Building blocks stay internal: callable by the functions above (they run as their owner).
revoke all on function public.chat_settings(), public.chat_has_pass(text), public.chat_in_room(text, text),
  public.chat_author_tag(uuid), public.chat_refuse(text), public.chat_is_admin() from authenticated;
grant execute on function public.chat_settings(), public.chat_refuse(text) to service_role;

-- ---------- live rooms: only pass holders may listen; nobody may broadcast from a browser ----------

drop policy if exists "station chat: pass holders listen" on realtime.messages;
create policy "station chat: pass holders listen"
  on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.chat_can_listen((select realtime.topic())));

-- ---------- tidying, every 10 minutes ----------

select cron.schedule(
  'station-chat-tidy',
  '*/10 * * * *',
  $job$
  delete from public.chat_messages
    where created_at < now() - make_interval(hours => (select (value ->> 'message_hours')::int from public.settings where key = 'chat'));
  delete from public.chat_rooms where expires_at < now() - interval '1 hour';
  delete from public.chat_passes where expires_at < now() - interval '1 day';
  delete from public.chat_reports where handled and created_at < now() - interval '30 days';
  $job$
);
