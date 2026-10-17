import { create } from 'zustand';
import { getClient, isConfigured } from '../lib/supabase';
import { profile as remoteProfile } from '../lib/remote';
import { useLibrary } from './library';
import { useSettings } from './settings';
import { CacheManager } from '../core/services/CacheManager';

/**
 * Auth — login Google WAJIB sebelum konten bisa diakses (tanpa mode tamu).
 * Alur:
 *  • Web  : redirect OAuth → kembali ke #/auth/callback → kode ditukar sesi.
 *  • APK  : URL otorisasi dibuka di browser eksternal → kembali lewat
 *           deep-link nanime://auth-callback → kode ditukar sesi.
 */

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
}

interface AuthStore {
  ready: boolean;
  configured: boolean;
  signedIn: boolean;
  user: AuthUser | null;
}

export const useAuth = create<AuthStore>(() => ({
  ready: false,
  configured: isConfigured(),
  signedIn: false,
  user: null
}));

/** ID pengguna aktif (null bila belum masuk). */
export function currentUserId(): string | null {
  return useAuth.getState().user?.id ?? null;
}

export function currentAuthUser(): AuthUser | null {
  return useAuth.getState().user;
}

/** Pesan galat auth yang ramah — tanpa istilah teknis. */
const AUTH_FAIL = 'Gagal masuk dengan Google. Silakan coba lagi nanti.';

function isNativePlatform(): boolean {
  try {
    const c = (globalThis as any).Capacitor;
    return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform());
  } catch {
    return false;
  }
}

function webRedirect(): string {
  return location.origin + location.pathname + '#/auth/callback';
}

let started = false;
let lastUserId: string | null = null;
let unsub: (() => void) | null = null;

/** Terapkan sesi (login/logout/refresh) ke store + sinkronisasi data pengguna. */
async function applySession(session: { user?: any } | null): Promise<void> {
  const u = session?.user;
  if (!u) {
    if (lastUserId) {
      /* Akun berganti/keluar: bersihkan data pengguna sebelumnya. */
      useLibrary.getState().purge();
      useSettings.getState().reset();
    }
    lastUserId = null;
    useAuth.setState({ signedIn: false, user: null });
    return;
  }
  const meta = (u.user_metadata || {}) as Record<string, unknown>;
  const user: AuthUser = {
    id: u.id,
    email: (u.email as string) || null,
    name: (meta.full_name || meta.name || meta.preferred_username || null) as string | null,
    avatar: (meta.avatar_url || meta.picture || null) as string | null
  };
  const changed = lastUserId !== user.id;
  lastUserId = user.id;
  useAuth.setState({ signedIn: true, user, configured: isConfigured(), ready: true });

  void remoteProfile
    .upsert(user.id, { email: user.email, name: user.name, avatar: user.avatar })
    .catch(() => {
      /* offline: profil lokal tetap dipakai */
    });

  if (changed) {
    void useLibrary.getState().reconcile(user.id);
    void useSettings.getState().reconcile(user.id);
  }
}

/** Inisialisasi sekali: ambil sesi tersimpan & langgani perubahan auth. */
export async function initAuth(): Promise<void> {
  if (started) return;
  started = true;
  const sb = getClient();
  if (!sb) {
    useAuth.setState({ ready: true, configured: false });
    return;
  }
  try {
    const { data } = await sb.auth.getSession();
    await applySession(data.session);
  } catch {
    /* tidak ada sesi tersimpan */
  }
  useAuth.setState({ ready: true });
  try {
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      void applySession(session);
    });
    unsub = sub.subscription.unsubscribe;
  } catch {
    /* noop */
  }
}

export function disposeAuth(): void {
  try {
    unsub?.();
  } catch {
    /* noop */
  }
  unsub = null;
  started = false;
  lastUserId = null;
}

export interface SignInOutcome {
  ok: boolean;
  message: string;
  /** URL otorisasi yang perlu dibuka di browser eksternal (alur APK). */
  url?: string;
}

/**
 * Mulai login Google.
 * Catatan penting: `skipBrowserRedirect` WAJIB true di APK — tanpa itu
 * WebView akan menelan redirect Google dan login menggantung.
 */
export async function signInGoogle(): Promise<SignInOutcome> {
  const sb = getClient();
  if (!sb) return { ok: false, message: AUTH_FAIL };
  try {
    const native = isNativePlatform();
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: native ? 'nanime://auth-callback' : webRedirect(),
        scopes: 'email profile',
        skipBrowserRedirect: native
      }
    });
    if (error || !data || !data.url) return { ok: false, message: AUTH_FAIL };
    if (native) return { ok: true, message: '', url: data.url };
    window.location.assign(data.url);
    return { ok: true, message: '' };
  } catch {
    return { ok: false, message: AUTH_FAIL };
  }
}

/** Ambil ?code= dari URL callback (web `#/auth/callback?code=…` maupun deep-link `nanime://auth-callback?code=…`). */
export function extractAuthCode(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl, location.origin);
    let code = u.searchParams.get('code');
    if (!code && u.hash) {
      const hi = u.hash.indexOf('?');
      const hq = hi > -1 ? u.hash.slice(hi + 1) : u.hash.replace(/^#\/?/, '');
      code = new URLSearchParams(hq).get('code');
    }
    return code;
  } catch {
    return null;
  }
}

/** Pesan galat dari URL callback (bila ada). */
export function extractAuthError(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl, location.origin);
    const direct = u.searchParams.get('error_description') || u.searchParams.get('error');
    if (direct) return direct;
    if (u.hash && u.hash.indexOf('error') > -1) {
      const hi = u.hash.indexOf('?');
      const hq = hi > -1 ? u.hash.slice(hi + 1) : u.hash.replace(/^#\/?/, '');
      const p = new URLSearchParams(hq);
      return p.get('error_description') || p.get('error') || null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Tukar kode OAuth dari callback menjadi sesi aktif. */
export async function completeAuthCallback(rawUrl: string): Promise<boolean> {
  const sb = getClient();
  if (!sb) return false;
  if (extractAuthError(rawUrl)) return false;
  const code = extractAuthCode(rawUrl);
  if (!code) return false;
  try {
    const { data, error } = await sb.auth.exchangeCodeForSession(code);
    if (error || !data?.session) return false;
    await applySession(data.session);
    return true;
  } catch {
    return false;
  }
}

/** Keluar total: sesi server + seluruh data pengguna + cache. */
export async function signOutUser(): Promise<void> {
  const sb = getClient();
  try {
    await sb?.auth.signOut();
  } catch {
    /* offline: tetap bersihkan lokal */
  }
  lastUserId = null;
  useLibrary.getState().purge();
  useSettings.getState().reset();
  useAuth.setState({ signedIn: false, user: null });
  CacheManager.clear();
}
