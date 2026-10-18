-- Private clan chat based on the AniBiPlay clan message flow. Only current
-- members can read/send; there are no client update/delete privileges.
create table if not exists public.nanime_game_clan_messages (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references public.nanime_game_clans(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists nanime_game_clan_messages_history_idx
  on public.nanime_game_clan_messages(clan_id, created_at desc, id desc);

alter table public.nanime_game_clan_messages enable row level security;
revoke all on public.nanime_game_clan_messages from anon, authenticated;
grant select on public.nanime_game_clan_messages to authenticated;
grant insert (clan_id, sender_id, content) on public.nanime_game_clan_messages to authenticated;
drop policy if exists nanime_game_clan_messages_member_read on public.nanime_game_clan_messages;
create policy nanime_game_clan_messages_member_read
  on public.nanime_game_clan_messages for select to authenticated
  using (exists (
    select 1 from public.nanime_game_clan_members m
    where m.clan_id = nanime_game_clan_messages.clan_id and m.user_id = auth.uid()
  ));
drop policy if exists nanime_game_clan_messages_member_send on public.nanime_game_clan_messages;
create policy nanime_game_clan_messages_member_send
  on public.nanime_game_clan_messages for insert to authenticated
  with check (sender_id = auth.uid() and exists (
    select 1 from public.nanime_game_clan_members m
    where m.clan_id = nanime_game_clan_messages.clan_id and m.user_id = auth.uid()
  ));
