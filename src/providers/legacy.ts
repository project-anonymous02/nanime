import { apiGet, ApiError } from '../core/client';
import type { ScrapeTask } from '../core/scraper';
import { normalizeCard } from '../core/normalize';
import { cleanVal } from '../core/utils';
import type { Card, Detail, DownloadLink, EpisodeItem, EpisodeStream, ListResult } from '../core/types';
import type { AnimeProvider } from './types';

/**
 * Adapter utama Otakudesu. Parser HTML lama (src/core/scraper.ts) dipertahankan
 * dan hanya dibungkus kontrak AnimeProvider + normalisasi tipe domain.
 */

const TTL = { home: 600000, search: 300000, detail: 1800000, episode: 360000, genre: 3600000, schedule: 900000 };

const task = (action: ScrapeTask['action'], extra: Partial<ScrapeTask> = {}): ScrapeTask => ({
  provider: 'otakudesu',
  action,
  ...extra
});

export function toDownloads(formatList: any): DownloadLink[] {
  const out: DownloadLink[] = [];
  const pushGroup = (quality: string, list: any) => {
    if (!Array.isArray(list)) return;
    list.forEach((q: any) => {
      const urls = Array.isArray(q?.urlList) ? q.urlList : [];
      const itemLabel = cleanVal(q?.title);
      const qualityLabel = /\d{3,4}p/i.test(itemLabel) ? itemLabel : cleanVal(quality) || itemLabel || 'Unknown';
      urls.forEach((u: any) => {
        const url = cleanVal(u?.url);
        if (!/^https?:\/\//i.test(url)) return;
        out.push({ quality: qualityLabel, name: cleanVal(u?.title) || itemLabel || 'Link', url });
      });
    });
  };
  if (Array.isArray(formatList)) formatList.forEach((f: any) => pushGroup(f?.title, f?.qualityList));
  return out;
}

function mapHome(r: any): { ongoing: Card[]; completed: Card[]; movie: Card[] } {
  const ongoing = (r?.data?.ongoing?.animeList || []).map((i: any) => normalizeCard(i, 'otakudesu')).filter(Boolean);
  const completed = (r?.data?.completed?.animeList || []).map((i: any) => normalizeCard(i, 'otakudesu')).filter(Boolean);
  return { ongoing, completed, movie: [] };
}

function legacyDetail(id: string, data: any): Detail {
  const epsRaw = cleanVal(data.episodes);
  const epList: EpisodeItem[] = (data.episodeList || []).map((i: any) => ({
    num: cleanVal(i.num) || cleanVal(i.title),
    id: i.episodeId,
    slug: '',
    date: cleanVal(i.date)
  }));
  return {
    id,
    slug: '',
    provider: 'otakudesu',
    title: cleanVal(data.title) || 'Unknown',
    alt: cleanVal(data.japanese),
    poster: data.poster || '',
    score: cleanVal(data.score),
    type: cleanVal(data.type),
    status: cleanVal(data.status),
    year: cleanVal(data.aired),
    episodes: /^\d+$/.test(epsRaw) ? epsRaw : epList.length ? String(epList.length) : '',
    duration: cleanVal(data.duration),
    studio: cleanVal(data.studios),
    genres: (data.genreList || []).map((i: any) => ({ t: cleanVal(i.title), id: i.genreId || '' })).filter((g: any) => g.t),
    synopsis: (data.synopsis?.paragraphList || []).join('\n\n') || 'Sinopsis tidak tersedia.',
    downloads: [],
    batchId: cleanVal(data.batch?.batchId) || '',
    episodeList: epList,
    recommendations: (data.recommendedAnimeList || []).map((i: any) => normalizeCard(i, 'otakudesu')).filter(Boolean)
  };
}

function legacyStream(
  params: { episodeId: string; episodeSlug?: string; episode?: string; animeId?: string; animeSlug?: string },
  details: any
): EpisodeStream {
  const downloads = toDownloads(details.download?.qualityList);
  const info = details.info || {};
  const qualities = (details.server?.qualityList || []).map((q: any) => ({
    title: String(q.title || '').trim(),
    servers: (q.serverList || []).map((s: any) => ({ name: String(s.title || '').trim(), id: s.serverId, def: !!s.default }))
  }));
  const allServers: { name: string; id: string; quality: string; def: boolean }[] = [];
  qualities.forEach((q: any) => q.servers.forEach((s: any) => allServers.push({ ...s, quality: q.title })));
  return {
    provider: 'otakudesu',
    title: details.title || 'Episode ' + (params.episode || ''),
    playerUrl: details.defaultStreamingUrl || '',
    qualities,
    servers: allServers,
    downloads,
    info
  };
}

async function legacyList(action: 'ongoing' | 'completed', page: number): Promise<ListResult> {
  try {
    const r = await apiGet(task(action, { page }), 20000, `${action}:otakudesu:${page}`, TTL.home);
    return {
      list: (r?.data?.animeList || []).map((i: any) => normalizeCard(i, 'otakudesu')).filter(Boolean),
      pagination: r?.pagination || null
    };
  } catch (e) {
    console.warn(`${action} otakudesu gagal`, e);
    return { list: [], pagination: null };
  }
}

async function legacyDetailFetch(id: string, slug = ''): Promise<Detail> {
  const r = await apiGet(task('detail', { id, slug }), 20000, 'detail:otakudesu:' + id, TTL.detail);
  const data = r?.data?.details;
  if (!data) throw new ApiError('Detail anime tidak ditemukan.', 404);
  return legacyDetail(id, data);
}

export const otakudesu: AnimeProvider = {
  id: 'otakudesu',
  name: 'Otakudesu',
  active: true,
  searchable: true,
  content: 'anime',
  priority: 10,
  desc: 'Provider utama. Home, search, detail, episode, server, genre, jadwal.',
  async home() {
    const r = await apiGet(task('home'), 20000, 'home:otakudesu', TTL.home);
    const res = mapHome(r);
    if (!res.ongoing.length && !res.completed.length) throw new ApiError('Halaman tidak berisi daftar anime.');
    return res;
  },
  async search(query: string) {
    const r = await apiGet(task('search', { query }), 20000, 'search:otakudesu:' + query, TTL.search);
    return (r?.data?.animeList || []).map((i: any) => normalizeCard(i, 'otakudesu')).filter(Boolean);
  },
  detail: (id: string, slug?: string) => legacyDetailFetch(id, slug),
  async episodes(id: string, slug?: string) {
    return (await this.detail(id, slug)).episodeList;
  },
  async stream(params) {
    const r = await apiGet(
      task('episode', {
        id: params.episodeId,
        slug: params.episodeSlug,
        animeId: params.animeId,
        animeSlug: params.animeSlug,
        episodeId: params.episodeId
      }),
      20000,
      'episode:otakudesu:' + params.episodeId,
      TTL.episode
    );
    const details = r?.data?.details;
    if (!details) throw new ApiError('Data episode tidak ditemukan.', 404);
    return legacyStream(params, details);
  },
  async resolveServer(serverId: string) {
    if (/^https?:\/\//i.test(serverId)) return serverId;
    const r = await apiGet(task('server', { id: serverId }), 20000, 'server:' + serverId, TTL.episode);
    return r?.data?.details?.url || '';
  },
  async downloads(params) {
    const episodeId = params.episodeId;
    if (!episodeId) return [];
    const r = await apiGet(
      task('episode', {
        id: episodeId,
        slug: params.episodeSlug,
        animeId: params.animeId,
        animeSlug: params.animeSlug,
        episodeId
      }),
      20000,
      'episode:otakudesu:' + episodeId,
      TTL.episode
    );
    return toDownloads(r?.data?.details?.download?.qualityList);
  },
  ongoing: (page = 1) => legacyList('ongoing', page),
  completed: (page = 1) => legacyList('completed', page),
  async genres() {
    try {
      const r = await apiGet(task('genres'), 20000, 'genres', TTL.genre);
      return r?.data?.genreList || [];
    } catch {
      return [];
    }
  },
  async schedule() {
    const r = await apiGet(task('schedule'), 25000, 'sched:otakudesu', TTL.schedule);
    return (r?.data?.scheduleList || []).map((day: any) => ({
      day: String(day?.title || ''),
      items: (day?.animeList || []).map((a: any) => ({
        time: '',
        title: cleanVal(a?.title),
        id: String(a?.animeId || ''),
        provider: 'otakudesu'
      }))
    }));
  }
} as AnimeProvider;

/** Batch Otakudesu (unduhan) — dipanggil lapisan API. */
export async function otakudesuBatchDownloads(batchId: string): Promise<DownloadLink[]> {
  const r = await apiGet(task('batch', { id: batchId }), 20000, 'batch:' + batchId, TTL.detail);
  return toDownloads(r?.data?.details?.download?.formatList);
}

/** Genre listing Otakudesu (satu-satunya provider dengan paginasi genre). */
export async function otakudesuGenre(genreId: string, page: number): Promise<{ list: Card[]; pagination: any }> {
  const r = await apiGet(task('genre', { id: genreId, page }), 20000, `genre:${genreId}:${page}`, TTL.genre);
  return {
    list: (r?.data?.animeList || []).map((i: any) => normalizeCard(i, 'otakudesu')).filter(Boolean),
    pagination: r?.pagination || null
  };
}

/** Resolve server Otakudesu (token ajax). */
export async function legacyResolveServer(serverId: string): Promise<string> {
  if (/^https?:\/\//i.test(serverId)) return serverId;
  return otakudesu.resolveServer!(serverId);
}
