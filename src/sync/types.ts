import type { WatchStatus } from '../core/types';

/** Baris tabel `entries` (favorit + meta personal), sesuai ExportBundle v3. */
export interface EntryRow {
  key: string;
  provider: string;
  anime_id: string;
  slug: string;
  title: string;
  poster: string;
  status: WatchStatus | null;
  rating: number | null;
  favorite: boolean;
  note: string | null;
  created_at: number;
  updated_at: number;
}

/** Baris tabel `progress` (lanjutkan menonton). */
export interface ProgressRow {
  key: string;
  provider: string;
  anime_id: string;
  slug: string;
  title: string;
  poster: string;
  episode: string;
  episode_id: string;
  episode_slug: string;
  position_sec: number;
  duration_sec: number;
  percent: number;
  completed: boolean;
  updated_at: number;
}

/** Baris tabel `history`. */
export interface HistoryRow {
  key: string;
  provider: string;
  anime_id: string;
  slug: string;
  title: string;
  poster: string;
  episode: string;
  episode_id: string;
  episode_slug: string;
  watched_at: number;
  updated_at: number;
}

/** Baris tabel `lists` (daftar khusus pengguna). */
export interface ListRow {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
}

/** Baris tabel `settings` (key-value per pengguna). */
export interface SettingRow {
  key: string;
  value: unknown;
  updated_at: number;
}

export type TableName = 'entries' | 'progress' | 'history' | 'lists' | 'settings';

/** Status kesehatan & progres sinkronisasi (jujur — tidak mengada-ada). */
export interface SyncStatus {
  configured: boolean;
  signedIn: boolean;
  /** 'idle' | 'syncing' | 'error' | 'offline' */
  state: 'idle' | 'syncing' | 'error' | 'offline';
  lastSyncAt: number | null;
  lastError: string | null;
  pending: number;
  /** true bila ada data tamu yang menunggu migrasi ke akun. */
  guestPending: boolean;
}
