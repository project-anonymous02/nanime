-- ============================================================================
-- Nanime — skema Supabase (sinkronisasi lokal-prioritas)
-- ============================================================================
-- Jalankan di: Supabase Dashboard → SQL Editor → New query → Tempel → Run.
-- Aman dijalankan ulang (idempoten): semua objek memakai IF NOT EXISTS.
--
-- Catatan keamanan:
--   • RLS diaktifkan pada SEMUA tabel privat.
--   • Kebijakan least-privilege: pengguna HANYA dapat membaca/menulis baris
--     miliknya sendiri (auth.uid() = user_id).
--   • Tidak ada USING (true) / WITH CHECK (true) pada tabel privat.
--   • Timestamp memakai bigint milidetik (epoch) agar cocok dengan Date.now()
--     di aplikasi tanpa konversi zona waktu.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Tabel: entries (favorit + meta personal) ────────────────────────────────
create table if not exists public.entries (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  key         text        not null,              -- format: provider:id
  provider    text        not null default '',
  anime_id    text        not null,
  slug        text        not null default '',
  title       text        not null default '',
  poster      text        not null default '',
  status      text        check (status in ('ptw','watching','completed','dropped')),
  rating      int         check (rating between 0 and 5),
  favorite    boolean     not null default true,
  note        text,
  created_at  bigint      not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at  bigint      not null default (extract(epoch from now()) * 1000)::bigint,
  primary key (user_id, key)
);

create index if not exists entries_user_updated_idx
  on public.entries (user_id, updated_at);

-- ── Tabel: progress (lanjutkan menonton) ────────────────────────────────────
create table if not exists public.progress (
  user_id       uuid    not null references auth.users(id) on delete cascade,
  key           text    not null,
  provider      text    not null default '',
  anime_id      text    not null,
  slug          text    not null default '',
  title         text    not null default '',
  poster        text    not null default '',
  episode       text    not null default '1',
  episode_id    text    not null default '',
  episode_slug  text    not null default '',
  position_sec  int     not null default 0,
  duration_sec  int     not null default 0,
  percent       numeric not null default 0 check (percent between 0 and 100),
  completed     boolean not null default false,
  updated_at    bigint  not null default (extract(epoch from now()) * 1000)::bigint,
  primary key (user_id, key)
);

create index if not exists progress_user_updated_idx
  on public.progress (user_id, updated_at);

-- ── Tabel: history ──────────────────────────────────────────────────────────
create table if not exists public.history (
  user_id       uuid    not null references auth.users(id) on delete cascade,
  key           text    not null,
  provider      text    not null default '',
  anime_id      text    not null,
  slug          text    not null default '',
  title         text    not null default '',
  poster        text    not null default '',
  episode       text    not null default '1',
  episode_id    text    not null default '',
  episode_slug  text    not null default '',
  watched_at    bigint  not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at    bigint  not null default (extract(epoch from now()) * 1000)::bigint,
  primary key (user_id, key)
);

create index if not exists history_user_updated_idx
  on public.history (user_id, updated_at);

-- ── Tabel: lists (daftar khusus pengguna) ───────────────────────────────────
create table if not exists public.lists (
  user_id     uuid    not null references auth.users(id) on delete cascade,
  id          text    not null,
  name        text    not null default '',
  created_at  bigint  not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at  bigint  not null default (extract(epoch from now()) * 1000)::bigint,
  primary key (user_id, id)
);

create index if not exists lists_user_updated_idx
  on public.lists (user_id, updated_at);

-- ── Tabel: settings (key-value per pengguna: cfg/shist/seen) ────────────────
create table if not exists public.settings (
  user_id     uuid    not null references auth.users(id) on delete cascade,
  key         text    not null,
  value       jsonb   not null default '{}'::jsonb,
  updated_at  bigint  not null default (extract(epoch from now()) * 1000)::bigint,
  primary key (user_id, key)
);

create index if not exists settings_user_updated_idx
  on public.settings (user_id, updated_at);

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Prinsip: setiap kebijakan membatasi akses ke baris milik auth.uid() sendiri.
-- Tidak ada kebijakan yang memberi akses global ke data privat.

alter table public.entries  enable row level security;
alter table public.progress enable row level security;
alter table public.history  enable row level security;
alter table public.lists    enable row level security;
alter table public.settings enable row level security;

-- entries
drop policy if exists "entries_select_own" on public.entries;
create policy "entries_select_own" on public.entries
  for select using (auth.uid() = user_id);
drop policy if exists "entries_insert_own" on public.entries;
create policy "entries_insert_own" on public.entries
  for insert with check (auth.uid() = user_id);
drop policy if exists "entries_update_own" on public.entries;
create policy "entries_update_own" on public.entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "entries_delete_own" on public.entries;
create policy "entries_delete_own" on public.entries
  for delete using (auth.uid() = user_id);

-- progress
drop policy if exists "progress_select_own" on public.progress;
create policy "progress_select_own" on public.progress
  for select using (auth.uid() = user_id);
drop policy if exists "progress_insert_own" on public.progress;
create policy "progress_insert_own" on public.progress
  for insert with check (auth.uid() = user_id);
drop policy if exists "progress_update_own" on public.progress;
create policy "progress_update_own" on public.progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "progress_delete_own" on public.progress;
create policy "progress_delete_own" on public.progress
  for delete using (auth.uid() = user_id);

-- history
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

-- lists
drop policy if exists "lists_select_own" on public.lists;
create policy "lists_select_own" on public.lists
  for select using (auth.uid() = user_id);
drop policy if exists "lists_insert_own" on public.lists;
create policy "lists_insert_own" on public.lists
  for insert with check (auth.uid() = user_id);
drop policy if exists "lists_update_own" on public.lists;
create policy "lists_update_own" on public.lists
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "lists_delete_own" on public.lists;
create policy "lists_delete_own" on public.lists
  for delete using (auth.uid() = user_id);

-- settings
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
-- Selesai. Tabel privat tidak dapat diakses klien anonim tanpa sesi valid.
-- ============================================================================
