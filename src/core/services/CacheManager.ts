import { idbGet, idbGetStale, idbSet, idbDel, idbClear, idbStats, idbPrune } from '../../lib/idb';

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
  /** Beranda: 24 jam (kesegaran datang dari revalidasi latar, bukan blocking). */
  home: 24 * 60 * 60 * 1000,
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

const mem = new Map<string, { data: unknown; expiresAt: number; at?: number }>();
const inflight = new Map<string, Promise<unknown>>();
const counters = { memoryHits: 0, indexedDbHits: 0, networkMisses: 0, inflightJoins: 0 };

/** Jendela revalidasi lembut: data di memori lebih tua dari ini disegarkan di latar. */
const SOFT_REVALIDATE = 10 * 60 * 1000;

async function run<T>(full: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = mem.get(full);
  if (hit && hit.expiresAt > Date.now()) { counters.memoryHits++; return hit.data as T; }
  const running = inflight.get(full);
  if (running) { counters.inflightJoins++; return running as Promise<T>; }

  const job = (async () => {
    const persisted = await idbGet<T>(full);
    if (persisted != null) {
      counters.indexedDbHits++;
      mem.set(full, { data: persisted, expiresAt: Date.now() + Math.min(ttl, 60 * 1000), at: Date.now() });
      return persisted;
    }
    counters.networkMisses++;
    const data = await fn();
    const expiresAt = Date.now() + ttl;
    mem.set(full, { data, expiresAt, at: Date.now() });
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

/** Hitung ulang memaksa (lewati memori), tetap dedup via `inflight`. */
function refresh<T>(full: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const running = inflight.get(full);
  if (running) return running as Promise<T>;
  const job = (async () => {
    const data = await fn();
    mem.set(full, { data, expiresAt: Date.now() + ttl, at: Date.now() });
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
  metrics() { return { ...counters }; },
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

  /**
   * Stale-while-revalidate: salinan lama (IndexedDB, walau kedaluwarsa) langsung
   * dikembalikan agar UI tampil seketika; penyegaran berjalan di latar dan
   * hasil barunya dikirim lewat `onFresh`. Bila tak ada salinan sama sekali,
   * menunggu hasil segar seperti biasa.
   */
  async getSWR<T>(
    ns: string,
    key: string,
    ttl: number,
    fn: () => Promise<T>,
    onFresh?: (data: T) => void
  ): Promise<{ data: T | null; stale: boolean }> {
    const full = ns + ':' + key;
    const hit = mem.get(full);
    if (hit && hit.expiresAt > Date.now()) {
      const age = Date.now() - (hit.at || 0);
      if (onFresh && age > SOFT_REVALIDATE) {
        hit.at = Date.now(); // cegah banjir permintaan segar serentak
        void refresh(full, ttl, fn).then(
          d => {
            try {
              onFresh(d as T);
            } catch {
              /* noop */
            }
          },
          () => {
            /* tetap tampilkan data lama */
          }
        );
      }
      return { data: hit.data as T, stale: false };
    }

    const old = await idbGetStale<T>(full);
    if (old != null) {
      if (onFresh) {
        void refresh(full, ttl, fn).then(
          d => {
            try {
              onFresh(d as T);
            } catch {
              /* noop */
            }
          },
          () => {
            /* tetap tampilkan data lama */
          }
        );
      }
      return { data: old, stale: true };
    }

    return { data: await run(full, ttl, fn), stale: false };
  },

  /** Buang satu entri (memori + IndexedDB) — dipakai "muat ulang" manual. */
  invalidate(ns: string, key: string): void {
    const full = ns + ':' + key;
    mem.delete(full);
    inflight.delete(full);
    void idbDel(full);
  },

  /* ── Pembungkus TTL bernama ── */

  home<T>(provider: string, fn: () => Promise<T>, fresh = false): Promise<T> {
    const key = 'home:' + provider;
    return fresh ? refresh(key, TTL.home, fn) : run(key, TTL.home, fn);
  },

  detail<T>(provider: string, id: string, fn: () => Promise<T>): Promise<T> {
    return run('detail:' + provider + ':' + id, TTL.detail, fn);
  },

  episode<T>(provider: string, episodeId: string, fn: () => Promise<T>): Promise<T> {
    return run('episode:' + provider + ':' + episodeId, TTL.episode, fn);
  },

  search<T>(provider: string, query: string, fn: () => Promise<T>): Promise<T> {
    const key = String(query || '').normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
    return run('search:' + provider + ':' + key, TTL.search, fn);
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
