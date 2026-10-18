-- Separate trusted application usage from watch time and expose only the
-- minimum public profile fields needed by discussion avatars/leaderboard.
create table if not exists public.app_usage_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  active boolean not null default true,
  ended_at timestamptz
);
create index if not exists app_usage_sessions_user_open_idx
  on public.app_usage_sessions(user_id, ended_at) where ended_at is null;

create table if not exists public.app_usage_totals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seconds bigint not null default 0 check (seconds >= 0),
  updated_at timestamptz not null default now()
);

alter table public.nanime_leaderboard
  add column if not exists app_usage_seconds bigint not null default 0;
alter table public.nanime_leaderboard enable row level security;
create index if not exists nanime_leaderboard_app_usage_idx
  on public.nanime_leaderboard(app_usage_seconds desc, id);
drop policy if exists leaderboard_public_read on public.nanime_leaderboard;
create policy leaderboard_public_read on public.nanime_leaderboard for select using (true);
revoke select on public.nanime_leaderboard from anon, authenticated;
grant select (id, username, avatar_url, is_developer, rank, updated_at, app_usage_seconds)
  on public.nanime_leaderboard to anon, authenticated;

alter table public.app_usage_sessions enable row level security;
alter table public.app_usage_totals enable row level security;
drop policy if exists app_usage_sessions_owner_read on public.app_usage_sessions;
create policy app_usage_sessions_owner_read on public.app_usage_sessions
  for select using (auth.uid() = user_id);
revoke all on public.app_usage_sessions from anon, authenticated;
grant select on public.app_usage_sessions to authenticated;
revoke all on public.app_usage_totals from anon, authenticated;

-- The initial schema used user_id/display_name while the connected application
-- schema uses id/username. Read through JSON so this safe RPC supports either
-- shape and never returns email or other private profile fields.
create or replace function public.get_public_profiles(p_user_ids uuid[])
returns table(id uuid, username text, avatar_url text, is_developer boolean, rank text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare profile_row jsonb;
begin
  if coalesce(array_length(p_user_ids, 1), 0) = 0 then return; end if;
  for profile_row in
    select to_jsonb(p) from public.profiles p
    where coalesce(to_jsonb(p)->>'id', to_jsonb(p)->>'user_id') = any(select unnest(p_user_ids)::text)
  loop
    id := coalesce(profile_row->>'id', profile_row->>'user_id')::uuid;
    username := coalesce(nullif(profile_row->>'username', ''), nullif(profile_row->>'display_name', ''), 'Pengguna');
    avatar_url := nullif(profile_row->>'avatar_url', '');
    is_developer := coalesce((profile_row->>'is_developer')::boolean, false);
    rank := coalesce(nullif(profile_row->>'rank', ''), 'bronze');
    return next;
  end loop;
end $$;
revoke all on function public.get_public_profiles(uuid[]) from public;
grant execute on function public.get_public_profiles(uuid[]) to anon, authenticated;

create or replace function public.start_app_usage_session(p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare session_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  update public.app_usage_sessions set ended_at = now()
    where user_id = auth.uid() and ended_at is null;
  insert into public.app_usage_sessions(user_id, active)
    values (auth.uid(), coalesce(p_active, false)) returning id into session_id;
  return session_id;
end $$;
revoke all on function public.start_app_usage_session(boolean) from public;
grant execute on function public.start_app_usage_session(boolean) to authenticated;

create or replace function public.record_app_usage_heartbeat(p_session_id uuid, p_active boolean)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.app_usage_sessions; delta integer := 0; total_seconds bigint;
  profile_row jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into s from public.app_usage_sessions
    where id = p_session_id and user_id = auth.uid() for update;
  if not found or s.ended_at is not null then raise exception 'invalid app usage session'; end if;
  -- Server time is authoritative. Paused/background intervals never accrue,
  -- and a missed heartbeat can contribute no more than 30 seconds.
  if s.active then
    delta := least(30, greatest(0, floor(extract(epoch from (now() - s.last_heartbeat_at)))::integer));
  end if;
  update public.app_usage_sessions set active = coalesce(p_active, false), last_heartbeat_at = now()
    where id = s.id;
  if delta > 0 then
    insert into public.app_usage_totals(user_id, seconds, updated_at)
      values (auth.uid(), delta, now())
      on conflict (user_id) do update set seconds = public.app_usage_totals.seconds + excluded.seconds, updated_at = now();
  end if;
  select seconds into total_seconds from public.app_usage_totals where user_id = auth.uid();
  total_seconds := coalesce(total_seconds, 0);
  select to_jsonb(p) into profile_row from public.profiles p
    where coalesce(to_jsonb(p)->>'id', to_jsonb(p)->>'user_id') = auth.uid()::text limit 1;
  insert into public.nanime_leaderboard(id, username, avatar_url, is_developer, watch_seconds, rank, updated_at, app_usage_seconds)
    values (auth.uid(), coalesce(nullif(profile_row->>'username', ''), nullif(profile_row->>'display_name', ''), ''),
      nullif(profile_row->>'avatar_url', ''), coalesce((profile_row->>'is_developer')::boolean, false),
      coalesce((profile_row->>'watch_seconds')::bigint, 0), coalesce(nullif(profile_row->>'rank', ''), 'bronze'), now(), total_seconds)
    on conflict (id) do update set username = excluded.username, avatar_url = excluded.avatar_url,
      is_developer = excluded.is_developer, rank = excluded.rank, app_usage_seconds = excluded.app_usage_seconds,
      updated_at = now();
  return total_seconds;
end $$;
revoke all on function public.record_app_usage_heartbeat(uuid, boolean) from public;
grant execute on function public.record_app_usage_heartbeat(uuid, boolean) to authenticated;

create or replace function public.end_app_usage_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.app_usage_sessions set active = false, ended_at = coalesce(ended_at, now())
    where id = p_session_id and user_id = auth.uid();
end $$;
revoke all on function public.end_app_usage_session(uuid) from public;
grant execute on function public.end_app_usage_session(uuid) to authenticated;
