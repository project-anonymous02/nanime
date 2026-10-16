import type { Card, SearchResult, SourceResult } from '../types';
import { ProviderAggregator } from './ProviderAggregator';
import { matchScore } from '../utils/fuzzyMatch';
import { aliasKey, aliasesOf, splitSeason } from '../utils/titleAliases';

export interface SearchFilters {
  providers?: string[];
  types?: string[];
  statuses?: string[];
  season?: number | null;
  minMatch?: number;
}

export type SearchSort = 'relevance' | 'title' | 'provider';

/**
 * SearchEngine — menyatukan hasil dari semua provider lalu:
 * memberi skor relevansi, membuang duplikat lintas provider, dan mengurutkan.
 */

/** Skor gabungan; sinonim/alias dinaikkan agar "Demon Slayer" menemukan "Kimetsu no Yaiba". */
function relevance(query: string, card: Card): number {
  let s = matchScore(query, card.title);
  const qa = aliasKey(query);
  if (qa) {
    if (aliasesOf(card.title || '').some(a => aliasKey(a) === qa)) s = Math.max(s, 88);
  }
  const qs = splitSeason(query);
  const ts = splitSeason(card.title || '');
  if (qs.season && ts.season === qs.season) s = Math.min(100, s + 5);
  return s;
}

/** Cari + urutkan + saring. Mengembalikan juga status tiap sumber. */
export async function search(
  query: string,
  opts: { filters?: SearchFilters; sort?: SearchSort; minMatch?: number } = {}
): Promise<SearchResult & { filtered: Card[] }> {
  const sources = await ProviderAggregator.search(query);
  const filters = opts.filters || {};
  const minMatch = opts.minMatch != null ? opts.minMatch : filters.minMatch != null ? filters.minMatch : 0;

  const items: Card[] = [];
  const seenTitle = new Set<string>();
  const seenUrl = new Set<string>();

  for (const s of sources) {
    if (!s.ok) continue;
    if (filters.providers && filters.providers.length && !filters.providers.includes(s.id)) continue;
    for (const raw of s.items) {
      const card: Card = { ...raw, match: relevance(query, raw) };
      if (card.match != null && card.match < minMatch) continue;
      const tk = dedupeKey(card);
      if (seenTitle.has(tk) || (card.sourceUrl && seenUrl.has(card.sourceUrl))) continue;
      seenTitle.add(tk);
      if (card.sourceUrl) seenUrl.add(card.sourceUrl);
      items.push(card);
    }
  }

  return {
    items: sortCards(items, opts.sort || 'relevance'),
    filtered: items,
    sources: sources.map(s => ({ id: s.id, ok: s.ok, count: s.count, items: s.items, error: s.error } as SourceResult))
  };
}

/** Kunci dedup: provider diabaikan, judul + jenis dipakai. */
export function dedupeKey(card: Card): string {
  const base = splitSeason(card.title || '').base;
  return (base || card.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 60) + '|' + (card.type || '');
}

export function sortCards(items: Card[], sort: SearchSort): Card[] {
  const arr = items.slice();
  if (sort === 'title') arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  else if (sort === 'provider') arr.sort((a, b) => (a.provider || '').localeCompare(b.provider || ''));
  else
    arr.sort((a, b) => {
      const d = (b.match || 0) - (a.match || 0);
      return d !== 0 ? d : (a.title || '').localeCompare(b.title || '');
    });
  return arr;
}

/** Terapkan saringan jenis/status/musim pada daftar kartu yang sudah dicari. */
export function applyFilters(items: Card[], filters: SearchFilters): Card[] {
  return items.filter(c => {
    if (filters.types && filters.types.length) {
      const t = (c.type || '').toLowerCase();
      if (!filters.types.some(x => t.includes(x.toLowerCase()))) return false;
    }
    if (filters.statuses && filters.statuses.length) {
      const t = (c.status || '').toLowerCase();
      if (!filters.statuses.some(x => t.includes(x.toLowerCase()))) return false;
    }
    if (filters.season != null && filters.season) {
      const ts = splitSeason(c.title || '').season;
      if (ts !== filters.season) return false;
    }
    return true;
  });
}

/** Saran judul berdasarkan judul yang sudah ter-cache (untuk dropdown pencarian). */
export function suggestions(query: string, pool: Card[], limit = 8): string[] {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const scored = pool
    .map(c => ({ title: c.title, s: matchScore(q, c.title) }))
    .filter(x => x.s >= 45)
    .sort((a, b) => b.s - a.s);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of scored) {
    const k = String(x.title || '').toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x.title);
    if (out.length >= limit) break;
  }
  return out;
}

/** Ringkasan jumlah hasil per provider untuk ditampilkan di UI. */
export function sourceSummary(sources: SourceResult[]): { total: number; ok: number; failed: number } {
  return {
    total: sources.reduce((n, s) => n + s.count, 0),
    ok: sources.filter(s => s.ok).length,
    failed: sources.filter(s => !s.ok).length
  };
}

/** Namespace agar pemanggilan terbaca: SearchEngine.search(...). */
export const SearchEngine = {
  search,
  applyFilters,
  sortCards,
  dedupeKey,
  suggestions,
  sourceSummary
};
