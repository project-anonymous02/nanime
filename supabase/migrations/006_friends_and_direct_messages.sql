-- Additive Nanime social graph and private direct messages.
-- Existing profile, library, and community tables are not changed.
create table if not exists public.nanime_friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nanime_friend_requests_not_self check (requester_id <> recipient_id)
);
create unique index if not exists nanime_friend_requests_open_pair_idx
  on public.nanime_friend_requests(least(requester_id, recipient_id), greatest(requester_id, recipient_id))
  where status in ('pending', 'accepted');
create index if not exists nanime_friend_requests_recipient_idx
  on public.nanime_friend_requests(recipient_id, status, created_at desc);
create index if not exists nanime_friend_requests_requester_idx
  on public.nanime_friend_requests(requester_id, status, created_at desc);

alter table public.nanime_friend_requests enable row level security;
revoke all on public.nanime_friend_requests from anon, authenticated;
grant select, insert, delete on public.nanime_friend_requests to authenticated;
grant update(status) on public.nanime_friend_requests to authenticated;
drop policy if exists nanime_friend_requests_participant_read on public.nanime_friend_requests;
create policy nanime_friend_requests_participant_read on public.nanime_friend_requests
  for select to authenticated using (auth.uid() in (requester_id, recipient_id));
drop policy if exists nanime_friend_requests_owner_create on public.nanime_friend_requests;
create policy nanime_friend_requests_owner_create on public.nanime_friend_requests
  for insert to authenticated with check (auth.uid() = requester_id and status = 'pending');
drop policy if exists nanime_friend_requests_recipient_respond on public.nanime_friend_requests;
create policy nanime_friend_requests_recipient_respond on public.nanime_friend_requests
  for update to authenticated using (auth.uid() = recipient_id and status = 'pending')
  with check (auth.uid() = recipient_id and status in ('accepted', 'declined'));
drop policy if exists nanime_friend_requests_cancel_or_unfriend on public.nanime_friend_requests;
create policy nanime_friend_requests_cancel_or_unfriend on public.nanime_friend_requests
  for delete to authenticated using (
    (auth.uid() = requester_id and status = 'pending') or
    (auth.uid() in (requester_id, recipient_id) and status = 'accepted')
  );

create table if not exists public.nanime_direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint nanime_direct_messages_not_self check (sender_id <> recipient_id)
);
create index if not exists nanime_direct_messages_pair_created_idx
  on public.nanime_direct_messages(least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at desc);
alter table public.nanime_direct_messages enable row level security;
revoke all on public.nanime_direct_messages from anon, authenticated;
grant select, insert on public.nanime_direct_messages to authenticated;
grant update(read_at) on public.nanime_direct_messages to authenticated;
drop policy if exists nanime_direct_messages_friend_read on public.nanime_direct_messages;
create policy nanime_direct_messages_friend_read on public.nanime_direct_messages
  for select to authenticated using (
    auth.uid() in (sender_id, recipient_id) and exists (
      select 1 from public.nanime_friend_requests f
      where f.status = 'accepted' and (
        (f.requester_id = sender_id and f.recipient_id = recipient_id) or
        (f.requester_id = recipient_id and f.recipient_id = sender_id)
      )
    )
  );
drop policy if exists nanime_direct_messages_friend_send on public.nanime_direct_messages;
create policy nanime_direct_messages_friend_send on public.nanime_direct_messages
  for insert to authenticated with check (
    auth.uid() = sender_id and exists (
      select 1 from public.nanime_friend_requests f
      where f.status = 'accepted' and (
        (f.requester_id = sender_id and f.recipient_id = recipient_id) or
        (f.requester_id = recipient_id and f.recipient_id = sender_id)
      )
    )
  );
drop policy if exists nanime_direct_messages_recipient_read on public.nanime_direct_messages;
create policy nanime_direct_messages_recipient_read on public.nanime_direct_messages
  for update to authenticated using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- Safe profile lookup: only authenticated users, names/avatar/rank, bounded results.
-- Read JSON to support both known Nanime profile layouts (id or user_id).
create or replace function public.search_nanime_profiles(p_query text)
returns table(id uuid, username text, avatar_url text, rank text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare profile_row jsonb;
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
    id := coalesce(profile_row->>'id', profile_row->>'user_id')::uuid;
    username := coalesce(nullif(profile_row->>'username', ''), nullif(profile_row->>'display_name', ''), 'Pengguna');
    avatar_url := nullif(profile_row->>'avatar_url', '');
    rank := coalesce(nullif(profile_row->>'rank', ''), 'bronze');
    return next;
  end loop;
end $$;
revoke all on function public.search_nanime_profiles(text) from public, anon;
grant execute on function public.search_nanime_profiles(text) to authenticated;
