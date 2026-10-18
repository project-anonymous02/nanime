-- Repair the watch heartbeat's profile-key assumption without rewriting an
-- already-applied migration. Supports the original user_id/display_name
-- profile shape and the connected id/username shape.
insert into public.nanime_leaderboard(id, username, avatar_url, is_developer, watch_seconds, rank, updated_at)
select coalesce(j->>'id', j->>'user_id')::uuid,
  coalesce(nullif(j->>'username', ''), nullif(j->>'display_name', ''), ''),
  nullif(j->>'avatar_url', ''), coalesce((j->>'is_developer')::boolean, false),
  coalesce((j->>'watch_seconds')::bigint, 0), coalesce(nullif(j->>'rank', ''), 'bronze'), now()
from (select to_jsonb(p) as j from public.profiles p) as profile_rows
where coalesce(j->>'id', j->>'user_id') is not null
on conflict (id) do update set
  username = excluded.username,
  avatar_url = excluded.avatar_url,
  is_developer = excluded.is_developer,
  watch_seconds = excluded.watch_seconds,
  rank = excluded.rank,
  updated_at = now();

create or replace function public.record_watch_heartbeat(p_session_id uuid, p_paused boolean default false)
returns public.watch_sessions language plpgsql security definer set search_path = public as $$
declare s public.watch_sessions; delta integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into s from public.watch_sessions where id = p_session_id and user_id = auth.uid() for update;
  if not found or s.ended_at is not null then raise exception 'invalid watch session'; end if;
  delta := case when p_paused or s.paused then 0 else least(30, greatest(0, extract(epoch from (now() - s.last_heartbeat_at))::integer)) end;
  update public.watch_sessions set watched_seconds = least(86400, watched_seconds + delta), last_heartbeat_at = now(), paused = p_paused where id = s.id returning * into s;
  if delta > 0 then
    perform set_config('nanime.trusted_watch', 'on', true);
    execute $profile_update$
      update public.profiles p set watch_seconds = p.watch_seconds + $1,
        rank = case when p.is_developer then 'developer' when p.watch_seconds + $1 >= 100000 then 'diamond' when p.watch_seconds + $1 >= 50000 then 'platinum' when p.watch_seconds + $1 >= 20000 then 'gold' when p.watch_seconds + $1 >= 5000 then 'silver' else 'bronze' end
      where coalesce(to_jsonb(p)->>'id', to_jsonb(p)->>'user_id') = $2
    $profile_update$ using delta, auth.uid()::text;
    execute $leaderboard_sync$
      insert into public.nanime_leaderboard(id, username, avatar_url, is_developer, watch_seconds, rank, updated_at)
      select coalesce(j->>'id', j->>'user_id')::uuid,
        coalesce(nullif(j->>'username', ''), nullif(j->>'display_name', ''), ''),
        nullif(j->>'avatar_url', ''), coalesce((j->>'is_developer')::boolean, false),
        coalesce((j->>'watch_seconds')::bigint, 0), coalesce(nullif(j->>'rank', ''), 'bronze'), now()
      from (select to_jsonb(p) as j from public.profiles p) as profile_rows
      where coalesce(j->>'id', j->>'user_id') = $1
      on conflict (id) do update set username = excluded.username, avatar_url = excluded.avatar_url,
        is_developer = excluded.is_developer, watch_seconds = excluded.watch_seconds,
        rank = excluded.rank, updated_at = now()
    $leaderboard_sync$ using auth.uid()::text;
  end if;
  return s;
end $$;
revoke all on function public.record_watch_heartbeat(uuid, boolean) from public;
grant execute on function public.record_watch_heartbeat(uuid, boolean) to authenticated;
