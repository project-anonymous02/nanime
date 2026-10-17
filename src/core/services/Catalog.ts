import { getProvider, allProviders } from '../../providers/registry';
import { legacyResolveServer } from '../../providers/legacy';
import { ProviderAggregator } from './ProviderAggregator';
import { searchAggregated, mergeCards } from './SearchEngine';
import { FallbackEngine } from './FallbackEngine';
import { DownloadAggregator } from './DownloadAggregator';
import { TitleIndex, titleFromKey, titleKey, type IndexedEntry } from './TitleIndex';
import { CacheManager, TTL } from './CacheManager';
import { buildForcedQualities } from './QualityNormalizer';
import { episodeNumber, mergeEpisodes } from './EpisodeMatcher';
import { resolveMediaUrl, type ResolvedMedia } from './StreamExtractor';
import { groupByQuality } from '../utils/qualitySorter';
import { isVideoUrl } from '../utils';
import type {
  AggregatedCard,
  AggregatedSearchResult,
  Detail,
  DetailBundle,
  HomeFeed,
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
  /**
   * Beranda lengkap (8 rail) — hasil gabungan seluruh penyedia, sudah kanonik.
   * Stale-while-revalidate: salinan lama langsung dikembalikan agar UI tampil
   * seketika; hasil segar menyusul lewat `onFresh` (tanpa memutus scroll).
   * `fresh: true` memaksa muat ulang penuh (dipakai tarik-untuk-menyegarkan).
   */
  async home(
    opts: { onFresh?: (feed: HomeFeed) => void; fresh?: boolean } = {}
  ): Promise<HomeFeed> {
    if (opts.fresh) CacheManager.invalidate('feed', 'home');
    let updateRevision = 0;
    let updateTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingRaw: Awaited<ReturnType<typeof ProviderAggregator.homeFeed>> | null = null;
    const transform = async (raw: Awaited<ReturnType<typeof ProviderAggregator.homeFeed>>): Promise<Omit<HomeFeed, 'stale'>> => {
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
    };
    const build = async (): Promise<Omit<HomeFeed, 'stale'>> =>
      ProviderAggregator.homeFeed({
        onUpdate: raw => {
          if (!opts.onFresh) return;
          if (!raw.newUpdate.length && !raw.completed.length && !raw.donghua.length && !raw.movie.length) return;
          // Sumber sering selesai berdekatan. Debounce penggabungan katalog
          // agar satu batch respons hanya menghasilkan satu kerja CPU berat.
          pendingRaw = raw;
          if (updateTimer) clearTimeout(updateTimer);
          updateTimer = setTimeout(() => {
            updateTimer = null;
            const latest = pendingRaw;
            pendingRaw = null;
            if (!latest) return;
            const revision = ++updateRevision;
            void transform(latest).then(d => {
              if (revision !== updateRevision) return;
              remember([...d.newUpdate, ...d.completed, ...d.donghua, ...d.movie]);
              opts.onFresh!({ ...d, stale: false });
            }).catch(() => {
              /* snapshot kosong sementara sumber lain masih memuat */
            });
          }, 400);
        }
      }).then(transform);
    const onFresh = opts.onFresh
      ? (d: Omit<HomeFeed, 'stale'>) => {
          remember([...d.newUpdate, ...d.completed, ...d.donghua, ...d.movie]);
          opts.onFresh!({ ...d, stale: false });
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
        await hydrateSchedulePosters(r.groups);
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

  /**
   * Ubah URL sumber mana pun menjadi media siap-putar untuk pemutar kustom:
   * file langsung (mp4/m3u8) atau — bila hanya tersedia halaman embed —
   * hasil scraping URL filenya. Bila tetap gagal, URL asli dipertahankan
   * sebagai `embed` (iframe) jalan terakhir.
   */
  resolvePlayable(url: string): Promise<ResolvedMedia> {
    return resolveMediaUrl(url);
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

/** Jumlah episode unik hasil penggabungan beberapa kelompok sumber. */
function mergedLength(groups: { provider: string; items: { num: string; id: string; slug: string; date: string; title?: string }[] }[]): number {
  return mergeEpisodes(
    groups.map(g => ({
      provider: g.provider,
      items: g.items.map(i => ({ num: i.num, id: i.id, slug: i.slug, date: i.date, title: i.title }))
    }))
  ).length;
}

/** Perkiraan jumlah episode sebenarnya (klaim detail atau jumlah sumber terbanyak). */
function expectedEpisodeCount(base: Detail | undefined, sources: IndexedEntry['sources']): number {
  const claimed = base ? episodeNumber(base.episodes || '') : NaN;
  if (!isNaN(claimed) && claimed > 0) return claimed;
  const known = sources.reduce((n, s) => Math.max(n, (s.episodes || []).length), 0);
  return known;
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
  const { groups, details } = await collectEpisodes(entry, sources);
  let fetched = Math.min(4, sources.length);

  if (!details.length && sources.length > 4) {
    /* Coba gelombang kedua (sumber prioritas rendah) sebelum menyerah. */
    const second = await collectEpisodes(entry, sources.slice(4, 8), 4);
    fetched = Math.min(8, sources.length);
    details.push(...second.details);
    groups.push(...second.groups);
  }

  /* Provider lain belum tentu punya episode yang sama — tarik sumber
     berikutnya juga bila daftar hasil masih jauh lebih pendek dari jumlah
     episode yang diklaim (mis. provider A hanya punya 1–12, provider B 1–24). */
  const expected = expectedEpisodeCount(details[0]?.detail, sources);
  while (details.length && expected > 0 && mergedLength(groups) < expected && fetched < sources.length) {
    const next = await collectEpisodes(entry, sources.slice(fetched, fetched + 4), 4);
    fetched += 4;
    if (!next.details.length) break;
    details.push(...next.details);
    groups.push(...next.groups);
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

  if (!entry) throw new Error(GENERIC_ERROR);

  const primaryProvider = results[0]?.provider || requests[0]?.provider || sources[0]?.provider || '';
  const primarySource = sortSources(entry).find(s => s.provider === primaryProvider);

  /* Unduh: gabungan semua penyedia unduhan (tidak pernah melempar). */
  let downloads: import('../types').DownloadLink[] = [];
  try {
    const dl = await DownloadAggregator.collect({
      title: entry.title,
      episode: String(want || episode),
      preferred: primaryProvider,
      animeId: primarySource?.id,
      animeSlug: primarySource?.slug,
      episodeId: requests.find(r => r.provider === primaryProvider)?.params.episodeId,
      episodeSlug: requests.find(r => r.provider === primaryProvider)?.params.episodeSlug
    });
    downloads = dl.links;
  } catch {
    downloads = [];
  }

  /* Jalur terakhir bila semua API stream gagal: pakai tautan unduhan yang
     tersedia (file langsung lebih dulu, lalu halaman unduhan sebagai embed).
     Sumber dipilih dari data, bukan hardcoding. */
  let fallbackStreams: { provider: string; stream: import('../types').EpisodeStream }[] = [];
  if (!results.length) {
    const direct = downloads.find(d => isVideoUrl(d.url));
    const pageLink = downloads.find(d => /^https?:\/\//i.test(d.url));
    const url = (direct || pageLink)?.url || '';
    if (url) {
      fallbackStreams = [
        {
          provider: primaryProvider || 'download',
          stream: {
            provider: primaryProvider || 'download',
            title: 'Episode ' + (want || episode),
            playerUrl: url,
            qualities: [],
            servers: [],
            downloads,
            info: {}
          }
        }
      ];
    }
  }

  const streams = results.length ? results : fallbackStreams;
  if (!streams.length) throw new Error(GENERIC_ERROR);

  const norm = buildForcedQualities({
    streams: streams.map(r => ({ provider: r.provider, stream: r.stream })),
    downloads
  });

  const servers: StreamServerRef[] = norm.servers;
  if (!servers.length && streams[0].stream.playerUrl) {
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
    downloads: groupByQuality(downloads).map(g => ({ quality: g.quality, items: g.items })),
    synopsis: '',
    sourceCount: streams.length
  };
}
