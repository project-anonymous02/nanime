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

/**
 * Konfigurasi publik bawaan (publishable key dirancang untuk klien — BUKAN secret;
 * perlindungan database sepenuhnya oleh RLS). Dipakai bila env tidak diset,
 * mis. pada build CI yang tidak membawa berkas .env. Env (VITE_*) tetap
 * menimpa nilai ini bila ada.
 */
const PUBLIC_DEFAULT: SupabaseConfig = {
  url: 'https://zueplyqfvjtnpvhaivkx.supabase.co',
  publishableKey: 'sb_publishable_Lb0-HfyDESrSpdZ3m5CzuQ_mlVkM8P1'
};

let cached: SupabaseClient | null = null;
let cachedCfg: SupabaseConfig | null = null;

/** Validasi konfigurasi (env menimpa default publik). Pesan error tidak membocorkan rahasia. */
export function readConfig(): SupabaseConfig | null {
  const envUrl = (env.VITE_SUPABASE_URL || '').trim();
  const envKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
  const url = envUrl || PUBLIC_DEFAULT.url;
  const key = envKey || PUBLIC_DEFAULT.publishableKey;
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
      // PKCE diperlukan agar exchangeCodeForSession() dapat menukar ?code= dari
      // redirect OAuth (web & deep-link nanime://auth-callback di APK).
      flowType: 'pkce',
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
