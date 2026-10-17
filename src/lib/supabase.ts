import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Klien Supabase tunggal.
 * Publishable key dirancang untuk klien (bukan secret);
 * perlindungan data sepenuhnya bergantung pada Row Level Security di server.
 */

const env = import.meta.env as Record<string, string | undefined>;

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

/** Konfigurasi publik bawaan (dipakai bila env tidak tersedia, mis. build CI). */
const PUBLIC_DEFAULT: SupabaseConfig = {
  url: 'https://zueplyqfvjtnpvhaivkx.supabase.co',
  publishableKey: 'sb_publishable_Lb0-HfyDESrSpdZ3m5CzuQ_mlVkM8P1'
};

let cached: SupabaseClient | null = null;
let cachedCfg: SupabaseConfig | null = null;

export function readConfig(): SupabaseConfig | null {
  const envUrl = (env.VITE_SUPABASE_URL || '').trim();
  const envKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
  const url = envUrl || PUBLIC_DEFAULT.url;
  const key = envKey || PUBLIC_DEFAULT.publishableKey;
  if (!url || !key) return null;
  if (!/^https?:\/\//.test(url)) return null;
  if (!/^sb_publishable_/.test(key) && !/^eyJ/.test(key)) return null;
  return { url, publishableKey: key };
}

export function isConfigured(): boolean {
  return readConfig() !== null;
}

export function getClient(): SupabaseClient | null {
  if (cached) return cached;
  const cfg = readConfig();
  if (!cfg) return null;
  cachedCfg = cfg;
  cached = createClient(cfg.url, cfg.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      /**
       * PKCE diperlukan agar exchangeCodeForSession() dapat menukar ?code=
       * dari redirect OAuth (web & deep-link nanime://auth-callback di APK).
       * Deteksi otomatis dimatikan — URL callback ditangani manual agar
       * alur Capacitor dan web seragam.
       */
      flowType: 'pkce',
      detectSessionInUrl: false,
      storageKey: 'nanime.supabase.auth'
    },
    global: {
      fetch: (input, init) => {
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

export function resetClient(): void {
  cached = null;
  cachedCfg = null;
}
