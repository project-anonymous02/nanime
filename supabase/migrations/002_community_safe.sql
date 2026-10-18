-- Community and trusted watch accounting. This migration is additive: it never
-- drops or replaces the existing library tables.
create extension if not exists "pgcrypto";

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists is_developer boolean not null default false;
alter table public.profiles add column if not exists watch_seconds bigint not null default 0;
alter table public.profiles add column if not exists rank text not null default 'bronze';

create table if not exists public.anime_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  anime_id text not null,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.public_discussions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  content text not null check (char_length(trim(content)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.discussion_replies (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.public_discussions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.watch_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  anime_id text not null,
  episode text not null,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  watched_seconds integer not null default 0 check (watched_seconds between 0 and 86400),
  paused boolean not null default false,
  ended_at timestamptz
);
create table if not exists public.nanime_leaderboard (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null default '', avatar_url text, is_developer boolean not null default false,
  watch_seconds bigint not null default 0, rank text not null default 'bronze',
  updated_at timestamptz not null default now()
);

create index if not exists anime_comments_anime_created_idx on public.anime_comments(anime_id, created_at desc);
create index if not exists public_discussions_created_idx on public.public_discussions(created_at desc);
create index if not exists discussion_replies_discussion_created_idx on public.discussion_replies(discussion_id, created_at);
create index if not exists watch_sessions_user_active_idx on public.watch_sessions(user_id, ended_at);
create index if not exists nanime_leaderboard_rank_idx on public.nanime_leaderboard(watch_seconds desc);

-- Client updates may change a profile name/avatar, but never rank, developer
-- status, or accumulated watch time. Trusted heartbeat code sets a transaction
-- local marker before changing those fields.
create or replace function public.nanime_protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('nanime.trusted_watch', true) is distinct from 'on' then
    new.is_developer := old.is_developer;
    new.watch_seconds := old.watch_seconds;
    new.rank := old.rank;
  end if;
  return new;
end $$;
drop trigger if exists nanime_profile_protected_fields on public.profiles;
create trigger nanime_profile_protected_fields before update on public.profiles
for each row execute function public.nanime_protect_profile_fields();

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
    update public.profiles set watch_seconds = watch_seconds + delta, rank = case when is_developer then 'developer' when watch_seconds + delta >= 100000 then 'diamond' when watch_seconds + delta >= 50000 then 'platinum' when watch_seconds + delta >= 20000 then 'gold' when watch_seconds + delta >= 5000 then 'silver' else 'bronze' end where id = auth.uid();
  end if;
  return s;
end $$;
revoke all on function public.record_watch_heartbeat(uuid, boolean) from public;
grant execute on function public.record_watch_heartbeat(uuid, boolean) to authenticated;

alter table public.anime_comments enable row level security;
alter table public.public_discussions enable row level security;
alter table public.discussion_replies enable row level security;
alter table public.watch_sessions enable row level security;
alter table public.nanime_leaderboard enable row level security;

drop policy if exists anime_comments_public_read on public.anime_comments;
create policy anime_comments_public_read on public.anime_comments for select using (true);
drop policy if exists anime_comments_owner_write on public.anime_comments;
create policy anime_comments_owner_write on public.anime_comments for insert with check (auth.uid() = user_id);
drop policy if exists anime_comments_owner_update on public.anime_comments;
create policy anime_comments_owner_update on public.anime_comments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists anime_comments_owner_delete on public.anime_comments;
create policy anime_comments_owner_delete on public.anime_comments for delete using (auth.uid() = user_id);

drop policy if exists discussions_public_read on public.public_discussions;
create policy discussions_public_read on public.public_discussions for select using (true);
drop policy if exists discussions_owner_insert on public.public_discussions;
create policy discussions_owner_insert on public.public_discussions for insert with check (auth.uid() = user_id);
drop policy if exists discussions_owner_update on public.public_discussions;
create policy discussions_owner_update on public.public_discussions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists discussions_owner_delete on public.public_discussions;
create policy discussions_owner_delete on public.public_discussions for delete using (auth.uid() = user_id);

drop policy if exists replies_public_read on public.discussion_replies;
create policy replies_public_read on public.discussion_replies for select using (true);
drop policy if exists replies_owner_insert on public.discussion_replies;
create policy replies_owner_insert on public.discussion_replies for insert with check (auth.uid() = user_id);
drop policy if exists replies_owner_update on public.discussion_replies;
create policy replies_owner_update on public.discussion_replies for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists replies_owner_delete on public.discussion_replies;
create policy replies_owner_delete on public.discussion_replies for delete using (auth.uid() = user_id);

drop policy if exists watch_sessions_owner_read on public.watch_sessions;
create policy watch_sessions_owner_read on public.watch_sessions for select using (auth.uid() = user_id);
drop policy if exists leaderboard_public_read on public.nanime_leaderboard;
create policy leaderboard_public_read on public.nanime_leaderboard for select using (true);
