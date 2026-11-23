-- Station Chat, fixes from the review of 23 Nov 2026.
--  H1  realtime.send also stores each message in realtime.messages, where a pass holder could
--      replay it: delete those copies with the message (moderation, auto-hide, ban, expiry).
--  M2  the author tag was the same everywhere, forever: now a keyed hash per person, station
--      and day, so it can't be used to follow someone between stations or days.
--  L1  enough reports hide a message (an admin can restore it) instead of deleting it, and a
--      person can send at most 10 reports an hour.
--  L2  nicknames: plain letters only, and nothing that looks official.
--  L4  a ban removes the person's messages from open screens too.
--  L5  phone numbers written with other separators or Devanagari digits; "dot com" links.
--  L6  room codes from a secure random source; at most 20 wrong codes an hour.
--  L8  limits fall back to their defaults if a setting is missing.
--  plus a daily log of the stations each account joined, so one account can't hop around
--  India with a faked location (station-pass refuses more than 10 stations a day).

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'chat_tag_secret',
  'Key for Station Chat author tags (per person, station and day)')
where not exists (select 1 from vault.secrets where name = 'chat_tag_secret');

alter table public.chat_messages add column if not exists hidden boolean not null default false;

create table if not exists public.chat_pass_log (
  user_id    uuid not null references auth.users on delete cascade,
  station_id text not null,
  day        date not null,
  primary key (user_id, day, station_id)
);
create table if not exists public.chat_join_failures (
  user_id uuid not null references auth.users on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists chat_join_failures_user on public.chat_join_failures (user_id, at);
alter table public.chat_pass_log enable row level security;
alter table public.chat_join_failures enable row level security;
revoke all on public.chat_pass_log, public.chat_join_failures from anon, authenticated;

-- ---------- author tags: per person, station and India day, keyed ----------

drop function if exists public.chat_author_tag(uuid);
create or replace function public.chat_author_tag(p_user uuid, p_station text, p_at timestamptz) returns text
language sql stable security definer set search_path = '' as $$
  select substr(encode(extensions.hmac(
    p_user::text || ':' || p_station || ':' || (p_at at time zone 'Asia/Kolkata')::date::text,
    (select decrypted_secret from vault.decrypted_secrets where name = 'chat_tag_secret'), 'sha256'), 'hex'), 1, 12);
$$;
revoke all on function public.chat_author_tag(uuid, text, timestamptz) from public, anon, authenticated;

-- Delete the Realtime copies of messages (so they can't be replayed).
create or replace function public.chat_forget(p_ids bigint[]) returns void
language sql security definer set search_path = '' as $$
  delete from realtime.messages where topic like 'chat:%' and event = 'message'
    and (payload ->> 'id')::bigint = any (p_ids);
$$;
revoke all on function public.chat_forget(bigint[]) from public, anon, authenticated;

-- ---------- filters ----------

create or replace function public.chat_refuse(p_text text) returns text
language sql immutable set search_path = '' as $$
  with t as (select
    -- Devanagari digits as 0-9, and digits joined across up to 3 separators ("98765/43210")
    regexp_replace(translate(p_text, '०१२३४५६७८९', '0123456789'), '([0-9])[^0-9]{1,3}(?=[0-9])', '\1', 'g') as digits)
  select case
    when p_text ~* '(https?://|www\.|\m[a-z0-9-]+\s*\.\s*(com|in|net|org|io|co|me|ly|xyz|app|link|info|biz|online|site|shop|top|tk)\M|\mdot\s+(com|net|org|in|ly)\M)'
      then 'Links aren''t allowed in station chat'
    when (select digits from t) ~ '(91)?[6-9][0-9]{9}'
      then 'Phone numbers aren''t allowed in station chat. Stay safe: don''t share contact details with strangers'
    when p_text ~* '[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9.-]+\.[a-z]{2,}'
      then 'Email addresses aren''t allowed in station chat'
    else null end;
$$;

create or replace function public.chat_set_nickname(p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  if n !~ '^[A-Za-z0-9 _.-]{3,20}$' then raise exception 'Use 3 to 20 English letters, numbers or spaces'; end if;
  if public.chat_refuse(n) is not null or n ~ '[0-9]{6,}'
     or n ~* '(rpf|grp|rail ?madad|railway|irctc|admin|police|official|helpline|support|tte|\myou\M|rail ?club)' then
    raise exception 'Please pick another nickname';
  end if;
  insert into public.chat_profiles (user_id, nickname) values (auth.uid(), n)
    on conflict (user_id) do update set nickname = excluded.nickname;
  return n;
end $$;

-- ---------- reading and sending ----------

create or replace function public.chat_recent(p_station text, p_room text)
returns table (id bigint, author text, nickname text, body text, created_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.chat_in_room(p_station, p_room) then raise exception 'No pass for this room'; end if;
  return query
    select x.* from (
      select m.id, public.chat_author_tag(m.user_id, m.station_id, m.created_at), m.nickname, m.body, m.created_at,
             m.user_id = auth.uid()
      from public.chat_messages m
      where m.station_id = p_station and m.room = p_room and not m.hidden
        and m.created_at > now() - make_interval(hours => coalesce((public.chat_settings() ->> 'message_hours')::int, 2))
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
  if length(b) > coalesce((s ->> 'max_len')::int, 500) then
    raise exception 'Keep it under % characters', coalesce((s ->> 'max_len')::int, 500);
  end if;
  why := public.chat_refuse(b);
  if why is not null then raise exception '%', why; end if;
  if (select count(*) from public.chat_messages where user_id = auth.uid() and created_at > now() - interval '1 minute')
       >= coalesce((s ->> 'per_minute')::int, 5)
     or (select count(*) from public.chat_messages where user_id = auth.uid() and created_at > now() - interval '10 minutes')
       >= coalesce((s ->> 'per_10_minutes')::int, 30) then
    raise exception 'Slow down a little: try again in a minute';
  end if;
  if exists (select 1 from public.chat_messages where user_id = auth.uid() and body = b
             and created_at > now() - interval '2 minutes') then
    raise exception 'You just sent that';
  end if;
  select nickname into nick from public.chat_profiles where user_id = auth.uid();
  nick := coalesce(nick, 'Traveller');
  insert into public.chat_messages (station_id, room, user_id, nickname, body)
    values (p_station, p_room, auth.uid(), nick, b) returning id, created_at into new_id, sent_at;
  perform realtime.send(
    jsonb_build_object('id', new_id, 'author', public.chat_author_tag(auth.uid(), p_station, sent_at), 'nickname', nick,
                       'body', b, 'created_at', sent_at),
    'message', 'chat:' || p_station || ':' || p_room, true);
  return new_id;
end $$;

-- ---------- friends' rooms ----------

create or replace function public.chat_create_room(p_station text)
returns table (room text, code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  c text;
  r public.chat_rooms;
  abc constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if not public.chat_has_pass(p_station) then raise exception 'You need to be at the station to start a room'; end if;
  if (select count(*) from public.chat_rooms where created_by = auth.uid() and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'You''ve started enough rooms for now';
  end if;
  loop
    -- 6 characters from a secure random source, without look-alikes (no 0/O, 1/I/L)
    select string_agg(substr(abc, 1 + (get_byte(b, i) % 31), 1), '' order by i) into c
      from (select extensions.gen_random_bytes(6) b) x, generate_series(0, 5) i;
    exit when not exists (select 1 from public.chat_rooms where chat_rooms.code = c);
  end loop;
  insert into public.chat_rooms (station_id, code, created_by, expires_at)
    values (p_station, c, auth.uid(), now() + make_interval(hours => coalesce((public.chat_settings() ->> 'room_hours')::int, 3)))
    returning * into r;
  insert into public.chat_room_members (room_id, user_id) values (r.id, auth.uid());
  return query select r.id::text, r.code, r.expires_at;
end $$;

-- No row back means no such room here (the failed try is counted, so codes can't be guessed).
create or replace function public.chat_join_room(p_station text, p_code text)
returns table (room text, code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare r public.chat_rooms;
begin
  if not public.chat_has_pass(p_station) then raise exception 'You need to be at the station to join'; end if;
  if (select count(*) from public.chat_join_failures where user_id = auth.uid() and at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many wrong codes. Please try again later';
  end if;
  select * into r from public.chat_rooms
    where chat_rooms.code = upper(btrim(coalesce(p_code, ''))) and chat_rooms.expires_at > now();
  if r.id is null or r.station_id <> p_station then
    insert into public.chat_join_failures (user_id) values (auth.uid());
    return;
  end if;
  insert into public.chat_room_members (room_id, user_id) values (r.id, auth.uid()) on conflict do nothing;
  return query select r.id::text, r.code, r.expires_at;
end $$;

-- ---------- reports and moderation ----------

create or replace function public.chat_report(p_message bigint, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.chat_messages;
  n int;
begin
  select * into m from public.chat_messages where id = p_message and not hidden;
  if m.id is null or not public.chat_in_room(m.station_id, m.room) then raise exception 'Message not found'; end if;
  if m.user_id = auth.uid() then raise exception 'That''s your own message'; end if;
  if (select count(*) from public.chat_reports where reporter = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You''ve sent a lot of reports. A reviewer will look at them';
  end if;
  insert into public.chat_reports (message_id, station_id, room, author, nickname, body, reporter, reason)
    values (m.id, m.station_id, m.room, m.user_id, m.nickname, m.body, auth.uid(),
            left(coalesce(nullif(btrim(p_reason), ''), 'Not given'), 200))
    on conflict (message_id, reporter) do nothing;
  -- enough people reporting the same message hides it for everyone; an admin can restore it
  select count(*) into n from public.chat_reports where message_id = m.id;
  if n >= coalesce((public.chat_settings() ->> 'hide_after_reports')::int, 3) then
    update public.chat_messages set hidden = true where id = m.id;
    perform public.chat_forget(array[m.id]);
    perform realtime.send(jsonb_build_object('id', m.id), 'delete', 'chat:' || m.station_id || ':' || m.room, true);
  end if;
end $$;

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
               (select count(*) from public.chat_reports o where o.message_id = r.message_id) reports_on_message,
               (select count(*) from public.chat_reports o where o.author = r.author) author_reports,
               coalesce((select hidden from public.chat_messages m where m.id = r.message_id), true) hidden,
               exists (select 1 from public.contributors c where c.user_id = r.author and c.blocked) banned
        from public.chat_reports r where not r.handled) x));
end $$;

-- 'dismiss': keep the message (and show it again if reports hid it); 'delete': remove it;
-- 'ban': remove all their messages everywhere and stop them using chat and video reports.
create or replace function public.chat_admin_act(p_report bigint, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.chat_reports;
  gone record;
begin
  if not public.chat_is_admin() then raise exception 'Admins only'; end if;
  select * into r from public.chat_reports where id = p_report;
  if r.id is null then raise exception 'Report not found'; end if;
  if p_action = 'dismiss' then
    update public.chat_messages set hidden = false where id = r.message_id;
  elsif p_action = 'delete' then
    delete from public.chat_messages where id = r.message_id;
    perform public.chat_forget(array[r.message_id]);
    perform realtime.send(jsonb_build_object('id', r.message_id), 'delete', 'chat:' || r.station_id || ':' || r.room, true);
  elsif p_action = 'ban' then
    insert into public.contributors (user_id, blocked) values (r.author, true)
      on conflict (user_id) do update set blocked = true;
    delete from public.chat_passes where user_id = r.author;
    for gone in delete from public.chat_messages where user_id = r.author returning id, station_id, room loop
      perform public.chat_forget(array[gone.id]);
      perform realtime.send(jsonb_build_object('id', gone.id), 'delete', 'chat:' || gone.station_id || ':' || gone.room, true);
    end loop;
  else
    raise exception 'Unknown action';
  end if;
  update public.chat_reports set handled = true
    where id = p_report or message_id = r.message_id or (p_action = 'ban' and author = r.author);
end $$;

-- ---------- grants ----------

revoke all on function public.chat_nickname() from authenticated;
revoke all on function public.chat_refuse(text), public.chat_set_nickname(text), public.chat_recent(text, text),
  public.chat_send(text, text, text), public.chat_create_room(text), public.chat_join_room(text, text),
  public.chat_report(bigint, text), public.chat_admin_overview(), public.chat_admin_act(bigint, text)
  from public, anon;
grant execute on function public.chat_set_nickname(text), public.chat_recent(text, text),
  public.chat_send(text, text, text), public.chat_create_room(text), public.chat_join_room(text, text),
  public.chat_report(bigint, text), public.chat_admin_overview(), public.chat_admin_act(bigint, text)
  to authenticated;
revoke all on function public.chat_refuse(text) from authenticated;
grant execute on function public.chat_refuse(text) to service_role;

-- evaluate the pass check once per query, not per row
drop policy if exists "station chat: pass holders listen" on realtime.messages;
create policy "station chat: pass holders listen"
  on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select public.chat_can_listen((select realtime.topic()))));

-- ---------- tidying, every 10 minutes ----------

select cron.schedule(
  'station-chat-tidy',
  '*/10 * * * *',
  $job$
  delete from public.chat_messages
    where created_at < now() - make_interval(hours => coalesce((select (value ->> 'message_hours')::int from public.settings where key = 'chat'), 2));
  delete from realtime.messages
    where topic like 'chat:%'
      and inserted_at < now() - make_interval(hours => coalesce((select (value ->> 'message_hours')::int from public.settings where key = 'chat'), 2));
  delete from public.chat_rooms where expires_at < now() - interval '1 hour';
  delete from public.chat_passes where expires_at < now() - interval '1 day';
  delete from public.chat_pass_log where day < current_date - 2;
  delete from public.chat_join_failures where at < now() - interval '1 day';
  delete from public.chat_reports where (handled and created_at < now() - interval '30 days')
                                     or created_at < now() - interval '90 days';
  $job$
);
