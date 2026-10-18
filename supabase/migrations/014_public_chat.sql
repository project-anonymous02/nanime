-- Additive Supabase-backed public chat. Existing SocialLine discussions remain
-- separate; this table models AniBiPlay's channel/message flow.
create table if not exists public.nanime_public_chat_channels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (char_length(trim(name)) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.nanime_public_chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.nanime_public_chat_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  reply_to_id uuid references public.nanime_public_chat_messages(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists nanime_public_chat_messages_history_idx
  on public.nanime_public_chat_messages(channel_id, created_at desc, id desc);

insert into public.nanime_public_chat_channels(slug, name, sort_order)
values ('umum', 'Umum', 0)
on conflict (slug) do nothing;

alter table public.nanime_public_chat_channels enable row level security;
alter table public.nanime_public_chat_messages enable row level security;
revoke all on public.nanime_public_chat_channels, public.nanime_public_chat_messages from anon, authenticated;
grant select on public.nanime_public_chat_channels to authenticated;
grant select, insert, delete on public.nanime_public_chat_messages to authenticated;

drop policy if exists nanime_public_chat_channels_read on public.nanime_public_chat_channels;
create policy nanime_public_chat_channels_read on public.nanime_public_chat_channels
  for select to authenticated using (true);
drop policy if exists nanime_public_chat_messages_read on public.nanime_public_chat_messages;
create policy nanime_public_chat_messages_read on public.nanime_public_chat_messages
  for select to authenticated using (true);
drop policy if exists nanime_public_chat_messages_send on public.nanime_public_chat_messages;
create policy nanime_public_chat_messages_send on public.nanime_public_chat_messages
  for insert to authenticated with check (
    user_id = auth.uid() and exists (
      select 1 from public.nanime_public_chat_channels c where c.id = channel_id
    ) and (
      reply_to_id is null or exists (
        select 1 from public.nanime_public_chat_messages parent
        where parent.id = public.nanime_public_chat_messages.reply_to_id
          and parent.channel_id = public.nanime_public_chat_messages.channel_id
      )
    )
  );
drop policy if exists nanime_public_chat_messages_delete_own on public.nanime_public_chat_messages;
create policy nanime_public_chat_messages_delete_own on public.nanime_public_chat_messages
  for delete to authenticated using (user_id = auth.uid());

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.nanime_public_chat_messages; exception when duplicate_object then null; end;
  end if;
end $$;
