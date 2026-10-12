import { API_PROBE, type ApiSource } from './config';
import { candidates, currentBase, setBase } from './transport';

export class ApiError extends Error {
  status?: number;
  constructor(msg: string, status?: number) {
    super(msg);
    this.name = 'ApiError';
    this.status = status;
  }
}

const CACHE = new Map<string, { data: any; ts: number }>();
const INFLIGHT = new Map<string, Promise<any>>();

export function clearCache(): void {
  CACHE.clear();
  INFLIGHT.clear();
}

export function cacheStats(): { entries: number; bytes: number } {
  let bytes = 0;
  CACHE.forEach(v => {
    try {
      bytes += JSON.stringify(v.data).length * 2;
    } catch {
      /* noop */
    }
  });
  return { entries: CACHE.size, bytes };
}

export interface RequestOptions {
  timeout?: number;
  cacheKey?: string | null;
  ttl?: number;
}

function join(base: string, endpoint: string): string {
  if (!base) return endpoint;
  return base.replace(/\/+$/, '') + endpoint;
}

async function attempt(base: string, endpoint: string, timeout: number): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(join(base, endpoint), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
      credentials: 'omit',
      mode: 'cors'
    });
    const raw = await res.text();
    if (!res.ok) {
      const err = new ApiError('HTTP ' + res.status, res.status);
      throw err;
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw new ApiError('Respons server bukan JSON yang valid.', res.status);
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new ApiError('Request timeout.');
    if (e instanceof ApiError) throw e;
    throw new ApiError(e?.message || 'Gagal terhubung ke API.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Request JSON dengan rantai fallback antar base URL.
 * Base yang berhasil dipertahankan untuk request berikutnya, jadi
 * aplikasi selalu memakai endpoint yang hidup tanpa konfigurasi manual.
 */
export async function request(
  src: ApiSource,
  endpoint: string,
  timeout = 20000,
  list?: string[]
): Promise<{ data: any; base: string }> {
  const bases = list && list.length ? list : candidates(src);
  let definitive: ApiError | null = null;
  let first: ApiError | null = null;

  for (const base of bases) {
    try {
      const data = await attempt(base, endpoint, timeout);
      const cachedWin = candidates(src)[0];
      if (base !== cachedWin) setBase(src, base);
      return { data, base };
    } catch (e: any) {
      const err = e instanceof ApiError ? e : new ApiError(String(e?.message || e));
      if (!first) first = err;
      if (err.status && err.status !== 404 && err.status !== 405) definitive = err;
      // 404/405 = base ini tidak punya route → lanjut ke kandidat berikutnya
      continue;
    }
  }
  throw definitive || first || new ApiError('Semua sumber API gagal.');
}

export async function apiGet(
  src: ApiSource,
  endpoint: string,
  timeout = 20000,
  cacheKey: string | null = null,
  ttl = 0
): Promise<any> {
  if (cacheKey) {
    const c = CACHE.get(cacheKey);
    if (c && Date.now() - c.ts < ttl) return c.data;
    const infl = INFLIGHT.get(cacheKey);
    if (infl) return infl;
  }

  const job = (async () => {
    const { data } = await request(src, endpoint, timeout);
    if (cacheKey) CACHE.set(cacheKey, { data, ts: Date.now() });
    return data;
  })();

  if (cacheKey) {
    INFLIGHT.set(cacheKey, job);
    job.then(
      () => INFLIGHT.delete(cacheKey),
      () => INFLIGHT.delete(cacheKey)
    );
  }
  return job;
}

export function progress(onOff: boolean, pct?: number): void {
  const g = document.getElementById('topgrad');
  if (!g) return;
  g.classList.toggle('on', !!onOff);
  if (pct != null) (g as HTMLElement).style.width = pct + '%';
  if (!onOff) setTimeout(() => ((g as HTMLElement).style.width = '0'), 340);
}

/** Health-check ringan untuk panel pengaturan. */
export async function ping(
  src: ApiSource
): Promise<{ ok: boolean; ms: number; base: string }> {
  const t0 = performance.now();
  try {
    await request(src, API_PROBE[src], 12000);
    return { ok: true, ms: Math.round(performance.now() - t0), base: currentBase(src) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - t0), base: currentBase(src) };
  }
}

