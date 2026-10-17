/** Tipe data pengguna (domain) + baris tabel Supabase. */

export interface ProfileInfo {
  userId: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  updatedAt: number;
}

export interface FavAnime {
  id: string;
  title: string;
  poster: string;
  score: string;
  type: string;
  status: string;
  addedAt: number;
  updatedAt: number;
}

export interface HistoryItem {
  animeId: string;
  episode: string;
  title: string;
  poster: string;
  positionSec: number;
  durationSec: number;
  percent: number;
  completed: boolean;
  watchedAt: number;
  updatedAt: number;
}

/** Pengaturan aplikasi milik pengguna (disinkronkan, tidak perangkat). */
export interface UserSettings {
  autoplayNext: boolean;
  playerControls: boolean;
  skipIntro: boolean;
  introDuration: number;
  defaultQuality: '480p' | '720p' | '1080p';
}

export const DEFAULT_SETTINGS: UserSettings = {
  autoplayNext: true,
  playerControls: true,
  skipIntro: false,
  introDuration: 85,
  defaultQuality: '480p'
};

/* ── Baris tabel (snake_case) ── */

export interface ProfileRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  updated_at: number;
}

export interface FavoriteRow {
  user_id: string;
  anime_id: string;
  title: string;
  poster: string;
  score: string;
  type: string;
  status: string;
  added_at: number;
  updated_at: number;
}

export interface HistoryRow {
  user_id: string;
  anime_id: string;
  episode: string;
  title: string;
  poster: string;
  position_sec: number;
  duration_sec: number;
  percent: number;
  completed: boolean;
  watched_at: number;
  updated_at: number;
}

export interface SettingRow {
  user_id: string;
  key: string;
  value: unknown;
  updated_at: number;
}
