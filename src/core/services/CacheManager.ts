import { cached, clearCache, cacheStats } from '../client';

/**
 * CacheManager — pembungkus tipis di atas cache in-memory (client.ts).
 * Menyediakan TTL bernama + pembersihan manual dari Pengaturan.
 */
export const TTL = {
  home: 10 * 60 * 1000,
  search: 5 * 60 * 1000,
  detail: 30 * 60 * 1000,
  episode: 60 * 60 * 1000,
  schedule: 6 * 60 * 60 * 1000,
  genre: 60 * 60 * 1000
} as const;

export type TTLKey = keyof typeof TTL;

export const CacheManager = {
  /** Ambil dari cache, atau hitung lalu simpan. Kunci diberi prefix namespace. */
  get<T>(ns: string, key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
    return cached(ns + ':' + key, ttl, fn);
  },

  home<T>(provider: string, fn: () => Promise<T>): Promise<T> {
    return cached('home:' + provider, TTL.home, fn);
  },

  detail<T>(provider: string, id: string, fn: () => Promise<T>): Promise<T> {
    return cached('detail:' + provider + ':' + id, TTL.detail, fn);
  },

  episode<T>(provider: string, episodeId: string, fn: () => Promise<T>): Promise<T> {
    return cached('episode:' + provider + ':' + episodeId, TTL.episode, fn);
  },

  search<T>(provider: string, query: string, fn: () => Promise<T>): Promise<T> {
    return cached('search:' + provider + ':' + query.toLowerCase(), TTL.search, fn);
  },

  /** Bersihkan seluruh cache (dipakai tombol "Bersihkan cache" di Pengaturan). */
  clear(): void {
    clearCache();
  },

  stats(): { entries: number; bytes: number } {
    return cacheStats();
  }
};
