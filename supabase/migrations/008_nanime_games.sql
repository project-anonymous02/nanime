-- Nanime game economy and guilds. Crystal mutations are only possible via
-- security-definer RPCs; the ledger is append-only for authenticated clients.
create table if not exists public.nanime_game_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  crystals bigint not null default 0 check (crystals >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.nanime_game_clans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 3 and 32),
  tag text not null unique check (tag ~ '^[A-Z0-9]{2,6}$'),
  description text not null default '' check (char_length(description) <= 240),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.nanime_game_clan_members (
  clan_id uuid not null references public.nanime_game_clans(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'member')),
  joined_at timestamptz not null default now(),
  primary key (clan_id, user_id)
);
create table if not exists public.nanime_game_clan_join_requests (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references public.nanime_game_clans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists nanime_clan_join_one_pending_per_user on public.nanime_game_clan_join_requests(user_id) where status = 'pending';
create index if not exists nanime_clan_join_requests_clan_idx on public.nanime_game_clan_join_requests(clan_id, status, created_at);
create table if not exists public.nanime_crystal_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null check (amount > 0),
  reason text not null check (reason in ('daily_clan_claim')),
  clan_id uuid references public.nanime_game_clans(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.nanime_clan_daily_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_date date not null default (timezone('utc', now()))::date,
  clan_id uuid references public.nanime_game_clans(id) on delete set null,
  crystals integer not null default 10 check (crystals > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, claim_date)
);
create index if not exists nanime_game_clan_created_idx on public.nanime_game_clans(created_at desc);
create index if not exists nanime_crystal_ledger_user_created_idx on public.nanime_crystal_ledger(user_id, created_at desc);

alter table public.nanime_game_wallets enable row level security;
alter table public.nanime_game_clans enable row level security;
alter table public.nanime_game_clan_members enable row level security;
alter table public.nanime_game_clan_join_requests enable row level security;
alter table public.nanime_crystal_ledger enable row level security;
alter table public.nanime_clan_daily_claims enable row level security;
revoke all on public.nanime_game_wallets, public.nanime_game_clans, public.nanime_game_clan_members, public.nanime_game_clan_join_requests, public.nanime_crystal_ledger, public.nanime_clan_daily_claims from anon, authenticated;
grant select on public.nanime_game_wallets, public.nanime_game_clans, public.nanime_game_clan_members, public.nanime_game_clan_join_requests, public.nanime_crystal_ledger, public.nanime_clan_daily_claims to authenticated;

drop policy if exists nanime_game_wallet_owner_read on public.nanime_game_wallets;
create policy nanime_game_wallet_owner_read on public.nanime_game_wallets for select to authenticated using (user_id = auth.uid());
drop policy if exists nanime_game_clan_read on public.nanime_game_clans;
create policy nanime_game_clan_read on public.nanime_game_clans for select to authenticated using (true);
drop policy if exists nanime_game_clan_member_read on public.nanime_game_clan_members;
create policy nanime_game_clan_member_read on public.nanime_game_clan_members for select to authenticated using (user_id = auth.uid());
drop policy if exists nanime_game_clan_join_request_read on public.nanime_game_clan_join_requests;
create policy nanime_game_clan_join_request_read on public.nanime_game_clan_join_requests for select to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.nanime_game_clan_members m where m.clan_id = nanime_game_clan_join_requests.clan_id and m.user_id = auth.uid() and m.role = 'leader')
);
drop policy if exists nanime_crystal_ledger_owner_read on public.nanime_crystal_ledger;
create policy nanime_crystal_ledger_owner_read on public.nanime_crystal_ledger for select to authenticated using (user_id = auth.uid());
drop policy if exists nanime_daily_claim_owner_read on public.nanime_clan_daily_claims;
create policy nanime_daily_claim_owner_read on public.nanime_clan_daily_claims for select to authenticated using (user_id = auth.uid());

create or replace function public.nanime_create_clan(p_name text, p_tag text, p_description text default '')
returns public.nanime_game_clans language plpgsql security definer set search_path = public, pg_temp as $$
declare result public.nanime_game_clans; begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if exists (select 1 from public.nanime_game_clan_members where user_id = auth.uid()) then raise exception 'already_in_clan'; end if;
  if exists (select 1 from public.nanime_game_clan_join_requests where user_id = auth.uid() and status = 'pending') then raise exception 'request_pending'; end if;
  insert into public.nanime_game_clans(name, tag, description, owner_id)
    values (trim(p_name), upper(trim(p_tag)), trim(coalesce(p_description, '')), auth.uid()) returning * into result;
  insert into public.nanime_game_clan_members(clan_id, user_id, role) values (result.id, auth.uid(), 'leader');
  insert into public.nanime_game_wallets(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  return result;
end $$;

create or replace function public.nanime_request_clan_join(p_clan_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare request_id uuid; begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if exists (select 1 from public.nanime_game_clan_members where user_id = auth.uid()) then raise exception 'already_in_clan'; end if;
  perform 1 from public.nanime_game_clans where id = p_clan_id for update;
  if not found then raise exception 'clan_not_found'; end if;
  if (select count(*) from public.nanime_game_clan_members where clan_id = p_clan_id) >= 50 then raise exception 'clan_full'; end if;
  if exists (select 1 from public.nanime_game_clan_join_requests where user_id = auth.uid() and status = 'pending') then raise exception 'request_pending'; end if;
  begin
    insert into public.nanime_game_clan_join_requests(clan_id, user_id) values (p_clan_id, auth.uid()) returning id into request_id;
  exception when unique_violation then raise exception 'request_pending';
  end;
  return request_id;
end $$;

create or replace function public.nanime_review_clan_join(p_request_id uuid, p_approve boolean)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare request_row public.nanime_game_clan_join_requests; begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into request_row from public.nanime_game_clan_join_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if not exists (select 1 from public.nanime_game_clan_members m where m.clan_id = request_row.clan_id and m.user_id = auth.uid() and m.role = 'leader') then raise exception 'leader_required'; end if;
  if request_row.status <> 'pending' then raise exception 'request_already_reviewed'; end if;
  if p_approve then
    perform pg_advisory_xact_lock(hashtextextended(request_row.user_id::text, 0));
    perform 1 from public.nanime_game_clans where id = request_row.clan_id for update;
    if exists (select 1 from public.nanime_game_clan_members where user_id = request_row.user_id) then raise exception 'already_in_clan'; end if;
    if (select count(*) from public.nanime_game_clan_members where clan_id = request_row.clan_id) >= 50 then raise exception 'clan_full'; end if;
    insert into public.nanime_game_clan_members(clan_id, user_id) values (request_row.clan_id, request_row.user_id);
    insert into public.nanime_game_wallets(user_id) values (request_row.user_id) on conflict (user_id) do nothing;
    update public.nanime_game_clan_join_requests set status = 'accepted', updated_at = now() where id = p_request_id;
    return 'accepted';
  end if;
  update public.nanime_game_clan_join_requests set status = 'declined', updated_at = now() where id = p_request_id;
  return 'declined';
end $$;

create or replace function public.nanime_cancel_clan_join(p_request_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.nanime_game_clan_join_requests where id = p_request_id and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'request_not_found'; end if;
end $$;

create or replace function public.nanime_leave_clan()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare current_role text; begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select role into current_role from public.nanime_game_clan_members where user_id = auth.uid() for update;
  if not found then return; end if;
  if current_role = 'leader' then raise exception 'leader_must_transfer_or_close'; end if;
  delete from public.nanime_game_clan_members where user_id = auth.uid();
end $$;

create or replace function public.nanime_close_clan()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare current_clan uuid; current_role text; begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select clan_id, role into current_clan, current_role from public.nanime_game_clan_members where user_id = auth.uid() for update;
  if not found or current_role <> 'leader' then raise exception 'leader_required'; end if;
  delete from public.nanime_game_clans where id = current_clan and owner_id = auth.uid();
end $$;

create or replace function public.nanime_claim_clan_daily()
returns table(crystals bigint, claimed_amount integer, can_claim boolean, next_claim_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare membership public.nanime_game_clan_members; current_balance bigint; last_claim timestamptz; reward integer := 10;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into membership from public.nanime_game_clan_members where user_id = auth.uid() for update;
  if not found then raise exception 'clan_required'; end if;
  if membership.joined_at > now() - interval '24 hours' then raise exception 'membership_too_new'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select max(created_at) into last_claim from public.nanime_clan_daily_claims where user_id = auth.uid();
  if last_claim is not null and last_claim > now() - interval '24 hours' then raise exception 'already_claimed'; end if;
  insert into public.nanime_clan_daily_claims(user_id, claim_date, clan_id, crystals)
    values (auth.uid(), timezone('utc', now())::date, membership.clan_id, reward);
  insert into public.nanime_game_wallets(user_id, crystals) values (auth.uid(), reward)
    on conflict (user_id) do update set crystals = nanime_game_wallets.crystals + excluded.crystals, updated_at = now();
  insert into public.nanime_crystal_ledger(user_id, amount, reason, clan_id) values (auth.uid(), reward, 'daily_clan_claim', membership.clan_id);
  select w.crystals into current_balance from public.nanime_game_wallets w where w.user_id = auth.uid();
  crystals := current_balance; claimed_amount := reward; can_claim := false; next_claim_at := now() + interval '24 hours'; return next;
end $$;

revoke all on function public.nanime_create_clan(text, text, text), public.nanime_request_clan_join(uuid), public.nanime_review_clan_join(uuid, boolean), public.nanime_cancel_clan_join(uuid), public.nanime_leave_clan(), public.nanime_close_clan(), public.nanime_claim_clan_daily() from public, anon;
grant execute on function public.nanime_create_clan(text, text, text), public.nanime_request_clan_join(uuid), public.nanime_review_clan_join(uuid, boolean), public.nanime_cancel_clan_join(uuid), public.nanime_leave_clan(), public.nanime_close_clan(), public.nanime_claim_clan_daily() to authenticated;
