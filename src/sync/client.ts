import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Konfigurasi & pembuatan client Supabase tunggal.
 * Publishable key aman untuk klien (bukan secret) — perlindungan data
 * sepenuhnya bergantung pada Row Level Security di server.
 */

const env = import.meta.env as Record<string, string | undefined>;

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

let cached: SupabaseClient | null = null;
let cachedCfg: SupabaseConfig | null = null;

/** Validasi konfigurasi environment. Pesan error tidak membocorkan nilai rahasia. */
export function readConfig(): SupabaseConfig | null {
  const url = (env.VITE_SUPABASE_URL || '').trim();
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) return null;
  if (!/^https?:\/\//.test(url)) return null;
  // Publishable/anon key selalu diawali sb_publishable_ / eyJ (JWT anon lama)
  if (!/^sb_publishable_/.test(key) && !/^eyJ/.test(key)) return null;
  return { url, publishableKey: key };
}

export function isConfigured(): boolean {
  return readConfig() !== null;
}

/** Ambil (atau buat) client bersama. Mengembalikan null bila belum dikonfigurasi. */
export function getClient(): SupabaseClient | null {
  if (cached) return cached;
  const cfg = readConfig();
  if (!cfg) return null;
  cachedCfg = cfg;
  cached = createClient(cfg.url, cfg.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // ditangani manual agar alur Capacitor/web seragam
      storageKey: 'nanime.supabase.auth'
    },
    global: {
      fetch: (input, init) => {
        // Timeout per-request agar antrean tidak menggantung selamanya.
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15000);
        return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
      }
    }
  });
  return cached;
}

export function currentConfig(): SupabaseConfig | null {
  return cachedCfg || readConfig();
}

/** Hapus client (dipakai saat logout penuh / reset sesi pada tes). */
export function resetClient(): void {
  cached = null;
  cachedCfg = null;
}
