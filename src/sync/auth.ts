import type { SupabaseClient, Session, User } from '@supabase/supabase-js';
import { getClient, isConfigured } from './client';

/**
 * Abstraksi autentikasi Nanime.
 * - Guest mode selalu tersedia (tanpa login, data lokal penuh).
 * - Identitas pengguna dipilih dari Supabase Auth (email OTP / Google OAuth).
 * - Token Google diverifikasi oleh Supabase (bukan dipercaya dari klien).
 */

export interface AuthState {
  configured: boolean;
  signedIn: boolean;
  user: { id: string; email: string | null; name: string | null; avatar: string | null } | null;
}

type Listener = (s: AuthState) => void;

let session: Session | null = null;
let listeners = new Set<Listener>();
let initPromise: Promise<void> | null = null;
let unsub: (() => void) | null = null;

function toState(): AuthState {
  const u = session?.user;
  const meta = (u?.user_metadata || {}) as Record<string, unknown>;
  return {
    configured: isConfigured(),
    signedIn: !!u,
    user: u
      ? {
          id: u.id,
          email: (u.email as string) || null,
          name: (meta.full_name || meta.name || meta.preferred_username || null) as string | null,
          avatar: (meta.avatar_url || meta.picture || null) as string | null
        }
      : null
  };
}

function emit(): void {
  const s = toState();
  for (const cb of listeners) {
    try {
      cb(s);
    } catch {
      /* noop */
    }
  }
}

export function currentAuth(): AuthState {
  return toState();
}

export function currentUserId(): string | null {
  return session?.user?.id ?? null;
}

export function onAuthChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function requireClient(): SupabaseClient | null {
  return getClient();
}

/** Inisialisasi sesi tersimpan & langganan perubahan auth. Aman dipanggil berulang. */
export async function initAuth(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const sb = requireClient();
    if (!sb) {
      emit();
      return;
    }
    try {
      const { data } = await sb.auth.getSession();
      session = data.session;
    } catch {
      session = null;
    }
    emit();
    try {
      const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
        session = s;
        emit();
      });
      unsub = sub.subscription.unsubscribe;
    } catch {
      /* noop */
    }
  })();
  return initPromise;
}

export function disposeAuth(): void {
  try {
    unsub?.();
  } catch {
    /* noop */
  }
  unsub = null;
  listeners = new Set();
  session = null;
  initPromise = null;
}

/** Tautan URL yang dipakai sebagai tujuan OAuth kembali ke aplikasi. */
function redirectUri(): string {
  const origin = location.origin + location.pathname;
  return origin + '#/auth/callback';
}

/** Skema deep-link khusus build Android (disuntik oleh skrip CI ke manifest). */
const NATIVE_REDIRECT = 'nanime://auth-callback';

export function isNative(): boolean {
  try {
    const c = (globalThis as any).Capacitor;
    return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform());
  } catch {
    return false;
  }
}

/** URL deep-link native yang akan ditangani listener appUrlOpen. */
export function nativeRedirectUri(): string {
  return NATIVE_REDIRECT;
}

export interface SignInResult {
  ok: boolean;
  message: string;
  /** URL otorisasi yang harus dibuka di browser (hanya untuk alur OAuth). */
  url?: string;
}

/**
 * Masuk dengan Google via Supabase OAuth.
 * - Web: redirect biasa (PKCE), tujuan #/auth/callback.
 * - Native: minta URL lalu buka di browser eksternal; kembali lewat deep link
 *   nanime://auth-callback yang ditukar dengan exchangeCodeForSession().
 */
export async function signInGoogle(): Promise<SignInResult> {
  const sb = requireClient();
  if (!sb) return { ok: false, message: 'Supabase belum dikonfigurasi.' };
  try {
    const native = isNative();
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: native ? NATIVE_REDIRECT : redirectUri(),
        scopes: 'email profile',
        ...(native ? { skipHttpRedirect: true } : {})
      }
    });
    if (error) {
      return { ok: false, message: humanAuthError(error.message, 'Google') };
    }
    if (native && data.url) {
      return { ok: true, message: 'Membuka browser untuk masuk Google…', url: data.url };
    }
    return { ok: true, message: 'Mengalihkan ke Google…', url: data.url };
  } catch (e) {
    return { ok: false, message: 'Gagal memulai masuk Google: ' + ((e as Error)?.message || 'tidak diketahui') };
  }
}

/** Tukar kode OAuth (dari redirect/deep-link) menjadi sesi. */
export async function exchangeCode(code: string): Promise<SignInResult> {
  const sb = requireClient();
  if (!sb) return { ok: false, message: 'Supabase belum dikonfigurasi.' };
  try {
    const { data, error } = await sb.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, message: humanAuthError(error.message, 'Google') };
    session = data.session;
    emit();
    return { ok: true, message: 'Berhasil masuk.' };
  } catch (e) {
    return { ok: false, message: 'Gagal menukar kode: ' + ((e as Error)?.message || 'tidak diketahui') };
  }
}

/** Masuk dengan OTP magic-link email (tanpa kata sandi). */
export async function signInEmail(email: string): Promise<SignInResult> {
  const sb = requireClient();
  if (!sb) return { ok: false, message: 'Supabase belum dikonfigurasi.' };
  const mail = String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return { ok: false, message: 'Format email tidak valid.' };
  try {
    const { error } = await sb.auth.signInWithOtp({
      email: mail,
      options: { emailRedirectTo: redirectUri() }
    });
    if (error) return { ok: false, message: humanAuthError(error.message, 'email') };
    return { ok: true, message: 'Tautan masuk dikirim ke ' + mail + '.' };
  } catch (e) {
    return { ok: false, message: 'Gagal mengirim tautan: ' + ((e as Error)?.message || 'tidak diketahui') };
  }
}

export async function signOut(): Promise<SignInResult> {
  const sb = requireClient();
  if (!sb) return { ok: false, message: 'Supabase belum dikonfigurasi.' };
  try {
    const { error } = await sb.auth.signOut();
    if (error) return { ok: false, message: humanAuthError(error.message, 'keluar') };
    session = null;
    emit();
    return { ok: true, message: 'Berhasil keluar.' };
  } catch (e) {
    return { ok: false, message: 'Gagal keluar: ' + ((e as Error)?.message || 'tidak diketahui') };
  }
}

/** Pesan error yang ramah & tidak membocorkan detail teknis/rahasia. */
export function humanAuthError(raw: string, ctx: string): string {
  const s = String(raw || '').toLowerCase();
  if (s.includes('provider') && s.includes('not')) {
    return 'Masuk ' + ctx + ' belum diaktifkan di dashboard Supabase (Auth → Providers).';
  }
  if (s.includes('invalid') && s.includes('refresh')) {
    return 'Sesi kedaluwarsa. Silakan masuk ulang.';
  }
  if (s.includes('network') || s.includes('fetch') || s.includes('timeout')) {
    return 'Jaringan bermasalah. Coba lagi.';
  }
  if (s.includes('email') && s.includes('not confirmed')) {
    return 'Email belum dikonfirmasi. Cek kotak masukmu.';
  }
  if (s.includes('rate') || s.includes('too many')) {
    return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
  }
  return 'Gagal ' + ctx + ': ' + (raw || 'tidak diketahui');
}

export type { User, Session };
