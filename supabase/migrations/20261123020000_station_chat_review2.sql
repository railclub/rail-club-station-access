-- Station Chat, second review (23 Nov 2026).
--  N1  the link filter took "late. In the meantime" for a link: no space after the dot now.
--  N1b the phone filter took a list of times for a number: digits are joined only across
--      the separators people put inside phone numbers.
--  N4  a message an admin kept could be hidden again by one more report: count only open reports.
--  N5  nickname words match whole words only ("Charlotte" is fine, "TTE" isn't).
--  N6  chat_forget compares ids as text, so another topic's non-numeric id can't break it.

create or replace function public.chat_refuse(p_text text) returns text
language sql immutable set search_path = '' as $$
  with t as (select
    -- Devanagari digits as 0-9, and digits joined across phone-number separators ("98765/43210", "98 76 54 32 10")
    regexp_replace(translate(p_text, '०१२३४५६७८९', '0123456789'), '([0-9])[[:space:]./_()-]{1,2}(?=[0-9])', '\1', 'g') as digits)
  select case
    when p_text ~* '(https?://|www\.|\m[a-z0-9-]+\s?\.(com|in|net|org|io|co|me|ly|xyz|app|link|info|biz|online|site|shop|top|tk)\M|\mdot\s+(com|net|org|in|ly)\M)'
      then 'Links aren''t allowed in station chat'
    when (select digits from t) ~ '(91)?[6-9][0-9]{9}'
      then 'Phone numbers aren''t allowed in station chat. Stay safe: don''t share contact details with strangers'
    when p_text ~* '[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9.-]+\.[a-z]{2,}'
      then 'Email addresses aren''t allowed in station chat'
    else null end;
$$;
revoke all on function public.chat_refuse(text) from public, anon, authenticated;
grant execute on function public.chat_refuse(text) to service_role;

create or replace function public.chat_set_nickname(p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  if n !~ '^[A-Za-z0-9 _.-]{3,20}$' then raise exception 'Use 3 to 20 English letters, numbers or spaces'; end if;
  if public.chat_refuse(n) is not null or n ~ '[0-9]{6,}'
     or n ~* '(\m(rpf|grp|tte|tc|you)\M|rail ?madad|railway|irctc|admin|police|official|helpline|support|rail ?club)' then
    raise exception 'Please pick another nickname';
  end if;
  insert into public.chat_profiles (user_id, nickname) values (auth.uid(), n)
    on conflict (user_id) do update set nickname = excluded.nickname;
  return n;
end $$;

create or replace function public.chat_forget(p_ids bigint[]) returns void
language sql security definer set search_path = '' as $$
  delete from realtime.messages where topic like 'chat:%' and event = 'message'
    and payload ->> 'id' = any (p_ids::text[]);
$$;
revoke all on function public.chat_forget(bigint[]) from public, anon, authenticated;

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
  -- enough open reports on the same message hide it for everyone; an admin can restore it
  select count(*) into n from public.chat_reports where message_id = m.id and not handled;
  if n >= coalesce((public.chat_settings() ->> 'hide_after_reports')::int, 3) then
    update public.chat_messages set hidden = true where id = m.id;
    perform public.chat_forget(array[m.id]);
    perform realtime.send(jsonb_build_object('id', m.id), 'delete', 'chat:' || m.station_id || ':' || m.room, true);
  end if;
end $$;
revoke all on function public.chat_report(bigint, text) from public, anon;
grant execute on function public.chat_report(bigint, text) to authenticated;
