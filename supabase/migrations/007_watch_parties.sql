-- Additive Nanime watch rooms. Rooms are invite-only by unguessable code and
-- playback writes are restricted to the room host.
create table if not exists public.nanime_watch_parties (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  host_id uuid not null references auth.users(id) on delete cascade,
  anime_id text not null,
  title text not null,
  poster text,
  episode text not null,
  position_seconds double precision not null default 0 check (position_seconds >= 0),
  is_playing boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.nanime_watch_party_members (
  party_id uuid not null references public.nanime_watch_parties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (party_id, user_id)
);
create table if not exists public.nanime_watch_party_messages (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.nanime_watch_parties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists nanime_watch_party_messages_page_idx on public.nanime_watch_party_messages(party_id, created_at desc);

alter table public.nanime_watch_parties enable row level security;
alter table public.nanime_watch_party_members enable row level security;
alter table public.nanime_watch_party_messages enable row level security;
revoke all on public.nanime_watch_parties, public.nanime_watch_party_members, public.nanime_watch_party_messages from anon, authenticated;
grant select, insert, update, delete on public.nanime_watch_parties to authenticated;
grant select, insert, delete on public.nanime_watch_party_members to authenticated;
grant select, insert on public.nanime_watch_party_messages to authenticated;

drop policy if exists nanime_watch_party_read on public.nanime_watch_parties;
create policy nanime_watch_party_read on public.nanime_watch_parties for select to authenticated using (
  host_id = auth.uid() or exists (select 1 from public.nanime_watch_party_members m where m.party_id = id and m.user_id = auth.uid())
);
drop policy if exists nanime_watch_party_create on public.nanime_watch_parties;
create policy nanime_watch_party_create on public.nanime_watch_parties for insert to authenticated with check (host_id = auth.uid());
drop policy if exists nanime_watch_party_host_update on public.nanime_watch_parties;
create policy nanime_watch_party_host_update on public.nanime_watch_parties for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());
drop policy if exists nanime_watch_party_host_delete on public.nanime_watch_parties;
create policy nanime_watch_party_host_delete on public.nanime_watch_parties for delete to authenticated using (host_id = auth.uid());
drop policy if exists nanime_watch_party_member_read on public.nanime_watch_party_members;
create policy nanime_watch_party_member_read on public.nanime_watch_party_members for select to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.nanime_watch_parties p where p.id = party_id and p.host_id = auth.uid())
);
drop policy if exists nanime_watch_party_host_add_member on public.nanime_watch_party_members;
create policy nanime_watch_party_host_add_member on public.nanime_watch_party_members for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from public.nanime_watch_parties p where p.id = party_id and p.host_id = auth.uid())
);
drop policy if exists nanime_watch_party_leave on public.nanime_watch_party_members;
create policy nanime_watch_party_leave on public.nanime_watch_party_members for delete to authenticated using (user_id = auth.uid());
drop policy if exists nanime_watch_party_message_read on public.nanime_watch_party_messages;
create policy nanime_watch_party_message_read on public.nanime_watch_party_messages for select to authenticated using (
  exists (select 1 from public.nanime_watch_party_members m where m.party_id = nanime_watch_party_messages.party_id and m.user_id = auth.uid())
);
drop policy if exists nanime_watch_party_message_write on public.nanime_watch_party_messages;
create policy nanime_watch_party_message_write on public.nanime_watch_party_messages for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from public.nanime_watch_party_members m where m.party_id = nanime_watch_party_messages.party_id and m.user_id = auth.uid())
);

create or replace function public.join_nanime_watch_party(p_invite_code text)
returns setof public.nanime_watch_parties language plpgsql security definer set search_path = public, pg_temp as $$
declare found_party public.nanime_watch_parties;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into found_party from public.nanime_watch_parties where invite_code = lower(trim(p_invite_code));
  if not found then raise exception 'room_not_found'; end if;
  insert into public.nanime_watch_party_members(party_id, user_id) values (found_party.id, auth.uid()) on conflict do nothing;
  return next found_party;
end $$;
revoke all on function public.join_nanime_watch_party(text) from public, anon;
grant execute on function public.join_nanime_watch_party(text) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.nanime_watch_parties; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.nanime_watch_party_messages; exception when duplicate_object then null; end;
  end if;
end $$;
