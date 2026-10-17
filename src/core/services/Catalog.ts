import { getProvider, allProviders } from '../../providers/registry';
import { legacyResolveServer } from '../../providers/legacy';
import { ProviderAggregator } from './ProviderAggregator';
import { searchAggregated, mergeCards } from './SearchEngine';
import { FallbackEngine } from './FallbackEngine';
import { DownloadAggregator } from './DownloadAggregator';
import { TitleIndex, titleFromKey, type IndexedEntry } from './TitleIndex';
import { CacheManager, TTL } from './CacheManager';
import { buildForcedQualities } from './QualityNormalizer';
import { episodeNumber, mergeEpisodes } from './EpisodeMatcher';
import { groupByQuality } from '../utils/qualitySorter';
import type {
  AggregatedCard,
  AggregatedSearchResult,
  Detail,
  DetailBundle,
  HomeFeed,
  ScheduleGroup,
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
    remember(r.items.slice(0, 12));
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

export const Catalog = {
  /** Beranda lengkap (8 rail) — hasil gabungan seluruh penyedia, sudah kanonik. */
  async home(): Promise<HomeFeed> {
    const { data, stale } = await CacheManager.getOrStale<Omit<HomeFeed, 'stale'>>(
      'feed',
      'home',
      TTL.home,
      async () => {
        const raw = await ProviderAggregator.homeFeed();
        const newUpdate = (await SearchEngineMerge(raw.newUpdate)).slice(0, 24);
        const completed = (await SearchEngineMerge(raw.completed)).slice(0, 24);
        const donghua = (await SearchEngineMerge(raw.donghua)).slice(0, 24);
        const movie = (await SearchEngineMerge(raw.movie)).slice(0, 24);
        if (!newUpdate.length && !completed.length && !donghua.length && !movie.length) {
          throw new Error('empty');
        }
        const weekly = newUpdate
          .slice()
          .sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0))
          .slice(0, 6)
          .map((c, i) => ({ ...c, rank: i + 1 }));
        return { newUpdate, weekly, completed, donghua, movie, sources: raw.sources };
      }
    );
    if (!data) throw new Error(GENERIC_ERROR);
    remember([...data.newUpdate, ...data.completed, ...data.donghua, ...data.movie]);
    return { ...data, stale };
  },

  /** Pencarian lintas penyedia: satu judul = satu kartu, tanpa label penyedia. */
  search(query: string, opts: { sort?: 'relevance' | 'title' | 'rating'; minScore?: number } = {}): Promise<AggregatedSearchResult> {
    const q = String(query || '').trim();
    const sort = opts.sort || 'relevance';
    return CacheManager.get(`search`, q.toLowerCase() + ':' + sort, TTL.search, async () => {
      const r = await searchAggregated(q, { sort });
      remember(r.items.slice(0, 30));
      return r;
    });
  },

  /** Detail anime berdasarkan canonicalId — tahan refresh berkat TitleIndex. */
  detail(id: string, opts: { title?: string } = {}): Promise<DetailBundle> {
    return CacheManager.get('detailBundle', id, TTL.detail, () => buildDetail(id, opts));
  },

  /** Sumber putar satu episode dengan 4 kualitas yang selalu tersedia. */
  stream(id: string, episode: string, opts: { title?: string } = {}): Promise<StreamBundle> {
    return CacheManager.get('streamBundle', id + ':' + episode, TTL.stream, () =>
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
        return r;
      }
    );
    return { groups: data?.groups || [], stale };
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

  /** Jumlah penyedia aktif (untuk statistik internal, tidak ditampilkan). */
  providerCount(): number {
    return allProviders().filter(p => p.active).length;
  }
};

/* ───────────── implementasi internal ───────────── */

function SearchEngineMerge(cards: AggregatedCard[] | import('../types').Card[]): AggregatedCard[] {
  return mergeCards(cards as import('../types').Card[], {});
}

async function collectEpisodes(
  entry: IndexedEntry,
  sources: IndexedEntry['sources'],
  limit = 4
): Promise<{ groups: { provider: string; items: { num: string; id: string; slug: string; date: string; title?: string }[] }[]; details: { provider: string; detail: Detail }[] }> {
  const picked = sources.slice(0, limit);
  const settled = await Promise.allSettled(
    picked.map(async s => {
      const p = getProvider(s.provider);
      if (!p) throw new Error('missing');
      const detail = await withTimeout(
        CacheManager.detail(s.provider, s.id, () => p.detail(s.id, s.slug)),
        12000
      );
      return { provider: s.provider, detail };
    })
  );

  const details: { provider: string; detail: Detail }[] = [];
  settled.forEach(r => {
    if (r.status === 'fulfilled') details.push(r.value);
  });

  const groups = details.map(d => ({
    provider: d.provider,
    items: (d.detail.episodeList || []).map(ep => ({
      num: String(episodeNumber(ep.title || ep.num || '') || ep.num || ''),
      id: ep.id,
      slug: ep.slug,
      date: ep.date || '',
      title: ep.title
    }))
  }));

  /* Simpan pemetaan episode per penyedia agar pemutaran tak perlu fetch ulang. */
  for (const g of groups) {
    await TitleIndex.setEpisodes(entry.id, g.provider, g.items);
  }

  return { groups, details };
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
  const { groups, details } = await collectEpisodes(entry, sources);

  if (!details.length) {
    /* Coba gelombang kedua (sumber prioritas rendah) sebelum menyerah. */
    const rest = sources.slice(4);
    if (rest.length) {
      const second = await collectEpisodes(entry, rest, 4);
      details.push(...second.details);
      groups.push(...second.groups);
    }
  }

  if (!details.length) throw new Error(GENERIC_ERROR);

  const base = details[0].detail;
  const merged = mergeEpisodes(
    groups.map(g => ({ provider: g.provider, items: g.items.map(i => ({ num: i.num, id: i.id, slug: i.slug, date: i.date, title: i.title })) }))
  );

  const recCards = (base.recommendations || []).slice(0, 12);
  const recommendations = recCards.length ? await SearchEngineMerge(recCards) : [];
  if (recommendations.length) remember(recommendations);

  return {
    id: entry.id,
    title: base.title || entry.title,
    alt: base.alt || '',
    poster: base.poster || entry.poster || '',
    score: base.score || entry.score || '',
    type: base.type || entry.type || '',
    status: base.status || entry.status || '',
    year: base.year || '',
    episodes: base.episodes || String(merged.length || ''),
    duration: base.duration || '',
    studio: base.studio || '',
    genres: (base.genres || []).map(g => g.t),
    synopsis: base.synopsis || '',
    sourceCount: sources.length,
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

async function buildStream(id: string, episode: string, opts: { title?: string }): Promise<StreamBundle> {
  let entry = await TitleIndex.get(id);
  if (!entry || !entry.sources.length) {
    /* Detail sekaligus menyembuhkan indeks & mengisi daftar episode per sumber. */
    try {
      await buildDetail(id, opts);
    } catch {
      /* lanjut ke upaya berikutnya */
    }
    entry = await TitleIndex.get(id);
  }
  if (!entry) throw new Error(GENERIC_ERROR);

  const want = episodeNumber(episode);
  const sources = sortSources(entry).filter(s => {
    const p = getProvider(s.provider);
    return p && p.active && !p.downloadOnly;
  });

  const requests = sources
    .map(s => {
      const eps = s.episodes || [];
      const hit = !isNaN(want)
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
  if (requests.length) {
    const r = await FallbackEngine.resolveAll(requests, { timeout: 8000, max: 12 });
    results = r.results;
  }

  if (!results.length && !requests.length) {
    /* Indeks episode belum ada (mis. setelah refresh): bangun ulang lalu coba sekali lagi. */
    try {
      await buildDetail(id, opts);
      entry = await TitleIndex.get(id);
      if (entry) {
        const retry = sortSources(entry)
          .map(s => {
            const eps = s.episodes || [];
            const hit = !isNaN(want)
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
        if (retry.length) {
          const r2 = await FallbackEngine.resolveAll(retry, { timeout: 8000, max: 12 });
          results = r2.results;
        }
      }
    } catch {
      /* tetap gagal → pesan generik di bawah */
    }
  }

  if (!results.length) throw new Error(GENERIC_ERROR);
  if (!entry) throw new Error(GENERIC_ERROR);

  const primary = results[0];
  const primarySource = sortSources(entry).find(s => s.provider === primary.provider);

  /* Unduh: gabungan semua penyedia unduhan (tidak pernah melempar). */
  let downloads: import('../types').DownloadLink[] = [];
  try {
    const dl = await DownloadAggregator.collect({
      title: entry.title,
      episode: String(want || episode),
      preferred: primary.provider,
      animeId: primarySource?.id,
      animeSlug: primarySource?.slug,
      episodeId: requests.find(r => r.provider === primary.provider)?.params.episodeId,
      episodeSlug: requests.find(r => r.provider === primary.provider)?.params.episodeSlug
    });
    downloads = dl.links;
  } catch {
    downloads = [];
  }

  const norm = buildForcedQualities({
    streams: results.map(r => ({ provider: r.provider, stream: r.stream })),
    downloads
  });

  const servers: StreamServerRef[] = norm.servers;
  if (!servers.length && primary.stream.playerUrl) {
    servers.push({
      ref: primary.provider + ':main',
      label: 'Server Utama',
      url: primary.stream.playerUrl,
      providerRef: primary.provider,
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
    downloads: groupByQuality(downloads).map(g => ({ quality: g.quality, items: g.items })),
    synopsis: '',
    sourceCount: results.length
  };
}
