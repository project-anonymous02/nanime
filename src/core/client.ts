import { scrapeRequest, type ScrapeTask } from './scraper';

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

export async function request(task: ScrapeTask, timeout = 20000): Promise<any> {
  try {
    return await scrapeRequest(task, timeout);
  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(e?.message || 'Gagal mengambil halaman situs sumber.');
  }
}

export async function apiGet(
  task: ScrapeTask,
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
    const data = await request(task, timeout);
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

/**
 * Cache + in-flight dedup untuk fungsi provider baru (tanpa ScrapeTask).
 * Galat tidak pernah di-cache; hanya hasil sukses yang disimpan.
 */
export async function cached<T>(cacheKey: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const c = CACHE.get(cacheKey);
  if (c && Date.now() - c.ts < ttl) return c.data as T;
  const infl = INFLIGHT.get(cacheKey);
  if (infl) return infl as Promise<T>;
  const job = (async () => {
    const data = await fn();
    CACHE.set(cacheKey, { data, ts: Date.now() });
    return data;
  })();
  INFLIGHT.set(cacheKey, job);
  job.then(
    () => INFLIGHT.delete(cacheKey),
    () => INFLIGHT.delete(cacheKey)
  );
  return job;
}

export function progress(onOff: boolean, pct?: number): void {
  const g = document.getElementById('topgrad');
  if (!g) return;
  g.classList.toggle('on', !!onOff);
  if (pct != null) (g as HTMLElement).style.width = pct + '%';
  if (!onOff) setTimeout(() => ((g as HTMLElement).style.width = '0'), 340);
}

/**
 * Snapshot persisten (localStorage) untuk data katalog. Dipakai agar muat ulang
 * halaman tidak mengosongkan daftar ketika sumber sedang galat/lambat.
 */
export function saveSnapshot<T>(key: string, data: T): void {
  try {
    localStorage.setItem('nanime.snap.' + key, JSON.stringify({ t: Date.now(), data }));
  } catch {
    /* kuota penuh / privat — abaikan */
  }
}

export function loadSnapshot<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem('nanime.snap.' + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && 'data' in parsed ? (parsed.data as T) : null;
  } catch {
    return null;
  }
}


