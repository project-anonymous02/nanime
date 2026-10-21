-- Keep Google profile photos visible in public surfaces.
-- Some accounts were created before the app wrote avatar_url into profiles, so
-- comments, public profiles, and the leaderboard snapshot showed initials even
-- though Supabase Auth already stored the Google picture.

-- 1) Backfill profile photos from the trusted auth metadata. JSON access keeps
--    this compatible with both known profile layouts (id/user_id).
update public.profiles p
set avatar_url = coalesce(
  nullif(u.raw_user_meta_data->>'avatar_url', ''),
  nullif(u.raw_user_meta_data->>'picture', '')
)
from auth.users u
where coalesce(to_jsonb(p)->>'id', to_jsonb(p)->>'user_id') = u.id::text
  and nullif(to_jsonb(p)->>'avatar_url', '') is null
  and coalesce(
    nullif(u.raw_user_meta_data->>'avatar_url', ''),
    nullif(u.raw_user_meta_data->>'picture', '')
  ) is not null;

-- 2) Refresh the public leaderboard snapshot so existing rows stop serving a
--    stale/null avatar. Future heartbeats copy the same fields.
update public.nanime_leaderboard l
set username = coalesce(
      nullif(pr.j->>'username', ''),
      nullif(pr.j->>'display_name', ''),
      l.username
    ),
    avatar_url = coalesce(nullif(pr.j->>'avatar_url', ''), l.avatar_url),
    updated_at = now()
from (select to_jsonb(p) as j from public.profiles p) pr
where l.id = coalesce(pr.j->>'id', pr.j->>'user_id')::uuid
  and (
    l.avatar_url is distinct from coalesce(nullif(pr.j->>'avatar_url', ''), l.avatar_url)
    or l.username is distinct from coalesce(
      nullif(pr.j->>'username', ''),
      nullif(pr.j->>'display_name', ''),
      l.username
    )
  );

-- 3) Public profile RPCs fall back to the Google photo in auth metadata when
--    an older profile row has not been written yet. No email or private field
--    is exposed.
create or replace function public.get_public_profiles(p_user_ids uuid[])
returns table(id uuid, username text, avatar_url text, is_developer boolean, rank text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare profile_row jsonb; profile_id uuid; profile_avatar text;
begin
  if coalesce(array_length(p_user_ids, 1), 0) = 0 then return; end if;
  for profile_row in
    select to_jsonb(p) from public.profiles p
    where coalesce(to_jsonb(p)->>'id', to_jsonb(p)->>'user_id') = any(select unnest(p_user_ids)::text)
  loop
    profile_id := coalesce(profile_row->>'id', profile_row->>'user_id')::uuid;
    id := profile_id;
    username := coalesce(nullif(profile_row->>'username', ''), nullif(profile_row->>'display_name', ''), 'Pengguna');
    profile_avatar := nullif(profile_row->>'avatar_url', '');
    if profile_avatar is null then
      select coalesce(
        nullif(u.raw_user_meta_data->>'avatar_url', ''),
        nullif(u.raw_user_meta_data->>'picture', '')
      ) into profile_avatar
      from auth.users u where u.id = profile_id;
    end if;
    avatar_url := profile_avatar;
    is_developer := coalesce((profile_row->>'is_developer')::boolean, false);
    rank := coalesce(nullif(profile_row->>'rank', ''), 'bronze');
    return next;
  end loop;
end $$;
revoke all on function public.get_public_profiles(uuid[]) from public;
grant execute on function public.get_public_profiles(uuid[]) to anon, authenticated;

create or replace function public.search_nanime_profiles(p_query text)
returns table(id uuid, username text, avatar_url text, rank text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare profile_row jsonb; profile_id uuid; profile_avatar text;
declare pattern text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if char_length(trim(coalesce(p_query, ''))) < 3 then return; end if;
  pattern := '%' || replace(replace(replace(lower(trim(p_query)), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  for profile_row in
    select to_jsonb(p) from public.profiles p
    where coalesce(to_jsonb(p)->>'id', to_jsonb(p)->>'user_id') <> auth.uid()::text
      and lower(coalesce(nullif(to_jsonb(p)->>'username', ''), nullif(to_jsonb(p)->>'display_name', ''), '')) like pattern escape E'\\'
    order by lower(coalesce(nullif(to_jsonb(p)->>'username', ''), nullif(to_jsonb(p)->>'display_name', ''), ''))
    limit 30
  loop
    profile_id := coalesce(profile_row->>'id', profile_row->>'user_id')::uuid;
    id := profile_id;
    username := coalesce(nullif(profile_row->>'username', ''), nullif(profile_row->>'display_name', ''), 'Pengguna');
    profile_avatar := nullif(profile_row->>'avatar_url', '');
    if profile_avatar is null then
      select coalesce(
        nullif(u.raw_user_meta_data->>'avatar_url', ''),
        nullif(u.raw_user_meta_data->>'picture', '')
      ) into profile_avatar
      from auth.users u where u.id = profile_id;
    end if;
    avatar_url := profile_avatar;
    rank := coalesce(nullif(profile_row->>'rank', ''), 'bronze');
    return next;
  end loop;
end $$;
revoke all on function public.search_nanime_profiles(text) from public, anon;
grant execute on function public.search_nanime_profiles(text) to authenticated;
