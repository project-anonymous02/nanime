-- Fixes for the first heartbeat implementation. Additive and safe to rerun.
-- The connected project already had watch_sessions with episode_id and
-- completed. Add the fields needed by the bounded heartbeat without replacing
-- existing rows or changing their identity.
alter table public.watch_sessions add column if not exists episode text;
alter table public.watch_sessions add column if not exists episode_id text;
alter table public.watch_sessions add column if not exists watched_seconds integer not null default 0;
alter table public.watch_sessions add column if not exists paused boolean not null default false;
alter table public.watch_sessions add column if not exists ended_at timestamptz;
update public.watch_sessions set episode = episode_id where episode is null;

create or replace function public.start_watch_session(p_anime_id text, p_episode text)
returns public.watch_sessions language plpgsql security definer set search_path = public as $$
declare s public.watch_sessions;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.watch_sessions set ended_at = now()
    where user_id = auth.uid() and ended_at is null;
  insert into public.watch_sessions(user_id, anime_id, episode_id, episode)
    values (auth.uid(), left(trim(p_anime_id), 300), left(trim(p_episode), 50), left(trim(p_episode), 50)) returning * into s;
  return s;
end $$;

insert into public.nanime_leaderboard(id, username, avatar_url, is_developer, watch_seconds, rank, updated_at)
select id, coalesce(username, ''), avatar_url, is_developer, watch_seconds, rank, now()
from public.profiles
on conflict (id) do update set username = excluded.username, avatar_url = excluded.avatar_url, is_developer = excluded.is_developer, watch_seconds = excluded.watch_seconds, rank = excluded.rank, updated_at = now();
revoke all on function public.start_watch_session(text, text) from public;
grant execute on function public.start_watch_session(text, text) to authenticated;

create or replace function public.end_watch_session(p_session_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.watch_sessions set ended_at = coalesce(ended_at, now())
  where id = p_session_id and user_id = auth.uid();
$$;
revoke all on function public.end_watch_session(uuid) from public;
grant execute on function public.end_watch_session(uuid) to authenticated;

create or replace function public.record_watch_heartbeat(p_session_id uuid, p_paused boolean default false)
returns public.watch_sessions language plpgsql security definer set search_path = public as $$
declare s public.watch_sessions; delta integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into s from public.watch_sessions where id = p_session_id and user_id = auth.uid() for update;
  if not found or s.ended_at is not null then raise exception 'invalid watch session'; end if;
  -- Server time is authoritative. A paused request never accrues time; a
  -- resume request starts counting from this heartbeat onward.
  delta := case when p_paused then 0 else least(30, greatest(0, extract(epoch from (now() - s.last_heartbeat_at))::integer)) end;
  update public.watch_sessions set watched_seconds = least(86400, watched_seconds + delta), last_heartbeat_at = now(), paused = p_paused where id = s.id returning * into s;
  if delta > 0 then
    perform set_config('nanime.trusted_watch', 'on', true);
    update public.profiles set watch_seconds = watch_seconds + delta,
      rank = case when is_developer then 'developer' when watch_seconds + delta >= 100000 then 'diamond' when watch_seconds + delta >= 50000 then 'platinum' when watch_seconds + delta >= 20000 then 'gold' when watch_seconds + delta >= 5000 then 'silver' else 'bronze' end
      where id = auth.uid();
    insert into public.nanime_leaderboard(id, username, avatar_url, is_developer, watch_seconds, rank, updated_at)
      select id, coalesce(username, ''), avatar_url, is_developer, watch_seconds, rank, now() from public.profiles where id = auth.uid()
      on conflict (id) do update set username = excluded.username, avatar_url = excluded.avatar_url, is_developer = excluded.is_developer, watch_seconds = excluded.watch_seconds, rank = excluded.rank, updated_at = now();
  end if;
  return s;
end $$;
