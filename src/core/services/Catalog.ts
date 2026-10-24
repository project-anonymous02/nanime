import { getProvider, allProviders, officialProviders } from '../../providers/registry';
import { legacyResolveServer, otakudesuGenre } from '../../providers/legacy';
import { ProviderAggregator } from './ProviderAggregator';
import { searchAggregated, mergeCardsAsync } from './SearchEngine';
import { FallbackEngine } from './FallbackEngine';
import { TitleIndex, titleFromKey, titleKey, type IndexedEntry } from './TitleIndex';
import { CacheManager, TTL } from './CacheManager';
import { buildForcedQualities } from './QualityNormalizer';
import { episodeKey, episodeNumber, mergeEpisodes } from './EpisodeMatcher';
import { resolveMediaUrl, type ResolvedMedia } from './StreamExtractor';
import { filterDiscovery, isAdultContent } from './ContentPolicy';
import { matchScore } from '../utils/fuzzyMatch';
import { splitSeason } from '../utils/titleAliases';
import type {
  AggregatedCard,
  AggregatedSearchResult,
  Card,
  Detail,
  DetailBundle,
  DownloadGroup,
  DownloadLink,
  EpisodeItem,
  HomeFeed,
  ListResult,
  ScheduleGroup,
  ScheduleItem,
  StreamBundle,
  StreamServerRef
} from '../types';

/**
 * Catalog — fasad data tunggal untuk seluruh halaman.
 *
 * Prinsip kerja:
 *  • Identitas kanonik: satu judul = satu `canonicalId`, dipakai di semua route.
 *  • Penyembuhan otomatis: bila indeks sumber hilang (mis. setelah pembersihan),
 *    judul di-rekonstruksi dari canonicalId lalu dicari ulang ke semua penyedia —
 *    pengguna tidak pernah melihat "judul tidak ditemukan".
 *  • Fallback diam-diam: kegagalan satu penyedia tidak pernah tampil ke UI.
 *  • Satu pesan galat untuk semua kegagalan total (lihat GENERIC_ERROR).
 */

/** Satu-satunya pesan galat yang boleh sampai ke pengguna. */
export const GENERIC_ERROR = 'Gagal memuat data, silakan periksa koneksi internet dan coba lagi nanti.';
const policyValidatedDetails = new Set<string>();

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      v => {
        clearTimeout(t);
        resolve(v);
      },
      e => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function priorityOf(provider: string): number {
  const p = getProvider(provider);
  return p ? p.priority : 999;
}

export function validArtwork(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw || !/^https?:\/\//i.test(raw) || /^(data:|javascript:)/i.test(raw)) return '';
  try {
    const u = new URL(raw);
    return /^https?:$/.test(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}

export function pickArtwork(...values: unknown[]): string {
  return values.map(validArtwork).find(Boolean) || '';
}

/** Keep search artwork when detail omits it; prefer detail banner artwork for the hero. */
export function selectDetailArtwork(
  indexedPoster: string | undefined,
  details: Array<{ poster?: string; cover?: string; banner?: string; image?: string; thumbnail?: string }>
): { poster: string; heroImage: string } {
  const poster = pickArtwork(indexedPoster, ...details.flatMap(d => [d.poster, d.cover, d.image, d.thumbnail, d.banner]));
  const heroImage = pickArtwork(...details.flatMap(d => [d.banner, d.cover, d.image, d.poster, d.thumbnail]), indexedPoster);
  return { poster, heroImage };
}

/** Simpan kartu ke indeks judul agar route /detail/:id selalu bisa dibuka. */
function remember(cards: AggregatedCard[]): void {
  for (const c of cards) {
    void TitleIndex.upsert({
      id: c.canonicalId,
      title: c.title,
      poster: c.poster,
      score: c.score,
      type: c.type,
      status: c.status,
      sources: c.sources
    });
  }
}

/** Rekonstruksi entri dari canonicalId: temukan kembali judul & seluruh sumbernya. */
async function healEntry(id: string, titleHint?: string): Promise<IndexedEntry | null> {
  const title = (titleHint && titleHint.trim()) || titleFromKey(id);
  if (title.length < 2) return null;
  try {
    const r = await searchAggregated(title, { minScore: 0 });
    const exact = r.items.find(i => i.canonicalId === id);
    const best = exact || r.items[0];
    if (!best) return null;
    // The selected result must be indexed before detail loading continues.
    // `remember` is intentionally fire-and-forget for background feed items,
    // but doing that here can race the immediate TitleIndex.get below.
    await TitleIndex.upsert({
      id: best.canonicalId,
      title: best.title,
      poster: best.poster,
      score: best.score,
      type: best.type,
      status: best.status,
      sources: best.sources
    });
    remember(r.items.slice(0, 12).filter(item => item.canonicalId !== best.canonicalId));
    return await TitleIndex.get(best.canonicalId);
  } catch {
    return null;
  }
}

/** Urutkan sumber sesuai prioritas penyedia (paling utama lebih dulu). */
function sortSources(entry: IndexedEntry): IndexedEntry['sources'] {
  return entry.sources
    .slice()
    .sort((a, b) => priorityOf(a.provider) - priorityOf(b.provider));
}

function sanitizeDiscoveryFeed(feed: Omit<HomeFeed, 'stale'>): Omit<HomeFeed, 'stale'> {
  const newUpdate = filterDiscovery(feed.newUpdate);
  const completed = filterDiscovery(feed.completed);
  const movie = filterDiscovery(feed.movie);
  const weekly = newUpdate
    .slice()
    .sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0))
    .slice(0, 6)
    .map((card, index) => ({ ...card, rank: index + 1 }));
  return { ...feed, newUpdate, completed, movie, weekly };
}

function sanitizeSearchResult(result: AggregatedSearchResult, includeAdult = false): AggregatedSearchResult {
  if (includeAdult) return result;
  const items = filterDiscovery(result.items || []);
  const sources = (result.sources || []).map(source => {
    const safe = filterDiscovery(source.items || [], source.id);
    return { ...source, items: safe, count: safe.length };
  });
  return { ...result, items, sources };
}

export const Catalog = {
  /**
   * Beranda lengkap (8 rail) — hasil gabungan seluruh penyedia, sudah kanonik.
   * Stale-while-revalidate: salinan lama langsung dikembalikan agar UI tampil
   * seketika; hasil segar menyusul lewat `onFresh` (tanpa memutus scroll).
   * `fresh: true` memaksa muat ulang penuh (dipakai tarik-untuk-menyegarkan).
   */
  async home(
    opts: { onFresh?: (feed: HomeFeed) => void; fresh?: boolean; signal?: AbortSignal } = {}
  ): Promise<HomeFeed> {
    if (opts.fresh) CacheManager.invalidate('feed', 'home');
    let updateTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingRaw: Awaited<ReturnType<typeof ProviderAggregator.homeFeed>> | null = null;
    let processingUpdate = false;
    const transform = async (raw: Awaited<ReturnType<typeof ProviderAggregator.homeFeed>>): Promise<Omit<HomeFeed, 'stale'>> => {
      const newUpdate = filterDiscovery((await SearchEngineMerge(raw.newUpdate))).slice(0, 24);
      const completed = filterDiscovery((await SearchEngineMerge(raw.completed))).slice(0, 24);
      const movie = filterDiscovery((await SearchEngineMerge(raw.movie))).slice(0, 24);
      if (!newUpdate.length && !completed.length && !movie.length) {
        throw new Error('empty');
      }
      const weekly = newUpdate
        .slice()
        .sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0))
        .slice(0, 6)
        .map((c, i) => ({ ...c, rank: i + 1 }));
      return { newUpdate, weekly, completed, movie, sources: raw.sources };
    };
    const publishUpdate = async (raw: Awaited<ReturnType<typeof ProviderAggregator.homeFeed>>) => {
      try {
        const d = await transform(raw);
        if (opts.signal?.aborted) return;
        remember([...d.newUpdate, ...d.completed, ...d.movie]);
        opts.onFresh?.({ ...d, stale: false });
      } catch {
        /* snapshot kosong sementara sumber lain masih memuat */
      }
    };
    const scheduleUpdate = () => {
      if (opts.signal?.aborted || processingUpdate || updateTimer || !pendingRaw) return;
      updateTimer = setTimeout(() => {
        updateTimer = null;
        if (opts.signal?.aborted) {
          pendingRaw = null;
          return;
        }
        const latest = pendingRaw;
        pendingRaw = null;
        if (!latest) return;
        processingUpdate = true;
        void publishUpdate(latest).finally(() => {
          processingUpdate = false;
          if (pendingRaw) scheduleUpdate();
        });
      }, 800);
    };
    const onAbort = () => {
      if (updateTimer) clearTimeout(updateTimer);
      updateTimer = null;
      pendingRaw = null;
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    const build = async (): Promise<Omit<HomeFeed, 'stale'>> =>
      ProviderAggregator.homeFeed({
        // The outer feed cache owns freshness. Reusing each provider's 24-hour
        // cache here would make SWR and pull-to-refresh return the same data.
        fresh: true,
        onUpdate: raw => {
          if (!opts.onFresh || opts.signal?.aborted) return;
          if (!raw.newUpdate.length && !raw.completed.length && !raw.movie.length) return;
          pendingRaw = raw;
          scheduleUpdate();
        }
      }).then(transform);
    const onFresh = opts.onFresh
      ? (d: Omit<HomeFeed, 'stale'>) => {
          if (opts.signal?.aborted) return;
          const safe = sanitizeDiscoveryFeed(d);
          remember([...safe.newUpdate, ...safe.completed, ...safe.movie]);
          opts.onFresh!({ ...safe, stale: false });
        }
      : undefined;
    const { data, stale } = await CacheManager.getSWR<Omit<HomeFeed, 'stale'>>(
      'feed',
      'home',
      TTL.home,
      build,
      onFresh
    );
    if (!data) throw new Error(GENERIC_ERROR);
    const safe = sanitizeDiscoveryFeed(data);
    remember([...safe.newUpdate, ...safe.completed, ...safe.movie]);
    return { ...safe, stale };
  },

  /** Pencarian lintas penyedia: satu judul = satu kartu, tanpa label penyedia. */
  search(query: string, opts: { sort?: 'relevance' | 'title' | 'rating'; minScore?: number; providerIds?: string[]; includeAdult?: boolean; signal?: AbortSignal; onUpdate?: (result: AggregatedSearchResult) => void } = {}): Promise<AggregatedSearchResult> {
    const q = String(query || '').trim();
    const sort = opts.sort || 'relevance';
    const includeAdult = !!opts.includeAdult;
    const providerIds = opts.providerIds?.length ? [...new Set(opts.providerIds)].sort() : [];
    const providerKey = (providerIds.length ? providerIds.join(',') : 'default') + (includeAdult ? '+adult' : '');
    const queryKey = q.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/\s+/g, ' ');
    if (opts.onUpdate) {
      return searchAggregated(q, {
        sort,
        minScore: opts.minScore,
        providerIds: providerIds.length ? providerIds : undefined,
        includeAdult,
        signal: opts.signal,
        onUpdate: result => opts.onUpdate?.(sanitizeSearchResult(result, includeAdult))
      }).then(result => {
        const safe = sanitizeSearchResult(result, includeAdult);
        remember(safe.items.slice(0, 30));
        return safe;
      });
    }
    const minScoreKey = opts.minScore == null ? 'default' : String(opts.minScore);
    return CacheManager.get(`search`, queryKey + ':' + sort + ':min=' + minScoreKey + ':providers=' + providerKey, TTL.search, async () =>
      sanitizeSearchResult(await searchAggregated(q, { sort, minScore: opts.minScore, providerIds: providerIds.length ? providerIds : undefined, includeAdult }), includeAdult)
    ).then(result => {
      // Filter old IndexedDB and memory cache entries before they can reach a view.
      const safe = sanitizeSearchResult(result, includeAdult);
      remember(safe.items.slice(0, 30));
      return safe;
    });
  },

  /** Detail anime berdasarkan canonicalId — tahan refresh berkat TitleIndex. */
  async detail(id: string, opts: { title?: string } = {}): Promise<DetailBundle> {
    // Remove older entries that may have been cached before policy checks ran
    // inside the cache boundary.
    CacheManager.invalidate('detailBundle', id);
    CacheManager.invalidate('detailBundleV2', id);
    CacheManager.invalidate('detailBundleV3', id);
    const validate = async (candidate: DetailBundle): Promise<IndexedEntry | null> => {
      const indexed = await TitleIndex.get(id);
      if (!indexed?.sources.length) return null;
      const providers = [...new Set([...(candidate.providers || []), ...indexed.sources.map(source => source.provider)])]
        .map(provider => getProvider(provider)).filter(Boolean);
      const unclassifiedMixedProvider = providers.some(provider => provider?.content === 'mixed') && !candidate.genres.length;
      if (unclassifiedMixedProvider || isAdultContent({ title: candidate.title, alt: candidate.alt, genres: candidate.genres })) {
        throw new Error('Konten ini dibatasi oleh kebijakan katalog Nanime.');
      }
      policyValidatedDetails.add(id);
      return indexed;
    };

    let bundle = await CacheManager.get('detailBundleV4', id, TTL.detail, async () => {
      const built = await buildDetail(id, opts);
      if (!await validate(built)) throw new Error(GENERIC_ERROR);
      return built;
    });
    let entry = await TitleIndex.get(id);
    // Detail bundles and TitleIndex are persisted separately. A cached detail
    // can survive while its provider/source index is missing, which makes the
    // page render but causes the first Nonton action to fail immediately.
    if (!entry?.sources.length) {
      bundle = await buildDetail(id, opts);
    }
    entry = await validate(bundle);
    if (!entry?.sources.length) throw new Error(GENERIC_ERROR);
    return bundle;
  },

  /** Sumber putar satu episode dengan 4 kualitas yang selalu tersedia. */
  stream(id: string, episode: string, opts: { title?: string; episodeProvider?: string; episodeId?: string; episodeSlug?: string } = {}): Promise<StreamBundle> {
    const episodeKey = [episode, opts.episodeProvider || '', opts.episodeId || '', opts.episodeSlug || ''].join(':');
    return CacheManager.get('streamBundleV4', id + ':' + episodeKey, TTL.stream, () =>
      buildStream(id, episode, opts)
    );
  },

  /** Jadwal rilis gabungan (urut jam per hari), dengan fallback salinan lama. */
  async schedule(): Promise<{ groups: ScheduleGroup[]; stale: boolean }> {
    const { data, stale } = await CacheManager.getOrStale<{ groups: ScheduleGroup[]; ok: number }>(
      'sched',
      'all',
      TTL.schedule,
      async () => {
        const r = await ProviderAggregator.schedule();
        if (!r.groups.length) throw new Error('empty');
        await hydrateSchedulePosters(r.groups);
        return r;
      }
    );
    const groups = (data?.groups || []).map(group => ({ ...group, items: filterDiscovery(group.items) })).filter(group => group.items.length);
    return { groups, stale };
  },

  /** Resolusi server embed alternatif → URL yang bisa diputar iframe. */
  async resolveServerUrl(providerRef: string, serverId: string): Promise<string> {
    if (/^https?:\/\//i.test(serverId)) return serverId;
    try {
      const p = getProvider(providerRef);
      if (p && p.resolveServer) return await p.resolveServer(serverId);
      return await legacyResolveServer(serverId);
    } catch {
      return '';
    }
  },

  /**
   * Ubah URL sumber mana pun menjadi media siap-putar untuk pemutar kustom:
   * file langsung (mp4/m3u8) atau — bila hanya tersedia halaman embed —
   * hasil scraping URL filenya. Bila tetap gagal, URL asli dipertahankan
   * sebagai `embed` (iframe) jalan terakhir.
   */
  resolvePlayable(url: string): Promise<ResolvedMedia> {
    return resolveMediaUrl(url);
  },

  /** Daftar anime satu genre (halaman genre khusus, dengan paginasi). */
  async genre(genreUrl: string, page = 1): Promise<ListResult & { stale: boolean }> {
    const id = String(genreUrl || '').trim().toLowerCase();
    if (!id) throw new Error(GENERIC_ERROR);
    const { data, stale } = await CacheManager.getOrStale<ListResult>('genre', id + ':' + page, TTL.genre, async () => {
      let result: ListResult | null = null;
      try {
        result = await otakudesuGenre(id, page);
      } catch {
        result = null;
      }
      if (!result?.list.length) {
        const fallback = getProvider('samehadaku');
        if (fallback?.genre) {
          try {
            result = await fallback.genre(id, page);
          } catch {
            result = result || null;
          }
        }
      }
      return { list: filterDiscovery(result?.list || []), pagination: result?.pagination || null };
    });
    if (!data) throw new Error(GENERIC_ERROR);
    const merged = await SearchEngineMerge(filterDiscovery(data.list));
    remember(merged);
    return { ...data, list: merged, stale };
  },

  /** Jumlah penyedia aktif (untuk statistik internal, tidak ditampilkan). */
  providerCount(): number {
    return allProviders().filter(p => p.active).length;
  },

  /** Penyedia dewasa yang hanya boleh ikut pencarian setelah dipilih pengguna. */
  adultSearchProviders(): string[] {
    return allProviders().filter(p => p.active && p.searchable && p.content === 'hentai').map(p => p.id);
  }
};

/* ───────────── implementasi internal ───────────── */

function SearchEngineMerge(cards: AggregatedCard[] | import('../types').Card[]): Promise<AggregatedCard[]> {
  return mergeCardsAsync(cards as import('../types').Card[], {});
}

type EpisodeGroup = { provider: string; items: EpisodeItem[] };

function episodeGroup(provider: string, detail: Detail): EpisodeGroup {
  return {
    provider,
    items: (detail.episodeList || []).map(ep => ({
      num: String(episodeNumber(ep.title || ep.num || '') || ep.num || ''),
      id: ep.id,
      slug: ep.slug,
      date: ep.date || '',
      title: ep.title
    }))
  };
}

function mergedLength(groups: EpisodeGroup[]): number {
  return mergeEpisodes(
    groups.map(g => ({
      provider: g.provider,
      items: g.items.map(i => ({ num: i.num, id: i.id, slug: i.slug, date: i.date, title: i.title }))
    }))
  ).length;
}

function hasSynopsis(detail: Detail): boolean {
  const value = String(detail.synopsis || '').trim();
  return !!value && !/^sinopsis tidak tersedia\.?$/i.test(value);
}

function contentKind(title: string, type = ''): string {
  const value = `${type} ${title}`.toLowerCase();
  if (/movie|film|gekijouban|the movie/.test(value)) return 'movie';
  if (/ova/.test(value)) return 'ova';
  if (/special/.test(value)) return 'special';
  return 'series';
}

function yearOf(value: string | undefined): string {
  return (String(value || '').match(/(?:19|20)\d{2}/) || [''])[0];
}

/** Pilih kartu fallback yang benar-benar merujuk judul & musim yang sama. */
function pickFallbackCard(cards: Card[], entry: IndexedEntry): Card | null {
  const targetKind = contentKind(entry.title, entry.type);
  const targetSeason = splitSeason(entry.title).season;
  const targetYear = yearOf(entry.year);
  let best: Card | null = null;
  let bestScore = 0;
  for (const card of cards) {
    if (!card?.title) continue;
    if (splitSeason(card.title).season !== targetSeason) continue;
    const cardYear = yearOf(card.year);
    if (targetYear && cardYear && targetYear !== cardYear) continue;
    const score = matchScore(entry.title, card.title);
    /* Judul yang praktis identik boleh berbeda label tipe antar-situs;
       judul mirip tetapi beda jenis (mis. seri vs movie) tetap ditolak. */
    if (score < 96 && contentKind(card.title, card.type) !== targetKind) continue;
    if (score >= 88 && score > bestScore) {
      best = card;
      bestScore = score;
    }
  }
  return best;
}

async function fetchSourceDetail(
  source: IndexedEntry['sources'][number]
): Promise<{ provider: string; detail: Detail } | null> {
  const p = getProvider(source.provider);
  if (!p) return null;
  try {
    const detail = await withTimeout(CacheManager.detail(source.provider, source.id, () => p.detail(source.id, source.slug)), 12000);
    return { provider: p.id, detail };
  } catch {
    return null;
  }
}

/** Cari sumber cadangan hanya saat dibutuhkan, lalu daftarkan ke indeks. */
async function lookupFallback(
  entry: IndexedEntry,
  providerId: string
): Promise<{ provider: string; detail: Detail; source: IndexedEntry['sources'][number] } | null> {
  const existing = entry.sources.find(source => source.provider === providerId);
  if (existing) {
    const fetched = await fetchSourceDetail(existing);
    if (fetched) return { ...fetched, source: existing };
  }
  const p = getProvider(providerId);
  if (!p?.search) return null;
  const title = entry.title || titleFromKey(entry.id);
  if (!title) return null;
  try {
    const cards = await withTimeout(CacheManager.search(p.id, title, () => p.search(title)), 12000);
    const card = pickFallbackCard(cards, entry);
    if (!card) return null;
    const detail = await withTimeout(
      CacheManager.detail(p.id, card.id, () => p.detail(card.id, card.slug || card.id)),
      12000
    );
    await TitleIndex.upsert({
      id: entry.id,
      title: entry.title,
      poster: entry.poster,
      score: entry.score,
      type: entry.type,
      status: entry.status,
      year: entry.year,
      sources: [{ provider: p.id, id: card.id, slug: card.slug || card.id }]
    });
    const refreshed = await TitleIndex.get(entry.id);
    if (refreshed) entry.sources = refreshed.sources;
    return {
      provider: p.id,
      detail,
      source: { provider: p.id, id: card.id, slug: card.slug || card.id, updatedAt: Date.now() }
    };
  } catch {
    return null;
  }
}

/** Episode yang belum ada di sumber utama; klaim jumlah episode menjadi batas. */
function missingEpisodes(base: Detail, extra: Detail): EpisodeItem[] {
  const claimed = episodeNumber(base.episodes || '');
  const baseKeys = new Set(base.episodeList.map(episodeKey));
  const baseNums = new Set(
    base.episodeList
      .map(ep => episodeNumber(ep.title || ep.num))
      .filter(num => !isNaN(num))
  );
  return extra.episodeList.filter(ep => {
    if (baseKeys.has(episodeKey(ep))) return false;
    const num = episodeNumber(ep.title || ep.num);
    if (!isNaN(num)) {
      if (baseNums.has(num)) return false;
      if (!isNaN(claimed) && claimed > 0 && num > claimed) return false;
      return true;
    }
    return base.episodeList.length === 0;
  });
}

/** Isi hanya field yang kosong; data lengkap dari sumber utama tidak ditimpa. */
function fillMissing(base: Detail, extra: Detail): Detail {
  return {
    ...base,
    alt: base.alt || extra.alt,
    poster: validArtwork(base.poster) ? base.poster : extra.poster,
    score: base.score || extra.score,
    type: base.type || extra.type,
    status: base.status || extra.status,
    year: base.year || extra.year,
    episodes: base.episodes || extra.episodes,
    duration: base.duration || extra.duration,
    studio: base.studio || extra.studio,
    genres: base.genres?.length ? base.genres : extra.genres,
    synopsis: hasSynopsis(base) ? base.synopsis : hasSynopsis(extra) ? extra.synopsis : base.synopsis,
    recommendations: base.recommendations?.length ? base.recommendations : extra.recommendations
  };
}

function hasGaps(detail: Detail, groups: EpisodeGroup[], indexedPoster?: string): boolean {
  if (!hasSynopsis(detail)) return true;
  if (!detail.genres?.length) return true;
  if (!validArtwork(detail.poster) && !validArtwork(indexedPoster)) return true;
  const claimed = episodeNumber(detail.episodes || '');
  if (!isNaN(claimed) && claimed > 0 && mergedLength(groups) < claimed) return true;
  if (!detail.episodeList.length && !detail.episodes && contentKind(detail.title, detail.type) !== 'movie') return true;
  return false;
}

/**
 * Lengkapi poster jadwal: endpoint jadwal sebagian penyedia hanya memuat judul,
 * jadi poster diambil dari halaman detail (berbatch, tanpa memperlambat render).
 */
async function hydrateSchedulePosters(groups: ScheduleGroup[], limit = 60): Promise<void> {
  const missing: ScheduleItem[] = [];
  for (const g of groups) for (const it of g.items) if (!it.poster) missing.push(it);
  const queue = missing.slice(0, limit);
  if (!queue.length) return;

  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const it = queue[cursor++];
      try {
        const p = getProvider(it.provider);
        if (!p) continue;
        const d = await withTimeout(CacheManager.detail(p.id, it.id, () => p.detail(it.id, it.slug)), 10000);
        if (d?.poster) {
          it.poster = d.poster;
          void TitleIndex.upsert({
            id: titleKey(d.title || it.title),
            title: d.title || it.title,
            poster: d.poster,
            score: d.score,
            type: d.type,
            status: d.status,
            sources: [{ provider: it.provider, id: it.id, slug: it.slug || it.id }]
          });
        }
      } catch {
        /* poster dibiarkan kosong — SmartImage menampilkan placeholder */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker));
}

async function buildDetail(id: string, opts: { title?: string }): Promise<DetailBundle> {
  let entry = await TitleIndex.get(id);
  if (!entry || !entry.sources.length) {
    entry = await healEntry(id, opts.title);
  }
  if (!entry && opts.title) {
    entry = await healEntry(id, opts.title);
  }
  if (!entry || !entry.sources.length) {
    throw new Error(GENERIC_ERROR);
  }

  const sources = sortSources(entry);
  const order = officialProviders().map(p => p.id);

  /* Sumber utama: sumber berprioritas tertinggi yang benar-benar merespons.
     Tidak ada pengambilan massal lintas penyedia. */
  let primary: { provider: string; detail: Detail } | null = null;
  for (const source of sources) {
    const found = await fetchSourceDetail(source);
    if (found) {
      primary = found;
      break;
    }
  }
  if (!primary) {
    for (const providerId of order) {
      const found = await lookupFallback(entry, providerId);
      if (found) {
        primary = { provider: found.provider, detail: found.detail };
        break;
      }
    }
  }
  if (!primary) throw new Error(GENERIC_ERROR);

  let base = primary.detail;
  const details: Detail[] = [base];
  const providers = [primary.provider];
  const groups: EpisodeGroup[] = [];
  const primaryGroup = episodeGroup(primary.provider, base);
  if (primaryGroup.items.length) {
    groups.push(primaryGroup);
    await TitleIndex.setEpisodes(entry.id, primary.provider, primaryGroup.items);
  }

  /* Fallback lazy: panggil penyedia berikutnya hanya bila ada bagian yang
     benar-benar kosong (sinopsis/genre/poster/episode). Provider berprioritas
     lebih tinggi tetap dicoba lebih dulu bila sumber utama bukan Otakudesu. */
  const start = order.indexOf(primary.provider);
  const chain = [
    ...(start > 0 ? order.slice(0, start) : []),
    ...(start >= 0 ? order.slice(start + 1) : order)
  ].filter(id => !providers.includes(id));
  for (const providerId of chain) {
    if (!hasGaps(base, groups, entry.poster)) break;
    const found = await lookupFallback(entry, providerId);
    if (!found) continue;
    const missing = missingEpisodes(base, found.detail);
    if (missing.length) {
      groups.push({ provider: found.provider, items: missing });
      await TitleIndex.setEpisodes(entry.id, found.provider, missing);
    }
    base = fillMissing(base, found.detail);
    details.push(found.detail);
    providers.push(found.provider);
  }

  // A provider may return a non-empty placeholder or a relative/broken URL.
  // Keep the indexed search artwork and choose the first validated artwork
  // across all fetched sources instead of letting one bad detail overwrite it.
  const artwork = selectDetailArtwork(entry.poster, details.map(d => d as Detail & { cover?: string; banner?: string; image?: string; thumbnail?: string }));
  const merged = mergeEpisodes(
    groups.map(g => ({ provider: g.provider, items: g.items.map(i => ({ num: i.num, id: i.id, slug: i.slug, date: i.date, title: i.title })) }))
  );

  const recCards = filterDiscovery(base.recommendations || []).slice(0, 12);
  const recommendations = recCards.length ? await SearchEngineMerge(recCards) : [];
  if (recommendations.length) remember(recommendations);

  return {
    id: entry.id,
    providers,
    title: base.title || entry.title,
    alt: base.alt || '',
    ...artwork,
    score: base.score || entry.score || '',
    type: base.type || entry.type || '',
    status: base.status || entry.status || '',
    year: base.year || '',
    episodes: base.episodes || String(merged.length || ''),
    duration: base.duration || '',
    studio: base.studio || '',
    genres: (base.genres || []).map(g => g.t),
    synopsis: base.synopsis || '',
    sourceCount: providers.length,
    episodeList: merged.map(m => ({
      num: String(episodeNumber(m.title || m.num) || m.num || ''),
      id: m.id,
      slug: m.slug,
      date: m.date || '',
      title: m.title,
      sources: m.sources
    })),
    recommendations
  };
}

/** Gabungkan tautan unduhan yang benar-benar disediakan halaman episode. */
function groupDownloadLinks(links: DownloadLink[]): DownloadGroup[] {
  const groups = new Map<string, DownloadLink[]>();
  const seen = new Set<string>();
  for (const link of links) {
    const url = String(link.url || '').trim();
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    const quality = String(link.quality || '').trim() || 'Lainnya';
    const items = groups.get(quality) || [];
    items.push({ ...link, url, availability: link.availability || 'unverified' });
    groups.set(quality, items);
  }
  return Array.from(groups, ([quality, items]) => ({ quality, items }));
}

function groupDownloads(streams: import('../types').EpisodeStream[]): DownloadGroup[] {
  return groupDownloadLinks(streams.flatMap(stream => stream.downloads || []));
}

async function buildStream(id: string, episode: string, opts: { title?: string; episodeProvider?: string; episodeId?: string; episodeSlug?: string }): Promise<StreamBundle> {
  let entry = await TitleIndex.get(id);
  if (!entry || !entry.sources.length) {
    // Detail heals a missing index and applies the same content policy before
    // the stream resolver can use any provider source.
    await Catalog.detail(id, { title: opts.title });
    entry = await TitleIndex.get(id);
  }
  if (!entry) throw new Error(GENERIC_ERROR);
  if (entry.sources.some(source => getProvider(source.provider)?.content === 'hentai')) {
    throw new Error('Konten ini dibatasi oleh kebijakan katalog Nanime.');
  }
  if (entry.sources.some(source => getProvider(source.provider)?.content === 'mixed') && !policyValidatedDetails.has(id)) {
    // Mixed catalog entries require the provider's detail classification
    // before a direct playback request can resolve any source.
    await Catalog.detail(id, { title: opts.title });
    entry = await TitleIndex.get(id);
    if (!entry) throw new Error(GENERIC_ERROR);
  }
  if (isAdultContent({ title: entry.title })) throw new Error('Konten ini dibatasi oleh kebijakan katalog Nanime.');

  const want = episodeNumber(episode);
  const orderedSources = (current: IndexedEntry) => sortSources(current).filter(s => {
    const p = getProvider(s.provider);
    return p && p.active && !p.downloadOnly;
  }).sort((a, b) => {
    const ap = getProvider(a.provider)?.priority ?? 999;
    const bp = getProvider(b.provider)?.priority ?? 999;
    return ap - bp || Number(b.provider === opts.episodeProvider) - Number(a.provider === opts.episodeProvider);
  });

  const makeRequests = (list: ReturnType<typeof orderedSources>) => list
    .map(s => {
      const eps = s.episodes || [];
      const targeted = !!opts.episodeProvider && s.provider === opts.episodeProvider && (opts.episodeId || opts.episodeSlug);
      const hit = targeted
        ? eps.find(e => (opts.episodeId && e.id === opts.episodeId) || (opts.episodeSlug && e.slug === opts.episodeSlug))
        : !isNaN(want)
          ? eps.find(e => Number(e.num) === want) || eps.find(e => episodeNumber(e.title || '') === want)
          : eps.find(e => e.id === episode || e.slug === episode);
      if (!hit) return null;
      return {
        provider: s.provider,
        params: {
          animeId: s.id,
          animeSlug: s.slug,
          episodeId: hit.id,
          episodeSlug: hit.slug,
          episode: String(want || episode)
        }
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  let results: { provider: string; stream: import('../types').EpisodeStream; ms: number }[] = [];
  const attempted = new Set<string>();

  /* Resolusi bertahap: sumber utama dulu; sumber cadangan hanya dipanggil
     bila sumber utama gagal atau kualitas 360p belum tersedia. */
  const resolveLazily = async (list: ReturnType<typeof makeRequests>) => {
    for (const request of list) {
      const key = `${request.provider}:${request.params.episodeId}`;
      if (attempted.has(key)) continue;
      attempted.add(key);
      const r = await FallbackEngine.resolveAll([request], { timeout: 8000, max: 1 });
      const hit = r.results[0];
      if (!hit) continue;
      results.push(hit);
      const labels = buildForcedQualities({
        streams: results.map(item => ({ provider: item.provider, stream: item.stream })),
        downloads: []
      }).qualities.map(quality => quality.label);
      if (labels.includes('360p')) break;
    }
  };

  await resolveLazily(makeRequests(orderedSources(entry)));

  if (!results.length) {
    /* Indeks episode belum ada atau sumber utama gagal: lengkapi detail lalu
       coba sekali lagi dengan sumber yang benar-benar memiliki episode itu. */
    try {
      await buildDetail(id, opts);
      entry = await TitleIndex.get(id);
      if (entry) await resolveLazily(makeRequests(orderedSources(entry)));
    } catch {
      /* tetap gagal → pesan generik di bawah */
    }
  }

  if (!entry) throw new Error(GENERIC_ERROR);

  // Stream readiness does not wait for unrelated, sequential download-host
  // discovery across providers.

  // Download pages and file hosts are never converted into playback sources.
  const streams = results;
  let downloads = groupDownloads(streams.map(stream => stream.stream));
  if (!downloads.length) {
    for (const source of orderedSources(entry)) {
      const provider = getProvider(source.provider);
      if (!provider?.downloads) continue;
      const episodes = source.episodes || [];
      const hit = !isNaN(want)
        ? episodes.find(item => Number(item.num) === want) || episodes.find(item => episodeNumber(item.title || '') === want)
        : episodes.find(item => item.id === episode || item.slug === episode);
      if (!hit) continue;
      try {
        const links = await CacheManager.downloads(provider.id, `${provider.id}:${hit.id}`, () =>
          provider.downloads!({
            animeId: source.id,
            animeSlug: source.slug,
            episodeId: hit.id,
            episodeSlug: hit.slug,
            episode: String(want || episode)
          })
        );
        if (links.length) {
          downloads = groupDownloadLinks(links);
          break;
        }
      } catch {
        /* provider unduhan berikutnya */
      }
    }
  }
  const sourceKind = streams.some(entry => entry.stream.sourceKind === 'direct-media')
    ? 'direct-media'
    : streams.some(entry => entry.stream.sourceKind === 'embed-page')
      ? 'embed-page'
      : undefined;

  const norm = buildForcedQualities({
    streams: streams.map(r => ({ provider: r.provider, stream: r.stream })),
    downloads: downloads.flatMap(group => group.items)
  });

  const servers: StreamServerRef[] = norm.servers;
  if (streams.length && !servers.length && streams[0].stream.playerUrl) {
    servers.push({
      ref: streams[0].provider + ':main',
      label: 'Server Utama',
      url: streams[0].stream.playerUrl,
      providerRef: streams[0].provider,
      isDefault: true
    });
  }

  return {
    id: entry.id,
    title: entry.title,
    poster: entry.poster || '',
    episode: String(want || episode),
    episodeTitle: undefined,
    qualities: norm.qualities,
    defaultQuality: norm.defaultQuality,
    servers,
    downloads,
    synopsis: '',
    sourceCount: streams.length,
    availability: sourceKind === 'direct-media' ? 'direct-media' : sourceKind === 'embed-page' ? 'external-embed' : 'unavailable',
    sourceKind,
    unavailableReason: streams.length ? undefined : 'Sumber stream tidak ditemukan.'
  };
}
