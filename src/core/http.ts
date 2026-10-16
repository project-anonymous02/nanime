import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';

/** Galat jaringan/scraping dengan kode stabil untuk penanganan di UI. */
export class NetError extends Error {
  code: NetErrorCode;
  status?: number;
  constructor(msg: string, code: NetErrorCode = 'unknown', status?: number) {
    super(msg);
    this.name = 'NetError';
    this.code = code;
    this.status = status;
  }
}

export type NetErrorCode =
  | 'offline'
  | 'timeout'
  | 'blocked'
  | 'cloudflare'
  | 'notfound'
  | 'http'
  | 'parse'
  | 'unavailable'
  | 'unknown';

export interface HttpTextResult {
  text: string;
  url: string;
  status: number;
}

export interface HttpJsonResult<T = unknown> {
  data: T;
  url: string;
  status: number;
}

export interface HttpOpts {
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
  /**
   * Izinkan permintaan dari browser web (endpoint ber-CORS publik seperti AniList/Kitsu).
   * Default false: pengambilan HTML lintas situs hanya di APK (CapacitorHttp bypass CORS);
   * di browser permintaan seperti ini akan digagalkan cepat dengan pesan yang jujur.
   */
  corsOk?: boolean;
}

const WEB_BLOCK_MSG =
  'Pengambilan data scraper hanya tersedia di APK Android. Browser web membatasi akses lintas situs (CORS).';

function assertTransport(opts: HttpOpts): void {
  if (!opts.corsOk && !isNative()) throw new NetError(WEB_BLOCK_MSG, 'blocked');
}

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Backoff eksponensial dengan jitter, dibatasi agar tidak lama. */
function backoffDelay(attempt: number): number {
  const base = Math.min(400 * Math.pow(2, attempt), 4000);
  return base + Math.floor(Math.random() * 220);
}

function classifyError(e: any): NetError {
  if (e instanceof NetError) return e;
  const msg = String(e?.message || e || '').toLowerCase();
  if (!navigator.onLine) return new NetError('Koneksi internet tidak tersedia.', 'offline');
  if (msg.includes('timeout') || e?.code === 'ETIMEDOUT') return new NetError('Koneksi timeout.', 'timeout');
  if (msg.includes('cloudflare') || msg.includes('just a moment') || msg.includes('challenge'))
    return new NetError('Situs sumber membatasi akses (Cloudflare).', 'cloudflare');
  if (e?.status === 404) return new NetError('Halaman tidak ditemukan (404).', 'notfound', 404);
  if (typeof e?.status === 'number' && e.status >= 400) return new NetError('Server menolak permintaan (HTTP ' + e.status + ').', 'http', e.status);
  return new NetError(e?.message || 'Gagal menghubungi sumber.', 'unknown');
}

/**
 * GET teks dengan timeout, retry, dan backoff.
 * Di APK memakai CapacitorHttp (bypass CORS); di browser memakai fetch biasa
 * sehingga endpoint ber-CORS publik (AniList/Kitsu) tetap berfungsi untuk uji web.
 */
export async function httpGetText(url: string, opts: HttpOpts = {}): Promise<HttpTextResult> {
  assertTransport(opts);
  const timeout = opts.timeout ?? 20000;
  const retries = opts.retries ?? 2;
  let lastErr: NetError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (isNative()) {
        const res = await CapacitorHttp.request({
          url,
          method: 'GET',
          headers: opts.headers || {},
          connectTimeout: timeout,
          readTimeout: timeout
        });
        const status = res.status || 0;
        const text = typeof res.data === 'string' ? res.data : String(res.data ?? '');
        if (status < 200 || status >= 300) {
          const err = new NetError('HTTP ' + status, status === 404 ? 'notfound' : 'http', status);
          // Jangan retry untuk 4xx selain 429 — percuma.
          if (status >= 400 && status < 500 && status !== 429) throw Object.assign(err, { __final: true });
          throw err;
        }
        return { text, url, status };
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      try {
        const res = await fetch(url, { signal: ctrl.signal, headers: opts.headers || {}, credentials: 'omit' });
        if (!res.ok) {
          const err = new NetError('HTTP ' + res.status, res.status === 404 ? 'notfound' : 'http', res.status);
          if (res.status >= 400 && res.status < 500 && res.status !== 429) throw Object.assign(err, { __final: true });
          throw err;
        }
        const text = await res.text();
        return { text, url, status: res.status };
      } finally {
        clearTimeout(timer);
      }
    } catch (e: any) {
      const err = classifyError(e);
      // Galat final (4xx) tidak di-retry.
      if (e?.__final || err.code === 'notfound' || err.code === 'offline') throw err;
      lastErr = err;
      if (attempt < retries) await sleep(backoffDelay(attempt));
    }
  }
  throw lastErr || new NetError('Gagal mengambil halaman.');
}

/** GET JSON (endpoint API publik ber-CORS — selalu diizinkan di web). */
export async function httpGetJson<T = unknown>(url: string, opts: HttpOpts = {}): Promise<HttpJsonResult<T>> {
  const r = await httpGetText(url, { ...opts, corsOk: true });
  try {
    return { data: JSON.parse(r.text) as T, url: r.url, status: r.status };
  } catch {
    throw new NetError('Respons server bukan JSON yang valid.', 'parse', r.status);
  }
}

/** POST JSON (untuk GraphQL AniList). */
export async function httpPostJson<T = unknown>(
  url: string,
  body: unknown,
  opts: HttpOpts = {}
): Promise<HttpJsonResult<T>> {
  const timeout = opts.timeout ?? 20000;
  const retries = opts.retries ?? 2;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  let lastErr: NetError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (isNative()) {
        const res = await CapacitorHttp.request({
          url,
          method: 'POST',
          headers,
          data: JSON.stringify(body),
          connectTimeout: timeout,
          readTimeout: timeout
        });
        const status = res.status || 0;
        if (status === 429) throw new NetError('Rate limit tercapai.', 'http', 429);
        if (status < 200 || status >= 300) throw new NetError('HTTP ' + status, 'http', status);
        const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        return { data: data as T, url, status };
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: ctrl.signal,
          credentials: 'omit'
        });
        if (statusRetryable(res.status)) throw new NetError('HTTP ' + res.status, 'http', res.status);
        if (!res.ok) throw Object.assign(new NetError('HTTP ' + res.status, 'http', res.status), { __final: true });
        return { data: (await res.json()) as T, url, status: res.status };
      } finally {
        clearTimeout(timer);
      }
    } catch (e: any) {
      const err = classifyError(e);
      if (e?.__final || err.code === 'notfound' || err.code === 'offline') throw err;
      lastErr = err;
      if (attempt < retries) await sleep(backoffDelay(attempt));
    }
  }
  throw lastErr || new NetError('Gagal mengirim permintaan.');
}

function statusRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export function isNativePlatform(): boolean {
  return isNative();
}
