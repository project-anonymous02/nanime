import { idbGet, idbGetStale, idbSet, idbClear, idbStats, idbPrune } from '../../lib/idb';

/**
 * CacheManager — cache 3 lapisan:
 *   1. Memori  (tanpa I/O, hit tercepat, bertahan selama sesi)
 *   2. IndexedDB (bertahan melewati refresh/tutup aplikasi)
 *   3. Jaringan (fallback terakhir; hasil sukses selalu ditulis ke 2 lapisan di atas)
 * Setiap jenis data punya TTL sendiri. Cache dibatasi 50MB dengan LRU otomatis.
 */

export const TTL = {
  /** Pencarian: 3600 detik. */
  search: 3600 * 1000,
  /** Detail anime: 1800 detik. */
  detail: 1800 * 1000,
  /** Link stream: 180 detik (URL embed cepat kedaluwarsa). */
  stream: 180 * 1000,
  /** Link unduh: 600 detik. */
  download: 600 * 1000,
  /** Profil pengguna: 7200 detik. */
  profile: 7200 * 1000,
  /** Beranda: 600 detik. */
  home: 600 * 1000,
  /** Daftar episode: 1800 detik. */
  episode: 1800 * 1000,
  /** Jadwal rilis: 6 jam. */
  schedule: 6 * 60 * 60 * 1000,
  /** Daftar genre: 1 jam. */
  genre: 3600 * 1000,
  /** Indeks judul (pemetaan sumber): 30 hari. */
  index: 30 * 24 * 60 * 60 * 1000
} as const;

export type TTLKey = keyof typeof TTL;

const MAX_BYTES = 50 * 1024 * 1024;

const mem = new Map<string, { data: unknown; expiresAt: number }>();
const inflight = new Map<string, Promise<unknown>>();

async function run<T>(full: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = mem.get(full);
  if (hit && hit.expiresAt > Date.now()) return hit.data as T;
  const running = inflight.get(full);
  if (running) return running as Promise<T>;

  const job = (async () => {
    const persisted = await idbGet<T>(full);
    if (persisted != null) {
      mem.set(full, { data: persisted, expiresAt: Date.now() + Math.min(ttl, 60 * 1000) });
      return persisted;
    }
    const data = await fn();
    const expiresAt = Date.now() + ttl;
    mem.set(full, { data, expiresAt });
    void idbSet(full, data, ttl);
    void idbPrune(MAX_BYTES);
    return data;
  })();

  inflight.set(full, job);
  job.then(
    () => inflight.delete(full),
    () => inflight.delete(full)
  );
  return job;
}

export const CacheManager = {
  /** Ambil dari cache (memori → IndexedDB), atau hitung lalu simpan. */
  get<T>(ns: string, key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
    return run(ns + ':' + key, ttl, fn);
  },

  /**
   * Versi tahan-gagal: bila jaringan gagal dan ada salinan lama,
   * kembalikan salinan itu dengan penanda `stale` (mode luring).
   */
  async getOrStale<T>(
    ns: string,
    key: string,
    ttl: number,
    fn: () => Promise<T>
  ): Promise<{ data: T | null; stale: boolean }> {
    try {
      const data = await run(ns + ':' + key, ttl, fn);
      return { data, stale: false };
    } catch (e) {
      const memHit = mem.get(ns + ':' + key);
      if (memHit && memHit.data != null) return { data: memHit.data as T, stale: true };
      const old = await idbGetStale<T>(ns + ':' + key);
      if (old != null) return { data: old, stale: true };
      throw e;
    }
  },

  /* ── Pembungkus TTL bernama ── */

  home<T>(provider: string, fn: () => Promise<T>): Promise<T> {
    return run('home:' + provider, TTL.home, fn);
  },

  detail<T>(provider: string, id: string, fn: () => Promise<T>): Promise<T> {
    return run('detail:' + provider + ':' + id, TTL.detail, fn);
  },

  episode<T>(provider: string, episodeId: string, fn: () => Promise<T>): Promise<T> {
    return run('episode:' + provider + ':' + episodeId, TTL.episode, fn);
  },

  search<T>(provider: string, query: string, fn: () => Promise<T>): Promise<T> {
    return run('search:' + provider + ':' + query.toLowerCase(), TTL.search, fn);
  },

  stream<T>(provider: string, episodeId: string, fn: () => Promise<T>): Promise<T> {
    return run('stream:' + provider + ':' + episodeId, TTL.stream, fn);
  },

  downloads<T>(provider: string, key: string, fn: () => Promise<T>): Promise<T> {
    return run('dl:' + provider + ':' + key, TTL.download, fn);
  },

  profile<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return run('profile:' + userId, TTL.profile, fn);
  },

  /* ── Manajemen ── */

  /** Bersihkan seluruh cache (dipakai tombol "Hapus cache" di Pengaturan). */
  clear(): void {
    mem.clear();
    inflight.clear();
    void idbClear();
  },

  /** Statistik lapisan memori (sinkron). */
  stats(): { entries: number; bytes: number } {
    let bytes = 0;
    mem.forEach(v => {
      try {
        bytes += JSON.stringify(v.data).length * 2;
      } catch {
        /* noop */
      }
    });
    return { entries: mem.size, bytes };
  },

  /** Statistik gabungan (memori + IndexedDB). */
  async statsAsync(): Promise<{ entries: number; bytes: number }> {
    const disk = await idbStats();
    return { entries: disk.entries, bytes: disk.bytes };
  },

  /** Buang entri kedaluwarsa dari memori. */
  sweep(): void {
    const now = Date.now();
    mem.forEach((v, k) => {
      if (v.expiresAt <= now) mem.delete(k);
    });
  }
};
