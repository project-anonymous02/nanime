import { idbGet, idbSet } from '../../lib/idb';
import { TTL } from './CacheManager';

/**
 * TitleIndex — jembatan identitas kanonik ↔ sumber penyedia.
 *
 * Setiap anime punya SATU `canonicalId` (slug judul) yang dipakai di seluruh
 * route aplikasi. Pemetaan canonicalId → daftar sumber (beserta daftar episode
 * per sumber) disimpan di memori + IndexedDB sehingga tidak pernah putus
 * setelah halaman di-refresh.
 */

export interface IndexedEpisode {
  num: string;
  id: string;
  slug: string;
  date?: string;
  title?: string;
}

export interface IndexedSource {
  provider: string;
  id: string;
  slug: string;
  sourceUrl?: string;
  episodes?: IndexedEpisode[];
  updatedAt: number;
}

export interface IndexedEntry {
  id: string;
  title: string;
  poster?: string;
  score?: string;
  type?: string;
  status?: string;
  year?: string;
  updatedAt: number;
  sources: IndexedSource[];
}

/** Slug kanonik dari judul tampilan (huruf kecil, angka & musim dipertahankan). */
export function titleKey(title: string): string {
  return String(title || '')
    .normalize('NFKC')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/** Balikkan canonicalId menjadi query pencarian yang layak dipakai untuk penyembuhan. */
export function titleFromKey(id: string): string {
  return String(id || '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const mem = new Map<string, IndexedEntry>();
const PREFIX = 'title:';

function keyOf(id: string): string {
  return PREFIX + id;
}

export const TitleIndex = {
  /** Ambil entri dari memori, lalu IndexedDB. */
  async get(id: string): Promise<IndexedEntry | null> {
    const hit = mem.get(id);
    if (hit) return hit;
    const persisted = await idbGet<IndexedEntry>(keyOf(id));
    if (persisted) {
      mem.set(id, persisted);
      return persisted;
    }
    return null;
  },

  /** Simpan/perbarui entri; sumber digabung (bukan ditimpa) dan deduplikasi per penyedia. */
  async upsert(
    entry: Omit<IndexedEntry, 'updatedAt' | 'sources'> & {
      sources: Omit<IndexedSource, 'updatedAt'>[];
    }
  ): Promise<IndexedEntry> {
    const prev = await this.get(entry.id);
    const sources = new Map<string, IndexedSource>();
    (prev?.sources || []).forEach(s => sources.set(s.provider, s));
    entry.sources.forEach(s => {
      const old = sources.get(s.provider);
      sources.set(s.provider, {
        ...old,
        ...s,
        episodes: s.episodes || old?.episodes,
        updatedAt: Date.now()
      });
    });
    const text = (next: unknown, old: unknown): string | undefined => {
      const value = String(next || '').trim();
      return value || (String(old || '').trim() || undefined);
    };
    const merged: IndexedEntry = {
      ...prev,
      ...entry,
      // Provider refreshes frequently omit artwork/metadata. An empty field
      // must never erase a validated value already learned from search.
      poster: text(entry.poster, prev?.poster),
      score: text(entry.score, prev?.score),
      type: text(entry.type, prev?.type),
      status: text(entry.status, prev?.status),
      year: text(entry.year, prev?.year),
      updatedAt: Date.now(),
      sources: Array.from(sources.values())
    };
    mem.set(merged.id, merged);
    void idbSet(keyOf(merged.id), merged, TTL.index);
    return merged;
  },

  /** Simpan daftar episode milik satu penyedia (dipakai mesin fallback lintas sumber). */
  async setEpisodes(id: string, provider: string, episodes: IndexedEpisode[]): Promise<void> {
    const entry = await this.get(id);
    if (!entry) return;
    const src = entry.sources.find(s => s.provider === provider);
    if (!src) return;
    src.episodes = episodes;
    src.updatedAt = Date.now();
    entry.updatedAt = Date.now();
    mem.set(id, entry);
    void idbSet(keyOf(id), entry, TTL.index);
  },

  /** Semua entri yang dikenal (untuk pencarian luring / statistik). */
  async all(): Promise<IndexedEntry[]> {
    return Array.from(mem.values());
  },

  count(): number {
    return mem.size;
  }
};
