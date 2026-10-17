import type {
  AggregatedCard,
  AggregatedSearchResult,
  Card,
  SearchResult,
  SourceRef,
  SourceResult
} from '../types';
import { ProviderAggregator } from './ProviderAggregator';
import { matchScore, similarity } from '../utils/fuzzyMatch';
import { aliasKey, aliasesOf, splitSeason } from '../utils/titleAliases';
import { titleKey } from './TitleIndex';
import { allProviders } from '../../providers/registry';

export interface SearchFilters {
  providers?: string[];
  types?: string[];
  statuses?: string[];
  season?: number | null;
  minMatch?: number;
}

export type SearchSort = 'relevance' | 'title' | 'provider' | 'rating';

/* Prioritas penyedia (angka kecil = lebih utama). Dipakai memilih wakil grup. */
const PRIORITY: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  allProviders().forEach(p => {
    map[p.id] = p.priority;
  });
  return map;
})();

/** Normalisasi penuh untuk perbandingan (angka & penanda musim DIPERTAHANKAN). */
function fullNorm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Apakah judul menyebut musim secara eksplisit (Season 2 / S2 / Part 2 / 2nd Season). */
function hasSeasonMarker(title: string): boolean {
  return /(season\s*\d|\d(?:st|nd|rd|th)\s*season|part\s*\d|\bs\d+\b)/i.test(String(title || ''));
}

/**
 * Skor kecocokan 0–1000 terhadap query:
 *   • dasar kemiripan judul 0–600 (fuzzy + token + alias)
 *   • exact match +500 · alias match +400
 *   • tersedia di ≥3 penyedia +150 · ongoing +80 · indikasi 1080p/BD +50
 *   • HANYA ada di penyedia paling lambat (prioritas terakhir) −200
 */
export function scoreCard(
  query: string,
  card: Card,
  ctx: { providerCount?: number; lowestOnly?: boolean } = {}
): number {
  const q = String(query || '').trim();
  let score = 0;
  if (q) {
    score = matchScore(q, card.title || '') * 6;
    if (fullNorm(q) === fullNorm(card.title || '')) score += 500;
    else if (aliasKey(q) && aliasesOf(card.title || '').some(a => aliasKey(a) === aliasKey(q))) score += 400;
  }
  if ((ctx.providerCount || 1) >= 3) score += 150;
  if (/ongoing|airing|sedang tayang|on going/i.test(card.status || '')) score += 80;
  if (/1080|blu-?ray|\bbd\b|full\s?hd/i.test((card.sub || '') + ' ' + (card.type || ''))) score += 50;
  if (ctx.lowestOnly) score -= 200;
  return Math.max(0, Math.min(1000, Math.round(score)));
}

interface Group {
  canonical: string;
  title: string;
  base: string;
  season: number;
  marked: boolean;
  card: Card;
  priority: number;
  match: number;
  sources: Map<string, SourceRef>;
}

function toSourceRef(card: Card): SourceRef {
  return {
    provider: card.provider,
    id: card.id,
    slug: card.slug || card.id,
    sourceUrl: card.sourceUrl
  };
}

/** Aturan penggabungan dua kartu menjadi satu anime kanonik. */
function canMerge(g: Group, card: Card): boolean {
  const canonical = titleKey(card.title || '');
  if (canonical && canonical === g.canonical) return true;

  const marked = hasSeasonMarker(card.title || '');
  /* Musim eksplisit tidak boleh tercampur musim lain / tanpa musim. */
  if (marked !== g.marked) return false;
  if (marked && g.marked) {
    const s = splitSeason(card.title || '').season;
    if (s !== g.season) return false;
  }

  const base = splitSeason(card.title || '').base || card.title || '';
  const aKey = aliasKey(g.base);
  const bKey = aliasKey(base);
  if (aKey && bKey && aKey === bKey) return true;

  return similarity(fullNorm(g.title), fullNorm(card.title || '')) >= 0.85;
}

/**
 * Gabungkan kartu-kartu dari berbagai penyedia menjadi daftar kanonik:
 * satu judul = satu kartu (dengan seluruh sumber di dalamnya).
 */
export function mergeCards(cards: Card[], opts: { query?: string } = {}): AggregatedCard[] {
  const query = opts.query || '';
  const groups: Group[] = [];

  for (const card of cards) {
    if (!card || !card.title) continue;
    const base = splitSeason(card.title).base || card.title;
    let group = groups.find(g => canMerge(g, card));
    if (!group) {
      group = {
        canonical: titleKey(card.title),
        title: card.title,
        base,
        season: splitSeason(card.title).season,
        marked: hasSeasonMarker(card.title),
        card,
        priority: PRIORITY[card.provider] ?? 999,
        match: matchScore(query, card.title),
        sources: new Map()
      };
      groups.push(group);
    }
    const ref = toSourceRef(card);
    if (!group.sources.has(card.provider)) group.sources.set(card.provider, ref);

    /* Wakil grup: penyedia paling utama; seri → judul paling cocok dengan query. */
    const prio = PRIORITY[card.provider] ?? 999;
    const match = matchScore(query, card.title);
    if (prio < group.priority || (prio === group.priority && match > group.match)) {
      group.card = card;
      group.priority = prio;
      group.match = match;
      group.title = card.title;
      group.base = base;
    }
    group.match = Math.max(group.match, match);
  }

  return groups
    .map(g => {
      const providerCount = g.sources.size;
      const lowestOnly = providerCount === 1 && (PRIORITY[g.card.provider] ?? 0) >= 999;
      const score1000 = scoreCard(query, g.card, { providerCount, lowestOnly });
      const sources = Array.from(g.sources.values()).sort(
        (a, b) => (PRIORITY[a.provider] ?? 999) - (PRIORITY[b.provider] ?? 999)
      );
      const out: AggregatedCard = {
        ...g.card,
        canonicalId: g.canonical || titleKey(g.title),
        sources,
        providerCount,
        score1000,
        match: Math.round(score1000 / 10)
      };
      return out;
    })
    .sort((a, b) => b.score1000 - a.score1000 || a.title.localeCompare(b.title));
}

/** Pencarian gabungan lintas penyedia — hasil sudah kanonik (satu judul satu kartu). */
export async function searchAggregated(
  query: string,
  opts: { sort?: SearchSort; minScore?: number; timeout?: number } = {}
): Promise<AggregatedSearchResult> {
  const q = String(query || '').trim();
  if (q.length < 2) return { items: [], sources: [] };

  const sources = await ProviderAggregator.search(q, { timeout: opts.timeout });
  const flat: Card[] = [];
  for (const s of sources) {
    if (!s.ok) continue;
    for (const c of s.items) flat.push(c);
  }

  let items = mergeCards(flat, { query: q });
  const minScore = opts.minScore != null ? opts.minScore : 220;
  items = items.filter(i => i.score1000 >= minScore);

  const sort = opts.sort || 'relevance';
  if (sort === 'title') items.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === 'rating') items.sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));
  else if (sort === 'provider') items.sort((a, b) => b.providerCount - a.providerCount);

  return { items, sources };
}

/* ════════════════════ Ekspor lama (kompatibilitas) ════════════════════ */

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

export async function search(
  query: string,
  opts: { filters?: SearchFilters; sort?: SearchSort; minMatch?: number } = {}
): Promise<SearchResult & { filtered: Card[] }> {
  const sources = await ProviderAggregator.search(query);
  const filters = opts.filters || {};
  const minMatch = opts.minMatch != null ? opts.minMatch : filters.minMatch != null ? filters.minMatch : 0;

  const items: Card[] = [];
  const seen = new Set<string>();

  for (const s of sources) {
    if (!s.ok) continue;
    if (filters.providers && filters.providers.length && !filters.providers.includes(s.id)) continue;
    for (const raw of s.items) {
      const card: Card = { ...raw, match: relevance(query, raw) };
      if (card.match != null && card.match < minMatch) continue;
      const tk = dedupeKey(card);
      if (seen.has(tk)) continue;
      seen.add(tk);
      items.push(card);
    }
  }

  return {
    items: sortCards(items, opts.sort || 'relevance'),
    filtered: items,
    sources: sources.map(s => ({ id: s.id, ok: s.ok, count: s.count, items: s.items, error: s.error } as SourceResult))
  };
}

/** Kunci dedup: penyedia diabaikan; judul dasar + jenis dipakai. */
export function dedupeKey(card: Card): string {
  const base = splitSeason(card.title || '').base;
  return (base || card.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 60) + '|' + (card.type || '');
}

export function sortCards(items: Card[], sort: SearchSort): Card[] {
  const arr = items.slice();
  if (sort === 'title') arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  else if (sort === 'rating') arr.sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));
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

/** Ringkasan jumlah hasil per penyedia (untuk log internal, tidak ditampilkan). */
export function sourceSummary(sources: SourceResult[]): { total: number; ok: number; failed: number } {
  return {
    total: sources.reduce((n, s) => n + s.count, 0),
    ok: sources.filter(s => s.ok).length,
    failed: sources.filter(s => !s.ok).length
  };
}

/** Namespace agar pemanggilan terbaca: SearchEngine.searchAggregated(...). */
export const SearchEngine = {
  search,
  searchAggregated,
  mergeCards,
  scoreCard,
  applyFilters,
  sortCards,
  dedupeKey,
  suggestions,
  sourceSummary
};
