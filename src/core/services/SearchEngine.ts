import type {
  AggregatedCard,
  AggregatedSearchResult,
  Card,
  SearchResult,
  SourceRef,
  SourceResult
} from '../types';
import { ProviderAggregator } from './ProviderAggregator';
import { levenshtein, matchScore, normalizeTitle } from '../utils/fuzzyMatch';
import { aliasKey, aliasesOf, splitSeason } from '../utils/titleAliases';
import { titleKey } from './TitleIndex';
import { allProviders, getProvider } from '../../providers/registry';

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
  return String(s || '').normalize('NFKD').replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
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
  similarityKey: string;
  alias: string;
  kind: string;
  year: string;
  titleKeys: Set<string>;
  aliases: Set<string>;
  externalIds: Record<string, string>;
}

function toSourceRef(card: Card): SourceRef {
  return {
    provider: card.provider,
    id: card.id,
    slug: card.slug || card.id,
    sourceUrl: card.sourceUrl
  };
}

function bigrams(value: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < value.length - 1; i++) out.push(value.slice(i, i + 2));
  return out;
}

interface PreparedCard {
  card: Card;
  canonical: string;
  base: string;
  season: number;
  marked: boolean;
  alias: string;
  similarityKey: string;
  match: number;
  kind: string;
  year: string;
  titleKeys: string[];
  aliases: string[];
  externalIds: Record<string, string>;
}

function contentKind(card: Card): string {
  const value = `${card.type || ''} ${card.sub || ''} ${card.title || ''}`.toLowerCase();
  if (/movie|film|gekijouban|the movie|ova|special/.test(value)) {
    if (/ova/.test(value)) return 'ova';
    if (/special/.test(value)) return 'special';
    return 'movie';
  }
  return 'series';
}

/** Aturan penggabungan dua judul; kandidat sudah dipersempit lewat indeks. */
function canMerge(g: Group, card: PreparedCard): boolean {
  const sameProvider = g.sources.get(card.card.provider);
  // A provider's stable item ID is authoritative within that provider. Title
  // similarity must never collapse two separately identified catalog entries.
  if (sameProvider && sameProvider.id !== card.card.id) return false;
  if (card.kind !== g.kind) return false;
  let sharedOfficialId = false;
  for (const [namespace, id] of Object.entries(card.externalIds)) {
    const other = g.externalIds[namespace];
    if (other && other !== id) return false;
    if (other === id) sharedOfficialId = true;
  }
  if (sharedOfficialId) return true;
  if (g.year && card.year && g.year !== card.year) return false;
  if (card.canonical && card.canonical === g.canonical) return true;

  /* Musim eksplisit tidak boleh tercampur musim lain / tanpa musim. */
  if (card.marked !== g.marked) return false;
  if (card.marked && g.marked && card.season !== g.season) return false;

  if (card.aliases.some(alias => g.aliases.has(alias)) || card.titleKeys.some(key => g.titleKeys.has(key))) return true;
  if (g.alias && card.alias && g.aliases.has(card.alias)) return true;

  const a = g.similarityKey;
  const b = card.similarityKey;
  if (!a || !b) return false;
  const maxLength = Math.max(a.length, b.length);
  const allowedDistance = Math.floor(maxLength * 0.15);
  if (Math.abs(a.length - b.length) > allowedDistance) return false;
  return 1 - levenshtein(a, b) / maxLength >= 0.85;
}

/**
 * Gabungkan kartu-kartu dari berbagai penyedia menjadi daftar kanonik:
 * satu judul = satu kartu (dengan seluruh sumber di dalamnya).
 */
interface MergeContext {
  add(card: Card | null | undefined): void;
  finish(): AggregatedCard[];
}

function createMergeContext(query: string): MergeContext {
  const groups: Group[] = [];
  const canonicalIndex = new Map<string, number>();
  const aliasIndex = new Map<string, number[]>();
  const exactTitleIndex = new Map<string, number[]>();
  const bigramIndex = new Map<string, number[]>();
  const shortTitleIndex = new Map<string, number[]>();
  const indexList = (index: Map<string, number[]>, key: string, groupIndex: number) => {
    if (!key) return;
    const list = index.get(key) || [];
    if (!list.includes(groupIndex)) list.push(groupIndex);
    index.set(key, list);
  };

  const indexGroup = (group: Group, index: number) => {
    if (group.canonical && !canonicalIndex.has(group.canonical)) canonicalIndex.set(group.canonical, index);
    group.aliases.forEach(alias => {
      indexList(aliasIndex, alias, index);
    });
    group.titleKeys.forEach(key => {
      indexList(exactTitleIndex, key, index);
    });
    if (group.similarityKey.length < 3) {
      indexList(shortTitleIndex, group.similarityKey, index);
    } else {
      for (const gram of new Set(bigrams(group.similarityKey))) {
        indexList(bigramIndex, gram, index);
      }
    }
  };

  const add = (card: Card | null | undefined) => {
    if (!card || !card.title) return;
    const split = splitSeason(card.title);
    const titles = [card.title, ...(card.altTitles || [])].map(value => String(value || '').trim()).filter(Boolean);
    const prepared: PreparedCard = {
      card,
      canonical: titleKey(card.title),
      base: split.base || card.title,
      season: split.season,
      marked: hasSeasonMarker(card.title),
      alias: aliasKey(split.base || card.title),
      similarityKey: normalizeTitle(fullNorm(card.title)),
      match: query ? matchScore(query, card.title) : 0,
      kind: contentKind(card),
      year: String(card.year || '').match(/(?:19|20)\d{2}/)?.[0] || String(card.sub || '').match(/(?:19|20)\d{2}/)?.[0] || '',
      titleKeys: [...new Set(titles.map(fullNorm).filter(Boolean))],
      aliases: [...new Set(titles.map(title => aliasKey(splitSeason(title).base || title)).filter(Boolean))],
      externalIds: card.externalIds || {}
    };

    // A title only needs comparison with exact, alias, or fuzzy-neighbour
    // candidates. This avoids testing every existing group for every card.
    const candidates = new Set<number>();
    const exact = canonicalIndex.get(prepared.canonical);
    if (exact != null) candidates.add(exact);
    for (const alias of prepared.aliases) for (const index of aliasIndex.get(alias) || []) candidates.add(index);
    for (const key of prepared.titleKeys) for (const index of exactTitleIndex.get(key) || []) candidates.add(index);
    if (prepared.similarityKey.length < 3) {
      for (const index of shortTitleIndex.get(prepared.similarityKey) || []) candidates.add(index);
    } else {
      for (const gram of new Set(bigrams(prepared.similarityKey))) {
        for (const index of bigramIndex.get(gram) || []) candidates.add(index);
      }
    }

    let group: Group | undefined;
    let groupIndex = -1;
    const orderedCandidates = Array.from(candidates).sort((a, b) => a - b);
    for (const index of orderedCandidates) {
      if (canMerge(groups[index], prepared)) {
        group = groups[index];
        groupIndex = index;
        break;
      }
    }
    if (!group) {
      group = {
        canonical: prepared.canonical,
        title: card.title,
        base: prepared.base,
        season: prepared.season,
        marked: prepared.marked,
        card,
        priority: PRIORITY[card.provider] ?? 999,
        match: prepared.match,
        sources: new Map(),
        similarityKey: prepared.similarityKey,
        alias: prepared.alias,
        kind: prepared.kind,
        year: prepared.year,
        titleKeys: new Set(prepared.titleKeys),
        aliases: new Set(prepared.aliases),
        externalIds: { ...prepared.externalIds }
      };
      groups.push(group);
      groupIndex = groups.length - 1;
      indexGroup(group, groupIndex);
    }
    prepared.titleKeys.forEach(key => group!.titleKeys.add(key));
    prepared.aliases.forEach(alias => group!.aliases.add(alias));
    Object.entries(prepared.externalIds).forEach(([namespace, value]) => { if (!group!.externalIds[namespace]) group!.externalIds[namespace] = value; });
    if (!group.year && prepared.year) group.year = prepared.year;
    indexGroup(group, groupIndex);
    const ref = toSourceRef(card);
    if (!group.sources.has(card.provider)) group.sources.set(card.provider, ref);

    /* Wakil grup: penyedia paling utama; seri → judul paling cocok dengan query. */
    const prio = PRIORITY[card.provider] ?? 999;
    const match = prepared.match;
    if (prio < group.priority || (prio === group.priority && match > group.match)) {
      group.card = card;
      group.priority = prio;
      group.match = match;
      group.title = card.title;
      group.base = prepared.base;
      group.similarityKey = prepared.similarityKey;
      group.alias = prepared.alias;
      indexGroup(group, groupIndex);
    }
    group.match = Math.max(group.match, match);
  };

  const finish = () => groups
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

  return { add, finish };
}

export function mergeCards(cards: Card[], opts: { query?: string } = {}): AggregatedCard[] {
  const context = createMergeContext(opts.query || '');
  for (const card of cards) context.add(card);
  return context.finish();
}

/**
 * Main-thread friendly variant for UI flows. It preserves the same grouping
 * algorithm while yielding between small batches so scroll/tap/navigation
 * events can be handled during large catalogs.
 */
export async function mergeCardsAsync(cards: Card[], opts: { query?: string } = {}): Promise<AggregatedCard[]> {
  const context = createMergeContext(opts.query || '');
  for (let i = 0; i < cards.length; i++) {
    if (i > 0 && i % 12 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    context.add(cards[i]);
  }
  return context.finish();
}

/** Pencarian gabungan lintas penyedia — hasil sudah kanonik (satu judul satu kartu). */
export async function searchAggregated(
  query: string,
  opts: { sort?: SearchSort; minScore?: number; timeout?: number; providerIds?: string[]; includeAdult?: boolean; signal?: AbortSignal; onUpdate?: (result: AggregatedSearchResult) => void } = {}
): Promise<AggregatedSearchResult> {
  const q = String(query || '').trim();
  if (q.length < 2) return { items: [], sources: [] };
  const minScore = opts.minScore != null ? opts.minScore : 220;
  const sort = opts.sort || 'relevance';
  const buildResult = async (sources: SourceResult[]): Promise<AggregatedSearchResult> => {
    // Separate sources are never merged into the main catalog: adult results
    // keep their own identity and only appear after explicit opt-in.
    const normal: Card[] = [];
    const adult: Card[] = [];
    for (const source of sources) {
      if (!source.ok) continue;
      if (getProvider(source.id)?.content === 'hentai') adult.push(...source.items);
      else normal.push(...source.items);
    }
    const normalItems = (await mergeCardsAsync(normal, { query: q })).filter(item => item.score1000 >= minScore);
    const adultItems = adult.length
      ? (await mergeCardsAsync(adult, { query: q })).filter(item => item.score1000 >= minScore)
      : [];
    let items = [...normalItems, ...adultItems];
    if (sort === 'title') items.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'rating') items.sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));
    else if (sort === 'provider') items.sort((a, b) => b.providerCount - a.providerCount);
    return { items, sources };
  };
  let updateSequence = 0;
  const sources = await ProviderAggregator.search(q, {
    timeout: opts.timeout,
    providerIds: opts.providerIds,
    includeAdult: opts.includeAdult,
    signal: opts.signal,
    onUpdate: partial => {
      if (!opts.onUpdate) return;
      const sequence = ++updateSequence;
      void buildResult(partial).then(result => {
        if (sequence === updateSequence) opts.onUpdate?.(result);
      });
    }
  });
  updateSequence++;
  return buildResult(sources);
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
