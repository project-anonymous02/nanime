-- Clan color gacha: server-owned catalog, treasury spending, duplicate essence,
-- inventory and pity counters. All account/clan mutations are RPC-only.
create table if not exists public.nanime_game_color_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  rarity text not null check (rarity in ('common','rare','epic','legendary','mythic')),
  primary_color text not null check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  roll_weight integer not null check (roll_weight > 0),
  duplicate_essence integer not null check (duplicate_essence >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.nanime_game_color_catalog(slug,name,rarity,primary_color,secondary_color,accent_color,roll_weight,duplicate_essence) values
 ('moonlit-blue','Moonlit Blue','common','#142B50','#3176C9','#8FC5FF',45,2),
 ('sakura-dawn','Sakura Dawn','common','#512843','#C65F91','#FFC4DE',45,2),
 ('forest-spirit','Forest Spirit','common','#123D35','#2D9B76','#9CE8B7',45,2),
 ('violet-comet','Violet Comet','rare','#30215C','#8459D8','#D6B7FF',24,5),
 ('sunset-flare','Sunset Flare','rare','#642B26','#DA6745','#FFD07A',24,5),
 ('frost-dragon','Frost Dragon','epic','#163D50','#2EAEC0','#B4F5FF',12,10),
 ('amethyst-star','Amethyst Star','epic','#422050','#A546C9','#F2B4FF',12,10),
 ('celestial-gold','Celestial Gold','legendary','#4B3514','#C68B25','#FFF0A6',5,20),
 ('abyssal-prism','Abyssal Prism','legendary','#172749','#5668E8','#B7BFFF',5,20),
 ('nanime-eclipse','Nanime Eclipse','mythic','#171722','#743DF2','#83F0FF',1,40)
on conflict (slug) do update set name=excluded.name, rarity=excluded.rarity,
  primary_color=excluded.primary_color, secondary_color=excluded.secondary_color,
  accent_color=excluded.accent_color, roll_weight=excluded.roll_weight,
  duplicate_essence=excluded.duplicate_essence;

create table if not exists public.nanime_game_color_gacha_config (
  singleton boolean primary key default true check (singleton),
  single_cost integer not null check (single_cost > 0),
  ten_cost integer not null check (ten_cost > 0),
  mythic_weight integer not null check (mythic_weight >= 0),
  legendary_weight integer not null check (legendary_weight >= 0),
  epic_weight integer not null check (epic_weight >= 0),
  rare_weight integer not null check (rare_weight >= 0),
  common_weight integer not null check (common_weight >= 0),
  rare_pity integer not null check (rare_pity > 0),
  epic_pity integer not null check (epic_pity > 0),
  legendary_pity integer not null check (legendary_pity > 0),
  mythic_pity integer not null check (mythic_pity > 0),
  check (mythic_weight+legendary_weight+epic_weight+rare_weight+common_weight=10000)
);
insert into public.nanime_game_color_gacha_config(singleton,single_cost,ten_cost,mythic_weight,legendary_weight,epic_weight,rare_weight,common_weight,rare_pity,epic_pity,legendary_pity,mythic_pity)
values(true,25,220,50,300,1200,2400,6050,10,30,60,90) on conflict(singleton) do nothing;

alter table public.nanime_game_clans
  add column if not exists treasury_balance bigint not null default 0 check (treasury_balance >= 0),
  add column if not exists color_essence bigint not null default 0 check (color_essence >= 0),
  add column if not exists active_color_id uuid references public.nanime_game_color_catalog(id) on delete set null;

alter table public.nanime_crystal_ledger
  drop constraint if exists nanime_crystal_ledger_reason_check;
alter table public.nanime_crystal_ledger
  add constraint nanime_crystal_ledger_reason_check
  check (reason in ('daily_clan_claim','clan_treasury_donation','clan_color_gacha'));

create table if not exists public.nanime_game_clan_colors (
  clan_id uuid not null references public.nanime_game_clans(id) on delete cascade,
  color_id uuid not null references public.nanime_game_color_catalog(id) on delete restrict,
  acquired_at timestamptz not null default now(),
  primary key (clan_id,color_id)
);
create table if not exists public.nanime_game_clan_color_pity (
  clan_id uuid primary key references public.nanime_game_clans(id) on delete cascade,
  rare_count integer not null default 0 check (rare_count >= 0),
  epic_count integer not null default 0 check (epic_count >= 0),
  legendary_count integer not null default 0 check (legendary_count >= 0),
  mythic_count integer not null default 0 check (mythic_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.nanime_game_color_catalog enable row level security;
alter table public.nanime_game_color_gacha_config enable row level security;
alter table public.nanime_game_clan_colors enable row level security;
alter table public.nanime_game_clan_color_pity enable row level security;
revoke all on public.nanime_game_color_catalog,public.nanime_game_color_gacha_config,public.nanime_game_clan_colors,public.nanime_game_clan_color_pity from anon,authenticated;
grant select on public.nanime_game_color_catalog to authenticated;
grant select on public.nanime_game_color_gacha_config to authenticated;
grant select on public.nanime_game_clan_colors,public.nanime_game_clan_color_pity to authenticated;
drop policy if exists nanime_game_color_catalog_read on public.nanime_game_color_catalog;
create policy nanime_game_color_catalog_read on public.nanime_game_color_catalog
  for select to authenticated using (active);
drop policy if exists nanime_game_color_gacha_config_read on public.nanime_game_color_gacha_config;
create policy nanime_game_color_gacha_config_read on public.nanime_game_color_gacha_config
  for select to authenticated using (true);
drop policy if exists nanime_game_clan_colors_member_read on public.nanime_game_clan_colors;
create policy nanime_game_clan_colors_member_read on public.nanime_game_clan_colors
  for select to authenticated using (exists(select 1 from public.nanime_game_clan_members m where m.clan_id=nanime_game_clan_colors.clan_id and m.user_id=auth.uid()));
drop policy if exists nanime_game_clan_color_pity_member_read on public.nanime_game_clan_color_pity;
create policy nanime_game_clan_color_pity_member_read on public.nanime_game_clan_color_pity
  for select to authenticated using (exists(select 1 from public.nanime_game_clan_members m where m.clan_id=nanime_game_clan_color_pity.clan_id and m.user_id=auth.uid()));

create or replace function public.nanime_donate_clan_treasury(p_clan_id uuid,p_amount integer)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare balance bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000 then raise exception 'invalid_donation'; end if;
  perform 1 from public.nanime_game_clan_members where clan_id=p_clan_id and user_id=auth.uid() for update;
  if not found then raise exception 'clan_membership_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wallet:'||auth.uid()::text,0));
  update public.nanime_game_wallets set crystals=crystals-p_amount,updated_at=now()
    where user_id=auth.uid() and crystals>=p_amount returning crystals into balance;
  if not found then raise exception 'insufficient_crystals'; end if;
  update public.nanime_game_clans set treasury_balance=treasury_balance+p_amount where id=p_clan_id;
  if not found then raise exception 'clan_not_found'; end if;
  insert into public.nanime_crystal_ledger(user_id,amount,reason,clan_id) values(auth.uid(),p_amount,'clan_treasury_donation',p_clan_id);
  return balance;
end $$;
revoke all on function public.nanime_donate_clan_treasury(uuid,integer) from public,anon;
grant execute on function public.nanime_donate_clan_treasury(uuid,integer) to authenticated;

create or replace function public.nanime_spin_clan_color(p_clan_id uuid,p_count integer default 1)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.nanime_game_clans; p public.nanime_game_clan_color_pity; cfg public.nanime_game_color_gacha_config;
  total_cost integer; i integer;
  target_rarity text; picked public.nanime_game_color_catalog; total_weight integer;
  roll integer; is_duplicate boolean; gained integer:=0; item_json jsonb; items jsonb:='[]'::jsonb;
  rare_n integer; epic_n integer; legendary_n integer; mythic_n integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_count is null or p_count not in (1,10) then raise exception 'invalid_pull_count'; end if;
  perform 1 from public.nanime_game_clan_members where clan_id=p_clan_id and user_id=auth.uid() for update;
  if not found then raise exception 'clan_membership_required'; end if;
  select * into strict cfg from public.nanime_game_color_gacha_config where singleton=true;
  select * into c from public.nanime_game_clans where id=p_clan_id for update;
  if not found then raise exception 'clan_not_found'; end if;
  total_cost:=case when p_count=1 then cfg.single_cost else cfg.ten_cost end;
  if c.treasury_balance<total_cost then raise exception 'insufficient_clan_treasury'; end if;
  update public.nanime_game_clans set treasury_balance=treasury_balance-total_cost where id=p_clan_id returning * into c;
  insert into public.nanime_game_clan_color_pity(clan_id) values(p_clan_id) on conflict do nothing;
  select * into p from public.nanime_game_clan_color_pity where clan_id=p_clan_id for update;
  rare_n:=p.rare_count; epic_n:=p.epic_count; legendary_n:=p.legendary_count; mythic_n:=p.mythic_count;
  for i in 1..p_count loop
    target_rarity:=case
      when mythic_n>=cfg.mythic_pity-1 then 'mythic'
      when legendary_n>=cfg.legendary_pity-1 then 'legendary'
      when epic_n>=cfg.epic_pity-1 then 'epic'
      when rare_n>=cfg.rare_pity-1 then 'rare'
      else null end;
    if target_rarity is null then
      roll:=floor(random()*10000)::integer;
      target_rarity:=case when roll<cfg.mythic_weight then 'mythic' when roll<cfg.mythic_weight+cfg.legendary_weight then 'legendary' when roll<cfg.mythic_weight+cfg.legendary_weight+cfg.epic_weight then 'epic' when roll<cfg.mythic_weight+cfg.legendary_weight+cfg.epic_weight+cfg.rare_weight then 'rare' else 'common' end;
    end if;
    select coalesce(sum(roll_weight),0) into total_weight from public.nanime_game_color_catalog where active and rarity=target_rarity;
    if total_weight=0 then raise exception 'gacha_catalog_missing_rarity'; end if;
    roll:=floor(random()*total_weight)::integer;
    select * into picked from (
      select color_row.*,sum(roll_weight) over(order by slug) as cumulative
      from public.nanime_game_color_catalog color_row where active and rarity=target_rarity
    ) weighted where cumulative>roll order by cumulative limit 1;
    is_duplicate:=exists(select 1 from public.nanime_game_clan_colors where clan_id=p_clan_id and color_id=picked.id);
    if is_duplicate then gained:=gained+picked.duplicate_essence;
    else insert into public.nanime_game_clan_colors(clan_id,color_id) values(p_clan_id,picked.id); end if;
    item_json:=jsonb_build_object('id',picked.id,'paletteId',picked.id,'name',picked.name,'rarity',picked.rarity,'primaryColor',picked.primary_color,'secondaryColor',picked.secondary_color,'accentColor',picked.accent_color,'duplicate',is_duplicate,'essence',case when is_duplicate then picked.duplicate_essence else 0 end);
    items:=items||jsonb_build_array(item_json);
    if picked.rarity in ('rare','epic','legendary','mythic') then rare_n:=0; else rare_n:=rare_n+1; end if;
    if picked.rarity in ('epic','legendary','mythic') then epic_n:=0; else epic_n:=epic_n+1; end if;
    if picked.rarity in ('legendary','mythic') then legendary_n:=0; else legendary_n:=legendary_n+1; end if;
    if picked.rarity='mythic' then mythic_n:=0; else mythic_n:=mythic_n+1; end if;
  end loop;
  update public.nanime_game_clans set color_essence=color_essence+gained where id=p_clan_id returning * into c;
  update public.nanime_game_clan_color_pity set rare_count=rare_n,epic_count=epic_n,legendary_count=legendary_n,mythic_count=mythic_n,updated_at=now() where clan_id=p_clan_id;
  insert into public.nanime_crystal_ledger(user_id,amount,reason,clan_id) values(auth.uid(),total_cost,'clan_color_gacha',p_clan_id);
  return jsonb_build_object('pullType',case when p_count=1 then 'single' else 'ten' end,'cost',total_cost,'treasuryBalanceAfter',c.treasury_balance,'essenceGained',gained,'essenceBalanceAfter',c.color_essence,'pity',jsonb_build_object('rare',rare_n,'epic',epic_n,'legendary',legendary_n,'mythic',mythic_n),'items',items);
end $$;
revoke all on function public.nanime_spin_clan_color(uuid,integer) from public,anon;
grant execute on function public.nanime_spin_clan_color(uuid,integer) to authenticated;

create or replace function public.nanime_set_clan_color(p_clan_id uuid,p_color_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform 1 from public.nanime_game_clan_members where clan_id=p_clan_id and user_id=auth.uid() and role='leader' for update;
  if not found then raise exception 'clan_leader_required'; end if;
  if p_color_id is not null and not exists(select 1 from public.nanime_game_clan_colors where clan_id=p_clan_id and color_id=p_color_id) then raise exception 'color_not_owned'; end if;
  update public.nanime_game_clans set active_color_id=p_color_id where id=p_clan_id;
  if not found then raise exception 'clan_not_found'; end if;
end $$;
revoke all on function public.nanime_set_clan_color(uuid,uuid) from public,anon;
grant execute on function public.nanime_set_clan_color(uuid,uuid) to authenticated;
