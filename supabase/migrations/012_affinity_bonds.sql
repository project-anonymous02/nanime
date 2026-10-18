-- Nanime Affinity: friend-only bonds, proposals, progression and missions.
-- Additive migration; no existing rows or tables are removed.
create table if not exists public.nanime_affinity_tier_config (
  tier text primary key check (tier in ('partner','bros','besties','confidants')),
  label text not null,
  max_slots integer not null check (max_slots > 0),
  active boolean not null default true
);
insert into public.nanime_affinity_tier_config(tier,label,max_slots) values
  ('partner','Pasangan',1),('bros','Saudara',4),('besties','Sahabat',4),('confidants','Confidant',5)
on conflict (tier) do nothing;

create table if not exists public.nanime_affinity_bonds (
  id uuid primary key default gen_random_uuid(),
  tier text not null references public.nanime_affinity_tier_config(tier),
  status text not null default 'pending' check (status in ('pending','active','rejected','cancelled','broken')),
  proposer_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references auth.users(id) on delete cascade,
  message text not null default '' check (char_length(message) <= 240),
  xp integer not null default 0 check (xp >= 0),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  closed_at timestamptz,
  check (proposer_id <> partner_id)
);
create index if not exists nanime_affinity_proposer_idx on public.nanime_affinity_bonds(proposer_id,status,created_at desc);
create index if not exists nanime_affinity_partner_idx on public.nanime_affinity_bonds(partner_id,status,created_at desc);
create unique index if not exists nanime_affinity_pending_pair_uq
  on public.nanime_affinity_bonds(tier,least(proposer_id,partner_id),greatest(proposer_id,partner_id)) where status='pending';

create table if not exists public.nanime_affinity_privacy (
  user_id uuid primary key references auth.users(id) on delete cascade,
  visibility text not null default 'friends' check (visibility in ('private','friends','public')),
  updated_at timestamptz not null default now()
);
create table if not exists public.nanime_affinity_cooldowns (
  user_id uuid not null references auth.users(id) on delete cascade,
  tier text not null references public.nanime_affinity_tier_config(tier),
  until_at timestamptz not null,
  primary key(user_id,tier)
);
create table if not exists public.nanime_affinity_missions (
  mission_id text primary key check (mission_id in ('watch_episode','send_message','open_app')),
  label text not null,
  xp_reward integer not null check (xp_reward > 0),
  active boolean not null default true
);
insert into public.nanime_affinity_missions(mission_id,label,xp_reward) values
  ('watch_episode','Tonton satu episode hari ini',12),
  ('send_message','Kirim pesan ke pasangan afinitas',8),
  ('open_app','Buka Nanime hari ini',4)
on conflict (mission_id) do nothing;
create table if not exists public.nanime_affinity_levels (
  level integer primary key check(level between 1 and 50),
  xp_required integer not null unique check(xp_required>=0),
  unlock_title text not null
);
insert into public.nanime_affinity_levels(level,xp_required,unlock_title) values
  (1,0,'Awal Kedekatan'),(2,100,'Teman Dekat'),(3,250,'Partner Serasi'),
  (4,450,'Ikatan Kuat'),(5,700,'Sahabat Sejati'),(6,1000,'Duo Legendaris'),
  (7,1350,'Ikatan Abadi'),(8,1750,'Bintang Berdua'),(9,2200,'Tak Terpisahkan'),(10,2700,'Ikatan Kosmik')
on conflict (level) do nothing;
create table if not exists public.nanime_affinity_mission_claims (
  bond_id uuid not null references public.nanime_affinity_bonds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id text not null references public.nanime_affinity_missions(mission_id),
  claim_day date not null default (now() at time zone 'utc')::date,
  claimed_at timestamptz not null default now(),
  primary key(bond_id,user_id,mission_id,claim_day)
);
create index if not exists nanime_affinity_claims_user_day_idx on public.nanime_affinity_mission_claims(user_id,claim_day desc);

alter table public.nanime_affinity_tier_config enable row level security;
alter table public.nanime_affinity_bonds enable row level security;
alter table public.nanime_affinity_privacy enable row level security;
alter table public.nanime_affinity_cooldowns enable row level security;
alter table public.nanime_affinity_missions enable row level security;
alter table public.nanime_affinity_levels enable row level security;
alter table public.nanime_affinity_mission_claims enable row level security;
revoke all on public.nanime_affinity_tier_config,public.nanime_affinity_bonds,public.nanime_affinity_privacy,public.nanime_affinity_cooldowns,public.nanime_affinity_missions,public.nanime_affinity_levels,public.nanime_affinity_mission_claims from anon,authenticated;
grant select on public.nanime_affinity_tier_config,public.nanime_affinity_bonds,public.nanime_affinity_privacy,public.nanime_affinity_missions,public.nanime_affinity_levels,public.nanime_affinity_mission_claims to authenticated;
drop policy if exists nanime_affinity_config_read on public.nanime_affinity_tier_config;
create policy nanime_affinity_config_read on public.nanime_affinity_tier_config for select to authenticated using(active);
drop policy if exists nanime_affinity_mission_read on public.nanime_affinity_missions;
create policy nanime_affinity_mission_read on public.nanime_affinity_missions for select to authenticated using(active);
drop policy if exists nanime_affinity_level_read on public.nanime_affinity_levels;
create policy nanime_affinity_level_read on public.nanime_affinity_levels for select to authenticated using(true);
drop policy if exists nanime_affinity_bond_participant_read on public.nanime_affinity_bonds;
create policy nanime_affinity_bond_participant_read on public.nanime_affinity_bonds for select to authenticated using(auth.uid() in (proposer_id,partner_id));
drop policy if exists nanime_affinity_privacy_owner_read on public.nanime_affinity_privacy;
create policy nanime_affinity_privacy_owner_read on public.nanime_affinity_privacy for select to authenticated using(auth.uid()=user_id);
drop policy if exists nanime_affinity_cooldown_owner_read on public.nanime_affinity_cooldowns;
create policy nanime_affinity_cooldown_owner_read on public.nanime_affinity_cooldowns for select to authenticated using(auth.uid()=user_id);
drop policy if exists nanime_affinity_claim_participant_read on public.nanime_affinity_mission_claims;
create policy nanime_affinity_claim_participant_read on public.nanime_affinity_mission_claims for select to authenticated using(
  auth.uid()=user_id and exists(select 1 from public.nanime_affinity_bonds b where b.id=bond_id and auth.uid() in(b.proposer_id,b.partner_id))
);

create or replace function public.nanime_affinity_propose(p_partner_id uuid,p_tier text,p_message text default '')
returns public.nanime_affinity_bonds language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.nanime_affinity_bonds; limit_slots integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_partner_id is null or p_partner_id=auth.uid() then raise exception 'invalid_partner'; end if;
  perform pg_advisory_xact_lock(hashtextextended('affinity-user:'||least(auth.uid()::text,p_partner_id::text),0));
  perform pg_advisory_xact_lock(hashtextextended('affinity-user:'||greatest(auth.uid()::text,p_partner_id::text),0));
  select max_slots into limit_slots from public.nanime_affinity_tier_config where tier=p_tier and active;
  if not found then raise exception 'invalid_affinity_tier'; end if;
  if not exists(select 1 from public.nanime_friend_requests f where f.status='accepted' and ((f.requester_id=auth.uid() and f.recipient_id=p_partner_id) or (f.requester_id=p_partner_id and f.recipient_id=auth.uid()))) then raise exception 'friendship_required'; end if;
  if exists(select 1 from public.nanime_affinity_cooldowns where user_id in(auth.uid(),p_partner_id) and tier=p_tier and until_at>now()) then raise exception 'affinity_cooldown'; end if;
  if (select count(*) from public.nanime_affinity_bonds where tier=p_tier and status='active' and auth.uid() in(proposer_id,partner_id)) >= limit_slots
    or (select count(*) from public.nanime_affinity_bonds where tier=p_tier and status='active' and p_partner_id in(proposer_id,partner_id)) >= limit_slots then raise exception 'affinity_slots_full'; end if;
  if exists(select 1 from public.nanime_affinity_bonds where tier=p_tier and status in('pending','active') and ((proposer_id=auth.uid() and partner_id=p_partner_id) or (proposer_id=p_partner_id and partner_id=auth.uid()))) then raise exception 'affinity_already_exists'; end if;
  insert into public.nanime_affinity_bonds(tier,proposer_id,partner_id,message) values(p_tier,auth.uid(),p_partner_id,left(trim(coalesce(p_message,'')),240)) returning * into result;
  return result;
end $$;
revoke all on function public.nanime_affinity_propose(uuid,text,text) from public,anon;
grant execute on function public.nanime_affinity_propose(uuid,text,text) to authenticated;

create or replace function public.nanime_affinity_respond(p_bond_id uuid,p_action text)
returns public.nanime_affinity_bonds language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.nanime_affinity_bonds; limit_slots integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into b from public.nanime_affinity_bonds where id=p_bond_id for update;
  if not found or b.partner_id<>auth.uid() or b.status<>'pending' then raise exception 'invalid_affinity_request'; end if;
  if p_action='accept' then
    if not exists(select 1 from public.nanime_friend_requests f where f.status='accepted' and ((f.requester_id=b.proposer_id and f.recipient_id=b.partner_id) or (f.requester_id=b.partner_id and f.recipient_id=b.proposer_id))) then raise exception 'friendship_required'; end if;
    perform pg_advisory_xact_lock(hashtextextended('affinity-user:'||least(b.proposer_id::text,b.partner_id::text),0));
    perform pg_advisory_xact_lock(hashtextextended('affinity-user:'||greatest(b.proposer_id::text,b.partner_id::text),0));
    select max_slots into limit_slots from public.nanime_affinity_tier_config where tier=b.tier and active;
    if (select count(*) from public.nanime_affinity_bonds where tier=b.tier and status='active' and auth.uid() in(proposer_id,partner_id)) >= limit_slots
      or (select count(*) from public.nanime_affinity_bonds where tier=b.tier and status='active' and b.proposer_id in(proposer_id,partner_id)) >= limit_slots then raise exception 'affinity_slots_full'; end if;
    update public.nanime_affinity_bonds set status='active',accepted_at=now() where id=p_bond_id returning * into b;
  elsif p_action='reject' then
    update public.nanime_affinity_bonds set status='rejected',closed_at=now() where id=p_bond_id returning * into b;
  else raise exception 'invalid_affinity_action'; end if;
  return b;
end $$;
revoke all on function public.nanime_affinity_respond(uuid,text) from public,anon;
grant execute on function public.nanime_affinity_respond(uuid,text) to authenticated;

create or replace function public.nanime_affinity_close(p_bond_id uuid,p_action text)
returns public.nanime_affinity_bonds language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.nanime_affinity_bonds;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into b from public.nanime_affinity_bonds where id=p_bond_id for update;
  if not found or auth.uid() not in(b.proposer_id,b.partner_id) then raise exception 'affinity_not_found'; end if;
  if p_action='cancel' and b.status='pending' and b.proposer_id=auth.uid() then
    update public.nanime_affinity_bonds set status='cancelled',closed_at=now() where id=p_bond_id returning * into b;
  elsif p_action='break' and b.status='active' then
    update public.nanime_affinity_bonds set status='broken',closed_at=now() where id=p_bond_id returning * into b;
    insert into public.nanime_affinity_cooldowns(user_id,tier,until_at) values(b.proposer_id,b.tier,now()+interval '48 hours'),(b.partner_id,b.tier,now()+interval '48 hours')
    on conflict(user_id,tier) do update set until_at=greatest(public.nanime_affinity_cooldowns.until_at,excluded.until_at);
  else raise exception 'invalid_affinity_action'; end if;
  return b;
end $$;
revoke all on function public.nanime_affinity_close(uuid,text) from public,anon;
grant execute on function public.nanime_affinity_close(uuid,text) to authenticated;

create or replace function public.nanime_affinity_set_privacy(p_visibility text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_visibility is null or p_visibility not in('private','friends','public') then raise exception 'invalid_privacy'; end if;
  insert into public.nanime_affinity_privacy(user_id,visibility,updated_at) values(auth.uid(),p_visibility,now())
  on conflict(user_id) do update set visibility=excluded.visibility,updated_at=now();
  return p_visibility;
end $$;
revoke all on function public.nanime_affinity_set_privacy(text) from public,anon;
grant execute on function public.nanime_affinity_set_privacy(text) to authenticated;

create or replace function public.nanime_affinity_claim_mission(p_bond_id uuid,p_mission_id text)
returns public.nanime_affinity_bonds language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.nanime_affinity_bonds; reward integer; day_start timestamptz:=date_trunc('day',now() at time zone 'utc') at time zone 'utc';
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into b from public.nanime_affinity_bonds where id=p_bond_id and status='active' and auth.uid() in(proposer_id,partner_id) for update;
  if not found then raise exception 'active_affinity_required'; end if;
  select xp_reward into reward from public.nanime_affinity_missions where mission_id=p_mission_id and active;
  if not found then raise exception 'unknown_affinity_mission'; end if;
  if p_mission_id='watch_episode' and not exists(select 1 from public.history h where h.user_id=auth.uid() and h.watched_at >= extract(epoch from day_start)*1000) then raise exception 'mission_condition_not_met'; end if;
  if p_mission_id='send_message' and not exists(select 1 from public.nanime_direct_messages m where m.sender_id=auth.uid() and m.recipient_id in(b.proposer_id,b.partner_id) and m.recipient_id<>auth.uid() and m.created_at>=day_start) then raise exception 'mission_condition_not_met'; end if;
  if p_mission_id='open_app' and not exists(select 1 from public.app_usage_sessions s where s.user_id=auth.uid() and s.started_at>=day_start) then raise exception 'mission_condition_not_met'; end if;
  insert into public.nanime_affinity_mission_claims(bond_id,user_id,mission_id) values(b.id,auth.uid(),p_mission_id) on conflict do nothing;
  if not found then raise exception 'mission_already_claimed'; end if;
  update public.nanime_affinity_bonds set xp=xp+reward where id=b.id returning * into b;
  return b;
end $$;
revoke all on function public.nanime_affinity_claim_mission(uuid,text) from public,anon;
grant execute on function public.nanime_affinity_claim_mission(uuid,text) to authenticated;

create or replace function public.get_nanime_public_affinities(p_user_id uuid)
returns table(id uuid,tier text,status text,proposer_id uuid,partner_id uuid,message text,xp integer,level integer,accepted_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare visibility text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select coalesce((select p.visibility from public.nanime_affinity_privacy p where p.user_id=p_user_id),'friends') into visibility;
  if auth.uid()<>p_user_id and visibility='private' then return; end if;
  if auth.uid()<>p_user_id and visibility='friends' and not exists(select 1 from public.nanime_friend_requests f where f.status='accepted' and ((f.requester_id=auth.uid() and f.recipient_id=p_user_id) or (f.requester_id=p_user_id and f.recipient_id=auth.uid()))) then return; end if;
  return query select b.id,b.tier,b.status,b.proposer_id,b.partner_id,b.message,b.xp,coalesce((select max(l.level) from public.nanime_affinity_levels l where l.xp_required<=b.xp),1),b.accepted_at from public.nanime_affinity_bonds b
    where b.status='active' and (b.proposer_id=p_user_id or b.partner_id=p_user_id) order by b.created_at desc;
end $$;
revoke all on function public.get_nanime_public_affinities(uuid) from public,anon;
grant execute on function public.get_nanime_public_affinities(uuid) to authenticated;

create or replace function public.get_nanime_affinity_leaderboard(p_limit integer default 20)
returns table(bond_id uuid,tier text,xp integer,user_a uuid,user_b uuid)
language sql security definer set search_path=public,pg_temp as $$
  select b.id,b.tier,b.xp,b.proposer_id,b.partner_id from public.nanime_affinity_bonds b
  where b.status='active' and (auth.uid() in(b.proposer_id,b.partner_id) or (
    coalesce((select p.visibility from public.nanime_affinity_privacy p where p.user_id=b.proposer_id),'friends')='public'
    and coalesce((select p.visibility from public.nanime_affinity_privacy p where p.user_id=b.partner_id),'friends')='public'
  )) order by b.xp desc,b.accepted_at asc limit greatest(1,least(coalesce(p_limit,20),50));
$$;
revoke all on function public.get_nanime_affinity_leaderboard(integer) from public,anon;
grant execute on function public.get_nanime_affinity_leaderboard(integer) to authenticated;
