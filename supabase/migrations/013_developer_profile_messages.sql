-- Nanime developer identity and profile announcements. Additive; no user IDs or
-- existing rows are deleted. The auth UUID remains the canonical account ID.
alter table public.profiles add column if not exists developer_level integer not null default 1;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_developer_level_range' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_developer_level_range
      check (developer_level between 1 and 9999) not valid;
  end if;
end $$;
alter table public.profiles validate constraint profiles_developer_level_range;

create or replace function public.nanime_is_developer(p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = pg_catalog, auth as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_user_id and p_user_id = auth.uid()
      and lower(coalesce(u.email, '')) = 'kusumanata767@gmail.com'
      and u.email_confirmed_at is not null
  )
$$;
revoke all on function public.nanime_is_developer(uuid) from public, anon;
grant execute on function public.nanime_is_developer(uuid) to authenticated;

-- Protect trusted profile fields on both insertion and update, and assign the
-- developer badge from the verified Supabase Auth identity, never client input.
create or replace function public.nanime_protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare profile_user_id uuid;
begin
  profile_user_id := coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(new)->>'user_id')::uuid);
  if tg_op = 'UPDATE' and current_setting('nanime.trusted_watch', true) is distinct from 'on' then
    new.is_developer := old.is_developer;
    new.watch_seconds := old.watch_seconds;
    new.rank := old.rank;
    new.developer_level := old.developer_level;
  elsif tg_op = 'INSERT' and current_setting('nanime.trusted_watch', true) is distinct from 'on' then
    new.is_developer := false;
    new.watch_seconds := 0;
    new.rank := 'bronze';
    new.developer_level := 1;
  end if;

  if exists (
    select 1 from auth.users u where u.id = profile_user_id
      and lower(coalesce(u.email, '')) = 'kusumanata767@gmail.com'
      and u.email_confirmed_at is not null
  ) then
    new.is_developer := true;
    new.rank := 'developer';
    new.developer_level := 9999;
  elsif tg_op = 'UPDATE' and current_setting('nanime.trusted_watch', true) is distinct from 'on' then
    -- Keep ordinary rank/level server-owned too.
    new.rank := old.rank;
  end if;
  return new;
end $$;
drop trigger if exists nanime_profile_protected_fields on public.profiles;
create trigger nanime_profile_protected_fields before insert or update on public.profiles
for each row execute function public.nanime_protect_profile_fields();

-- Promote the matching account if it already has a profile. The trigger keeps
-- it promoted on future profile updates; this update does not alter its UUID.
update public.profiles p
set is_developer = true, rank = 'developer', developer_level = 9999
where coalesce(to_jsonb(p)->>'id', to_jsonb(p)->>'user_id')::uuid in (
  select u.id from auth.users u where lower(coalesce(u.email, '')) = 'kusumanata767@gmail.com'
    and u.email_confirmed_at is not null
);

create table if not exists public.nanime_developer_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists nanime_developer_messages_created_idx
  on public.nanime_developer_messages(created_at desc);
alter table public.nanime_developer_messages enable row level security;
revoke all on public.nanime_developer_messages from anon, authenticated;
grant select on public.nanime_developer_messages to authenticated;
grant insert (author_id, content) on public.nanime_developer_messages to authenticated;
drop policy if exists nanime_developer_messages_read on public.nanime_developer_messages;
create policy nanime_developer_messages_read on public.nanime_developer_messages
  for select to authenticated using (true);
drop policy if exists nanime_developer_messages_developer_send on public.nanime_developer_messages;
create policy nanime_developer_messages_developer_send on public.nanime_developer_messages
  for insert to authenticated with check (author_id = auth.uid() and public.nanime_is_developer(auth.uid()));
