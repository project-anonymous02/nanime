-- Expose the same public activity total used by the leaderboard so profile,
-- friends, and chat surfaces can derive rank consistently.
drop function if exists public.get_public_profiles(uuid[]);
create function public.get_public_profiles(p_user_ids uuid[])
returns table(id uuid, username text, avatar_url text, is_developer boolean, rank text, app_usage_seconds bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare profile_row jsonb; profile_id uuid; profile_avatar text; usage_seconds bigint;
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
      select coalesce(nullif(u.raw_user_meta_data->>'avatar_url', ''), nullif(u.raw_user_meta_data->>'picture', ''))
        into profile_avatar from auth.users u where u.id = profile_id;
    end if;
    avatar_url := profile_avatar;
    is_developer := coalesce((profile_row->>'is_developer')::boolean, false);
    rank := coalesce(nullif(profile_row->>'rank', ''), 'bronze');
    select coalesce(
      (select t.seconds from public.app_usage_totals t where t.user_id = profile_id),
      (select l.app_usage_seconds from public.nanime_leaderboard l where l.id = profile_id),
      0
    ) into usage_seconds;
    app_usage_seconds := usage_seconds;
    return next;
  end loop;
end $$;
revoke all on function public.get_public_profiles(uuid[]) from public;
grant execute on function public.get_public_profiles(uuid[]) to anon, authenticated;

drop function if exists public.search_nanime_profiles(text);
create function public.search_nanime_profiles(p_query text)
returns table(id uuid, username text, avatar_url text, rank text, is_developer boolean, app_usage_seconds bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare profile_row jsonb; profile_id uuid; profile_avatar text; usage_seconds bigint; pattern text;
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
      select coalesce(nullif(u.raw_user_meta_data->>'avatar_url', ''), nullif(u.raw_user_meta_data->>'picture', ''))
        into profile_avatar from auth.users u where u.id = profile_id;
    end if;
    avatar_url := profile_avatar;
    rank := coalesce(nullif(profile_row->>'rank', ''), 'bronze');
    is_developer := coalesce((profile_row->>'is_developer')::boolean, false);
    select coalesce(
      (select t.seconds from public.app_usage_totals t where t.user_id = profile_id),
      (select l.app_usage_seconds from public.nanime_leaderboard l where l.id = profile_id),
      0
    ) into usage_seconds;
    app_usage_seconds := usage_seconds;
    return next;
  end loop;
end $$;
revoke all on function public.search_nanime_profiles(text) from public, anon;
grant execute on function public.search_nanime_profiles(text) to authenticated;
