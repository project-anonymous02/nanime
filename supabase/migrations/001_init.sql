-- ============================================================================
-- Nanime — skema Supabase v2 (hanya 5 kebutuhan resmi)
-- ============================================================================
-- Jalankan di: Supabase Dashboard → SQL Editor → New query → Tempel → Run.
-- Aman dijalankan ulang (idempoten).
--
-- Kebutuhan yang diizinkan (dan HANYA ini):
--   (a) Autentikasi Google        → ditangani Supabase Auth (tanpa tabel)
--   (b) Data profil pengguna      → public.profiles
--   (c) Daftar favorit            → public.favorites
--   (d) Riwayat menonton + progress detik → public.history
--   (e) Pengaturan aplikasi       → public.settings
--
-- Aturan keamanan:
--   • RLS aktif pada SEMUA tabel; pengguna hanya bisa mengakses barisnya sendiri.
--   • Tidak ada tabel lain di luar 5 kebutuhan di atas.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Bersihkan skema lama yang tidak lagi dipakai (di luar 5 kebutuhan) ──────
drop table if exists public.lists cascade;
drop table if exists public.entries cascade;
drop table if exists public.progress cascade;

-- ── (b) Profil pengguna ──────────────────────────────────────────────────────
-- Nama & foto berasal dari akun Google (tidak bisa diubah manual di aplikasi).
create table if not exists public.profiles (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  email       text,
  display_name text,
  avatar_url  text,
  updated_at  bigint      not null default (extract(epoch from now()) * 1000)::bigint
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = user_id);

-- ── (c) Favorit / Subscribed Anime ───────────────────────────────────────────
create table if not exists public.favorites (
  user_id    uuid   not null references auth.users(id) on delete cascade,
  anime_id   text   not null,
  title      text   not null default '',
  poster     text   not null default '',
  score      text   not null default '',
  type       text   not null default '',
  status     text   not null default '',
  added_at   bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  primary key (user_id, anime_id)
);

create index if not exists favorites_user_idx on public.favorites (user_id, added_at desc);

alter table public.favorites enable row level security;

drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own" on public.favorites
  for select using (auth.uid() = user_id);

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own" on public.favorites
  for insert with check (auth.uid() = user_id);

drop policy if exists "favorites_update_own" on public.favorites;
create policy "favorites_update_own" on public.favorites
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own" on public.favorites
  for delete using (auth.uid() = user_id);

-- ── (d) Riwayat menonton + progress detik ────────────────────────────────────
-- Satu baris per anime + episode; position_sec diperbarui saat menonton.
create table if not exists public.history (
  user_id      uuid    not null references auth.users(id) on delete cascade,
  anime_id     text    not null,
  episode      text    not null,
  title        text    not null default '',
  poster       text    not null default '',
  position_sec integer not null default 0,
  duration_sec integer not null default 0,
  percent      numeric not null default 0 check (percent between 0 and 100),
  completed    boolean not null default false,
  watched_at   bigint  not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at   bigint  not null default (extract(epoch from now()) * 1000)::bigint,
  primary key (user_id, anime_id, episode)
);

create index if not exists history_user_idx on public.history (user_id, watched_at desc);

alter table public.history enable row level security;

drop policy if exists "history_select_own" on public.history;
create policy "history_select_own" on public.history
  for select using (auth.uid() = user_id);

drop policy if exists "history_insert_own" on public.history;
create policy "history_insert_own" on public.history
  for insert with check (auth.uid() = user_id);

drop policy if exists "history_update_own" on public.history;
create policy "history_update_own" on public.history
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "history_delete_own" on public.history;
create policy "history_delete_own" on public.history
  for delete using (auth.uid() = user_id);

-- ── (e) Pengaturan aplikasi ──────────────────────────────────────────────────
create table if not exists public.settings (
  user_id    uuid   not null references auth.users(id) on delete cascade,
  key        text   not null,
  value      jsonb  not null default '{}'::jsonb,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  primary key (user_id, key)
);

alter table public.settings enable row level security;

drop policy if exists "settings_select_own" on public.settings;
create policy "settings_select_own" on public.settings
  for select using (auth.uid() = user_id);

drop policy if exists "settings_insert_own" on public.settings;
create policy "settings_insert_own" on public.settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "settings_update_own" on public.settings;
create policy "settings_update_own" on public.settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "settings_delete_own" on public.settings;
create policy "settings_delete_own" on public.settings
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- Selesai. Empat tabel (profil, favorit, riwayat, pengaturan) + Supabase Auth
-- = lima kebutuhan resmi Nanime. Tidak ada tabel lain.
-- ============================================================================
