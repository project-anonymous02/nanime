import { apiGet, ApiError } from '../core/client';
import { scrapeRequest, type ScrapeTask } from '../core/scraper';
import {
  normalizeCard,
  normalizeKusonimeCard,
  parseKusonimeDownloads
} from '../core/normalize';
import { cleanVal } from '../core/utils';
import type { Card, Detail, DownloadLink, EpisodeItem, EpisodeStream, ListResult } from '../core/types';
import type { AnimeProvider } from './types';

/**
 * Adapter provider legacy: Otakudesu, Oploverz, Kuramanime, Kusonime.
 * Parser HTML lama (src/core/scraper.ts) dipertahankan apa adanya — sudah teruji —
 * dan hanya dibungkus kontrak AnimeProvider + normalisasi tipe domain.
 */

const ROOT: Record<string, string> = {
  otakudesu: 'https://otakudesu.blog',
  oploverz: 'https://oploverz.am',
  kuramanime: 'https://kuramanime.ing',
  kusonime: 'https://kusonime.com'
};

const TTL = { home: 600000, search: 300000, detail: 1800000, episode: 360000, genre: 3600000, schedule: 900000 };

const task = (provider: string, action: ScrapeTask['action'], extra: Partial<ScrapeTask> = {}): ScrapeTask => ({
  provider: provider as ScrapeTask['provider'],
  action,
  ...extra
});

export function toDownloads(formatList: any): DownloadLink[] {
  const out: DownloadLink[] = [];
  const pushGroup = (quality: string, list: any) => {
    if (!Array.isArray(list)) return;
    list.forEach((q: any) => {
      const urls = Array.isArray(q?.urlList) ? q.urlList : [];
      urls.forEach((u: any) => {
        const url = cleanVal(u?.url);
        if (!/^https?:\/\//i.test(url)) return;
        out.push({ quality: cleanVal(quality) || cleanVal(q?.title) || 'Unknown', name: cleanVal(u?.title) || cleanVal(q?.title) || 'Link', url });
      });
    });
  };
  if (Array.isArray(formatList)) formatList.forEach((f: any) => pushGroup(f?.title, f?.qualityList));
  return out;
}

function mapHome(provider: string, r: any): { ongoing: Card[]; completed: Card[]; movie: Card[] } {
  let ongoing: Card[] = [], completed: Card[] = [], movie: Card[] = [];
  if (provider === 'otakudesu') {
    ongoing = (r?.data?.ongoing?.animeList || []).map((i: any) => normalizeCard(i, provider)).filter(Boolean);
    completed = (r?.data?.completed?.animeList || []).map((i: any) => normalizeCard(i, provider)).filter(Boolean);
  } else if (provider === 'oploverz') {
    ongoing = (r?.data?.popularToday?.animeList || []).map((i: any) => normalizeCard(i, provider)).filter(Boolean);
    completed = (r?.data?.latestRelease?.animeList || []).map((i: any) => normalizeCard(i, provider)).filter(Boolean);
  } else {
    ongoing = (r?.data?.ongoing?.episodeList || []).map((i: any) => normalizeCard(i, provider)).filter(Boolean);
    completed = (r?.data?.completed?.animeList || []).map((i: any) => normalizeCard(i, provider)).filter(Boolean);
    movie = (r?.data?.movie?.animeList || []).map((i: any) => normalizeCard(i, provider)).filter(Boolean);
  }
  return { ongoing, completed, movie };
}

function legacyDetail(provider: string, id: string, slug: string, data: any): Detail {
  if (provider === 'otakudesu') {
    const epsRaw = cleanVal(data.episodes);
    const epList: EpisodeItem[] = (data.episodeList || []).map((i: any) => ({
      num: cleanVal(i.num) || cleanVal(i.title),
      id: i.episodeId,
      slug: '',
      date: cleanVal(i.date)
    }));
    return {
      id, slug: '', provider,
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
      recommendations: (data.recommendedAnimeList || []).map((i: any) => normalizeCard(i, provider)).filter(Boolean)
    };
  }
  if (provider === 'oploverz') {
    return {
      id, slug: id, provider,
      title: cleanVal(data.title) || 'Unknown',
      alt: '',
      poster: data.poster || '',
      score: cleanVal(data.rating),
      type: cleanVal(data.type),
      status: cleanVal(data.status),
      year: cleanVal(data.releasedOn),
      episodes: (data.episodeList || []).length ? String((data.episodeList || []).length) : '',
      duration: cleanVal(data.duration),
      studio: cleanVal(data.studio),
      genres: (Array.isArray(data.genres) ? data.genres : []).map((g: any) => ({ t: cleanVal(g), id: '' })).filter((g: any) => g.t),
      synopsis: (data.synopsis?.paragraphList || []).join('\n\n') || 'Sinopsis tidak tersedia.',
      downloads: [],
      episodeList: (data.episodeList || []).map((i: any) => {
        const href = i.href || '';
        const s = href.split('/').filter(Boolean).pop() || '';
        return { num: i.episode, id: href, slug: s, date: i.date || '' };
      }),
      recommendations: []
    };
  }
  /* kuramanime */
  const first = parseInt(data.episode && data.episode.first, 10);
  const last = parseInt(data.episode && data.episode.last, 10);
  const epList: EpisodeItem[] = [];
  if (first > 0 && last >= first) {
    for (let n = first; n <= last; n++) epList.push({ num: String(n), id: String(n), slug: '', date: '' });
  }
  return {
    id: data.animeId || id,
    slug: data.animeSlug || slug,
    provider,
    title: cleanVal(data.title) || 'Unknown',
    alt: cleanVal(data.alternativeTitle),
    poster: data.poster || '',
    score: cleanVal(data.score),
    type: cleanVal(data.type && data.type.title),
    status: cleanVal(data.status && data.status.title),
    year: cleanVal(data.aired),
    episodes: cleanVal(data.episodes) || (epList.length ? String(last) : ''),
    duration: cleanVal(data.duration),
    studio: cleanVal(Array.isArray(data.studioList) ? data.studioList.map((x: any) => x.title).join(', ') : ''),
    genres: (data.genreList || []).map((x: any) => ({ t: cleanVal(x.title), id: '' })).filter((g: any) => g.t),
    synopsis: (data.synopsis?.paragraphList || []).join('\n\n') || 'Sinopsis tidak tersedia.',
    downloads: [],
    episodeList: epList,
    recommendations: (data.similarAnimeList || []).map((i: any) => normalizeCard(i, 'kuramanime')).filter(Boolean)
  };
}

function legacyStream(provider: string, params: { episodeId: string; episodeSlug?: string; episode?: string; animeId?: string; animeSlug?: string }, details: any): EpisodeStream {
  const downloads = toDownloads(details.download?.qualityList);
  const info = details.info || {};

  if (provider === 'otakudesu' || provider === 'oploverz') {
    const qualities = (details.server?.qualityList || []).map((q: any) => ({
      title: String(q.title || '').trim(),
      servers: (q.serverList || []).map((s: any) => ({ name: String(s.title || '').trim(), id: s.serverId, def: !!s.default }))
    }));
    const allServers: { name: string; id: string; quality: string; def: boolean }[] = [];
    qualities.forEach((q: any) => q.servers.forEach((s: any) => allServers.push({ ...s, quality: q.title })));
    return {
      provider,
      title: details.title || 'Episode ' + (params.episode || ''),
      playerUrl: provider === 'otakudesu' ? details.defaultStreamingUrl || '' : details.streamingUrl || '',
      qualities,
      servers: allServers,
      downloads,
      info
    };
  }

  const qlist: any[] = Array.isArray(details.server?.qualityList) ? details.server.qualityList : [];
  const qualities = qlist.map((q: any) => ({
    title: String(q.title || '').trim(),
    servers: (q.serverList || []).map((s: any) => ({ name: s.title, id: s.serverId }))
  }));
  const allServers: { name: string; id: string; quality: string; def: boolean }[] = [];
  qualities.forEach((q: any) => q.servers.forEach((s: any) => allServers.push({ ...s, def: false, quality: q.title })));
  return {
    provider,
    title: details.episodeTitle || details.title || 'Episode ' + (params.episode || ''),
    playerUrl: '',
    qualities,
    servers: allServers,
    note: allServers.length ? '' : 'Sumber ini tidak menyediakan URL pemutar maupun server streaming.',
    downloads,
    info
  };
}

async function legacyList(provider: string, action: 'ongoing' | 'completed', page: number): Promise<ListResult> {
  try {
    const r = await apiGet(task(provider, action, { page }), 20000, `${action}:${provider}:${page}`, TTL.home);
    if (provider === 'oploverz' && action === 'ongoing') {
      const sections = r?.data?.sectionList || [];
      const list: Card[] = [];
      sections.forEach((s: any) =>
        (s.animeList || []).forEach((i: any) => {
          const c = normalizeCard(i, 'oploverz');
          if (c) list.push(c);
        })
      );
      return { list, pagination: r?.pagination || null, catalog: sections.length ? true : undefined };
    }
    const key = provider === 'otakudesu' || provider === 'oploverz' ? 'animeList' : action === 'ongoing' ? 'episodeList' : 'animeList';
    return {
      list: (r?.data?.[key] || []).map((i: any) => normalizeCard(i, provider)).filter(Boolean),
      pagination: r?.pagination || null
    };
  } catch (e) {
    console.warn(`${action} ${provider} gagal`, e);
    return { list: [], pagination: null };
  }
}

async function legacyDetailFetch(provider: string, id: string, slug = ''): Promise<Detail> {
  if (provider === 'kusonime') {
    const s = String(slug || id || '').replace(/^\/+|\/+$/g, '');
    if (!s) throw new ApiError('Film tidak ditemukan.', 404);
    const r = await apiGet(task('kusonime', 'detail', { id: s, slug: s }), 20000, 'detail:kusonime:' + s, TTL.detail);
    const d = r?.data;
    if (!d || !cleanVal(d.title)) throw new ApiError('Film tidak ditemukan.', 404);
    const isMovie = /^movie$/i.test(cleanVal(d.type));
    return {
      id: s,
      slug: '',
      provider,
      title: cleanVal(d.title) || 'Unknown',
      alt: cleanVal(d.japanese),
      poster: d.thumbnail || '',
      score: cleanVal(d.score),
      type: cleanVal(d.type),
      status: cleanVal(d.status),
      year: cleanVal(d.released_on),
      episodes: isMovie ? '' : cleanVal(d.total_episode),
      duration: cleanVal(d.duration),
      studio: cleanVal(d.producers),
      genres: String(d.genre || '').split(',').map(x => ({ t: cleanVal(x), id: '' })).filter(g => g.t),
      synopsis: cleanVal(d.sinopsis) || 'Sinopsis tidak tersedia.',
      downloads: parseKusonimeDownloads(d.list_download),
      episodeList: [],
      recommendations: []
    };
  }
  const r = await apiGet(task(provider, 'detail', { id, slug }), 20000, 'detail:' + provider + ':' + id, TTL.detail);
  const data = r?.data?.details;
  if (!data) throw new ApiError('Detail anime tidak ditemukan.', 404);
  return legacyDetail(provider, id, slug, data);
}

export const otakudesu: AnimeProvider = {
  id: 'otakudesu',
  name: 'Otakudesu',
  active: true,
  searchable: true,
  priority: 10,
  desc: 'Provider utama. Home, search, detail, episode, server, genre, jadwal.',
  async home() {
    const r = await apiGet(task('otakudesu', 'home'), 20000, 'home:otakudesu', TTL.home);
    const res = mapHome('otakudesu', r);
    if (!res.ongoing.length && !res.completed.length) throw new ApiError('Halaman tidak berisi daftar anime.');
    return res;
  },
  async search(query: string) {
    const r = await apiGet(task('otakudesu', 'search', { query }), 20000, 'search:otakudesu:' + query, TTL.search);
    return (r?.data?.animeList || []).map((i: any) => normalizeCard(i, 'otakudesu')).filter(Boolean);
  },
  detail: (id: string, slug?: string) => legacyDetailFetch('otakudesu', id, slug),
  async episodes(id: string, slug?: string) {
    return (await this.detail(id, slug)).episodeList;
  },
  async stream(params) {
    const r = await apiGet(
      task('otakudesu', 'episode', { id: params.episodeId, slug: params.episodeSlug, animeId: params.animeId, animeSlug: params.animeSlug, episodeId: params.episodeId }),
      20000,
      'episode:otakudesu:' + params.episodeId,
      TTL.episode
    );
    const details = r?.data?.details;
    if (!details) throw new ApiError('Data episode tidak ditemukan.', 404);
    return legacyStream('otakudesu', params, details);
  },
  async resolveServer(serverId: string) {
    if (/^https?:\/\//i.test(serverId)) return serverId;
    const r = await apiGet(task('otakudesu', 'server', { id: serverId }), 20000, 'server:' + serverId, TTL.episode);
    return r?.data?.details?.url || '';
  },
  ongoing: (page = 1) => legacyList('otakudesu', 'ongoing', page),
  completed: (page = 1) => legacyList('otakudesu', 'completed', page),
  async genres() {
    try {
      const r = await apiGet(task('otakudesu', 'genres'), 20000, 'genres', TTL.genre);
      return r?.data?.genreList || [];
    } catch {
      return [];
    }
  },
  async schedule() {
    const r = await apiGet(task('otakudesu', 'schedule'), 25000, 'sched:otakudesu', TTL.schedule);
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

export const oploverz: AnimeProvider = {
  id: 'oploverz',
  name: 'Oploverz',
  active: true,
  searchable: true,
  priority: 11,
  desc: 'Provider alternatif. Home, search, detail, episode dengan streamingUrl langsung.',
  async home() {
    const r = await apiGet(task('oploverz', 'home'), 20000, 'home:oploverz', TTL.home);
    const res = mapHome('oploverz', r);
    if (!res.ongoing.length && !res.completed.length) throw new ApiError('Halaman tidak berisi daftar anime.');
    return res;
  },
  async search(query: string) {
    const r = await apiGet(task('oploverz', 'search', { query }), 20000, 'search:oploverz:' + query, TTL.search);
    return (r?.data?.animeList || []).map((i: any) => normalizeCard(i, 'oploverz')).filter(Boolean);
  },
  detail: (id: string, slug?: string) => legacyDetailFetch('oploverz', id, slug),
  async episodes(id: string, slug?: string) {
    return (await this.detail(id, slug)).episodeList;
  },
  async stream(params) {
    const r = await apiGet(
      task('oploverz', 'episode', { id: params.episodeId, slug: params.episodeSlug, animeId: params.animeId, animeSlug: params.animeSlug, episodeId: params.episodeId }),
      20000,
      'episode:oploverz:' + params.episodeId,
      TTL.episode
    );
    const details = r?.data?.details;
    if (!details) throw new ApiError('Data episode tidak ditemukan.', 404);
    return legacyStream('oploverz', params, details);
  },
  ongoing: (page = 1) => legacyList('oploverz', 'ongoing', page),
  completed: (page = 1) => legacyList('oploverz', 'completed', page),
  async schedule() {
    const r = await apiGet(task('oploverz', 'schedule'), 25000, 'sched:oploverz', TTL.schedule);
    return (r?.data?.scheduleList || []).map((day: any) => ({
      day: String(day?.day || day?.title || ''),
      items: (day?.animeList || []).map((a: any) => ({
        time: '',
        episode: cleanVal(a?.episode),
        title: cleanVal(a?.title),
        id: cleanVal(a?.slug),
        provider: 'oploverz',
        poster: a?.poster || ''
      }))
    }));
  }
} as AnimeProvider;

export const kuramanime: AnimeProvider = {
  id: 'kuramanime',
  name: 'Kuramanime',
  active: true,
  searchable: true,
  priority: 12,
  desc: 'Provider alternatif. Home, detail, episode, properties (genre/season/studio).',
  async home() {
    const r = await apiGet(task('kuramanime', 'home'), 20000, 'home:kuramanime', TTL.home);
    const res = mapHome('kuramanime', r);
    if (!res.ongoing.length && !res.completed.length) throw new ApiError('Halaman tidak berisi daftar anime.');
    return res;
  },
  async search(query: string) {
    const r = await apiGet(task('kuramanime', 'search', { query }), 20000, 'search:kuramanime:' + query, TTL.search);
    return (r?.data?.animeList || []).map((i: any) => normalizeCard(i, 'kuramanime')).filter(Boolean);
  },
  detail: (id: string, slug?: string) => legacyDetailFetch('kuramanime', id, slug),
  async episodes(id: string, slug?: string) {
    return (await this.detail(id, slug)).episodeList;
  },
  async stream(params) {
    const r = await apiGet(
      task('kuramanime', 'episode', { id: params.episodeId, slug: params.episodeSlug, animeId: params.animeId, animeSlug: params.animeSlug, episodeId: params.episodeId }),
      20000,
      'episode:kuramanime:' + params.episodeId,
      TTL.episode
    );
    const details = r?.data?.details;
    if (!details) throw new ApiError('Data episode tidak ditemukan.', 404);
    return legacyStream('kuramanime', params, details);
  },
  ongoing: (page = 1) => legacyList('kuramanime', 'ongoing', page),
  completed: (page = 1) => legacyList('kuramanime', 'completed', page)
} as AnimeProvider;

export const kusonime: AnimeProvider = {
  id: 'kusonime',
  name: 'Kusonime',
  active: true,
  searchable: true,
  movieOnly: true,
  priority: 13,
  desc: 'Sumber anime movie. Home, search, detail dan tautan unduh; pemutaran memakai provider streaming lain.',
  async home() {
    /* Kusonime tidak punya halaman home terpisah — pakai daftar movie. */
    const r = await apiGet(task('kusonime', 'movies', { page: 1 }), 20000, 'movie:season:1', TTL.home);
    const movie = (Array.isArray(r?.data) ? r.data : []).map((i: any) => normalizeKusonimeCard(i, 'Movie')).filter(Boolean);
    return { ongoing: [], completed: [], movie };
  },
  async search(query: string) {
    const r = await apiGet(task('kusonime', 'search', { query }), 20000, 'search:kusonime:' + query, TTL.search);
    return (r?.data?.listAnime || []).map((i: any) => normalizeKusonimeCard(i)).filter(Boolean);
  },
  detail: (id: string, slug?: string) => legacyDetailFetch('kusonime', id, slug),
  async episodes() {
    return [];
  },
  async stream(): Promise<EpisodeStream> {
    const err = new ApiError(
      'Sumber film ini (Kusonime) tidak memiliki endpoint streaming — hanya link download file hosting. Gunakan tombol "Tonton Film" di halaman detail untuk memeriksa sumber lain.'
    );
    (err as any).code = 'no-stream';
    throw err;
  },
  async ongoing() {
    const r = await apiGet(task('kusonime', 'movies', { page: 1 }), 20000, 'movie:season:1', TTL.home);
    const list = (Array.isArray(r?.data) ? r.data : []).map((i: any) => normalizeKusonimeCard(i, 'Movie')).filter(Boolean);
    return { list, pagination: null };
  }
} as AnimeProvider;

/** Batch Otakudesu (unduhan) — dipanggil lapisan API. */
export async function otakudesuBatchDownloads(batchId: string): Promise<DownloadLink[]> {
  const r = await apiGet(task('otakudesu', 'batch', { id: batchId }), 20000, 'batch:' + batchId, TTL.detail);
  return toDownloads(r?.data?.details?.download?.formatList);
}

/** Genre listing Otakudesu (satu-satunya provider dengan paginasi genre). */
export async function otakudesuGenre(genreId: string, page: number): Promise<{ list: Card[]; pagination: any }> {
  const r = await apiGet(task('otakudesu', 'genre', { id: genreId, page }), 20000, `genre:${genreId}:${page}`, TTL.genre);
  return {
    list: (r?.data?.animeList || []).map((i: any) => normalizeCard(i, 'otakudesu')).filter(Boolean),
    pagination: r?.pagination || null
  };
}

/** Resolve server legacy (token base64 Oploverz / ajax nonce Otakudesu). */
export async function legacyResolveServer(serverId: string): Promise<string> {
  if (/^https?:\/\//i.test(serverId)) return serverId;
  if (serverId.startsWith('oplz:')) {
    try {
      const decoded = atob(serverId.slice(5).replace(/-/g, '+').replace(/_/g, '/'));
      const doc = new DOMParser().parseFromString(decoded, 'text/html');
      return doc.querySelector('iframe')?.getAttribute('src') || '';
    } catch {
      throw new Error('Token server Oploverz tidak valid.');
    }
  }
  return otakudesu.resolveServer!(serverId);
}
