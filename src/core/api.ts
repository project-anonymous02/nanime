import { PROVIDERS, TTL, isMovieSource, type ApiSource } from './config';
import { apiGet, ApiError } from './client';
import {
  normalizeCard,
  normalizeKusonimeCard,
  parseKusonimeDownloads
} from './normalize';
import { Store } from './store';
import { cleanVal, seriesSlug } from './utils';
import type {
  Card,
  Detail,
  DownloadLink,
  ListResult,
  ScheduleItem,
  SearchResult,
  Stream
} from './types';

const W: ApiSource = 'wajik';
const K: ApiSource = 'kusonime';

const j = encodeURIComponent;

export interface ScheduleGroup {
  day: string;
  items: ScheduleItem[];
}

const DAY_KEYS = [
  ['minggu', 'sunday', 'sun'],
  ['senin', 'monday', 'mon'],
  ['selasa', 'tuesday', 'tue'],
  ['rabu', 'wednesday', 'wed'],
  ['kamis', 'thursday', 'thu'],
  ['jumat', 'jum', 'friday', 'fri'],
  ['sabtu', 'saturday', 'sat']
];

export function dayIndex(raw: string): number {
  const s = String(raw || '').toLowerCase();
  for (let i = 0; i < DAY_KEYS.length; i++) {
    if (DAY_KEYS[i].some(k => s.indexOf(k) > -1)) return i;
  }
  return -1;
}

function toDownloads(formatList: any): DownloadLink[] {
  const out: DownloadLink[] = [];
  const pushGroup = (quality: string, list: any) => {
    if (!Array.isArray(list)) return;
    list.forEach((q: any) => {
      const urls = Array.isArray(q?.urlList) ? q.urlList : [];
      urls.forEach((u: any) => {
        const url = cleanVal(u?.url);
        if (!/^https?:\/\//i.test(url)) return;
        out.push({
          quality: cleanVal(quality) || cleanVal(q?.title) || 'Unknown',
          name: cleanVal(u?.title) || cleanVal(q?.title) || 'Link',
          url
        });
      });
    });
  };
  if (Array.isArray(formatList)) {
    formatList.forEach((f: any) => pushGroup(f?.title, f?.qualityList));
  }
  return out;
}

export const API = {
  async home(): Promise<{ ongoing: Card[]; completed: Card[]; movie: Card[] }> {
    const provider = Store.getProvider();
    let ongoing: Card[] = [], completed: Card[] = [], movie: Card[] = [];

    try {
      if (provider === 'otakudesu') {
        const r = await apiGet(W, '/otakudesu/home', 20000, 'home:otakudesu', TTL.home);
        ongoing = (r?.data?.ongoing?.animeList || []).map((i: any) => normalizeCard(i, 'otakudesu')).filter(Boolean);
        completed = (r?.data?.completed?.animeList || []).map((i: any) => normalizeCard(i, 'otakudesu')).filter(Boolean);
      } else if (provider === 'oploverz') {
        const r = await apiGet(W, '/oploverz/home', 20000, 'home:oploverz', TTL.home);
        ongoing = (r?.data?.popularToday?.animeList || []).map((i: any) => normalizeCard(i, 'oploverz')).filter(Boolean);
        completed = (r?.data?.latestRelease?.animeList || []).map((i: any) => normalizeCard(i, 'oploverz')).filter(Boolean);
      } else if (provider === 'kuramanime') {
        const r = await apiGet(W, '/kuramanime/home', 20000, 'home:kuramanime', TTL.home);
        ongoing = (r?.data?.ongoing?.episodeList || []).map((i: any) => normalizeCard(i, 'kuramanime')).filter(Boolean);
        completed = (r?.data?.completed?.animeList || []).map((i: any) => normalizeCard(i, 'kuramanime')).filter(Boolean);
        movie = (r?.data?.movie?.animeList || []).map((i: any) => normalizeCard(i, 'kuramanime')).filter(Boolean);
      }
    } catch (e) {
      console.warn('Primary provider failed:', e);
      try {
        const r = await apiGet(W, '/otakudesu/home', 20000, 'home:otakudesu:fallback', TTL.home);
        ongoing = (r?.data?.ongoing?.animeList || []).map((i: any) => normalizeCard(i, 'otakudesu')).filter(Boolean);
        completed = (r?.data?.completed?.animeList || []).map((i: any) => normalizeCard(i, 'otakudesu')).filter(Boolean);
      } catch (e2) {
        console.error('Fallback also failed:', e2);
        throw e2 instanceof ApiError ? e2 : new Error('Semua provider gagal dimuat.');
      }
    }
    return { ongoing, completed, movie };
  },

  async search(query: string): Promise<SearchResult> {
    if (!query || query.trim().length < 2) return { items: [], sources: [] };
    const preferred = Store.getProvider();
    const ids = Object.keys(PROVIDERS).filter(
      id => PROVIDERS[id].active && PROVIDERS[id].search && !isMovieSource(id)
    );
    ids.sort((a, b) => (a === preferred ? -1 : b === preferred ? 1 : 0));

    const jobs: { id: string; run: () => Promise<Card[]> }[] = ids.map(id => ({
      id,
      run: async () => {
        const r = await apiGet(W, '/' + id + '/search?q=' + j(query), 20000, 'search:' + id + ':' + query, TTL.search);
        return (r?.data?.animeList || []).map((i: any) => normalizeCard(i, id)).filter(Boolean);
      }
    }));

    const movieSrc = PROVIDERS.kusonime;
    if (movieSrc && movieSrc.active && movieSrc.search) {
      jobs.push({
        id: 'kusonime',
        run: async () => {
          const r = await apiGet(K, '/api/search/?s=' + j(query), 20000, 'search:kusonime:' + query, TTL.search);
          return (r?.data?.listAnime || []).map((i: any) => normalizeKusonimeCard(i)).filter(Boolean);
        }
      });
    }

    const sources = await Promise.all(
      jobs.map(async job => {
        try {
          const list = await job.run();
          return { id: job.id, ok: true, count: list.length, items: list };
        } catch (e: any) {
          if (e?.status === 404) return { id: job.id, ok: true, count: 0, items: [] };
          console.warn('Search failed:', job.id, e);
          return { id: job.id, ok: false, count: 0, items: [], error: e?.message || 'Gagal' };
        }
      })
    );

    if (!sources.length || sources.every(s => !s.ok)) {
      throw new Error(sources.map(s => s.error).filter(Boolean)[0] || 'Pencarian gagal.');
    }

    const items: Card[] = [];
    const seen = new Set<string>();
    sources.forEach(s =>
      s.items.forEach(a => {
        const key = a.provider + ':' + a.id;
        if (seen.has(key)) return;
        seen.add(key);
        items.push(a);
      })
    );
    return { items, sources: sources.map(s => ({ id: s.id, ok: s.ok, count: s.count, items: s.items, error: s.error })) };
  },

  async movies(): Promise<{ items: Card[]; error: string }> {
    try {
      const page = (n: number) =>
        apiGet(
          K,
          n === 1 ? '/api/seasons/anime-movie' : '/api/seasons/anime-movie/page/' + n,
          20000,
          'movie:season:' + n,
          TTL.home
        );
      const results = await Promise.all(
        [1, 2].map(n => page(n).catch(e => { console.warn('Movie page failed:', n, e); return null; }))
      );
      const items: Card[] = [];
      const seen = new Set<string>();
      let okCount = 0;
      results.forEach(r => {
        if (!r || !Array.isArray(r.data)) return;
        okCount++;
        r.data.forEach((i: any) => {
          const c = normalizeKusonimeCard(i, 'Movie');
          if (!c || seen.has(c.id)) return;
          seen.add(c.id);
          items.push(c);
        });
      });
      if (!okCount) return { items: [], error: 'Sumber movie tidak merespons.' };
      return { items, error: '' };
    } catch (e: any) {
      console.warn('Movie list failed:', e);
      return { items: [], error: e?.message || 'Gagal' };
    }
  },

  async detail(provider: string, id: string, slug = ''): Promise<Detail> {
    if (provider === 'kusonime') {
      const s = String(slug || id || '').replace(/^\/+|\/+$/g, '');
      if (!s) throw new ApiError('Film tidak ditemukan.', 404);
      const r = await apiGet(K, '/api/anime/' + j(s) + '/', 20000, 'detail:kusonime:' + s, TTL.detail);
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

    let endpoint: string;
    if (provider === 'otakudesu') endpoint = '/otakudesu/anime/' + j(id);
    else if (provider === 'oploverz') endpoint = '/oploverz/anime/' + j(id);
    else if (provider === 'kuramanime') endpoint = '/kuramanime/anime/' + j(id) + '/' + j(slug || id);
    else throw new ApiError('Provider tidak tersedia.');

    const r = await apiGet(W, endpoint, 20000, 'detail:' + provider + ':' + id, TTL.detail);
    const data = r?.data?.details;
    if (!data) throw new ApiError('Detail anime tidak ditemukan.', 404);

    if (provider === 'otakudesu') {
      return {
        id, slug: '', provider,
        title: cleanVal(data.title) || 'Unknown',
        alt: cleanVal(data.japanese),
        poster: data.poster || '',
        score: cleanVal(data.score),
        type: cleanVal(data.type),
        status: cleanVal(data.status),
        year: cleanVal(data.aired),
        episodes: cleanVal(data.episodes),
        duration: cleanVal(data.duration),
        studio: cleanVal(data.studios),
        genres: (data.genreList || []).map((i: any) => ({ t: cleanVal(i.title), id: i.genreId || '' })).filter((g: any) => g.t),
        synopsis: (data.synopsis?.paragraphList || []).join('\n\n') || 'Sinopsis tidak tersedia.',
        downloads: [],
        batchId: cleanVal(data.batch?.batchId) || '',
        episodeList: (data.episodeList || []).map((i: any) => ({ num: i.title, id: i.episodeId, slug: '', date: '' })),
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

    const first = parseInt(data.episode && data.episode.first, 10);
    const last = parseInt(data.episode && data.episode.last, 10);
    const epList: { num: string; id: string; slug: string; date: string }[] = [];
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
  },

  async episode(
    provider: string,
    params: { episodeId: string; episodeSlug?: string; episode?: string; animeId?: string; animeSlug?: string }
  ): Promise<Stream & { downloads: DownloadLink[]; info: any }> {
    let endpoint: string;
    if (provider === 'otakudesu') endpoint = '/otakudesu/episode/' + j(params.episodeId);
    else if (provider === 'oploverz') endpoint = '/oploverz/episode/' + j(params.episodeSlug || params.episodeId);
    else if (provider === 'kuramanime')
      endpoint =
        '/kuramanime/episode/' + j(params.animeId || '') + '/' + j(params.animeSlug || '') + '/' + j(params.episodeId);
    else if (provider === 'kusonime') {
      const err = new ApiError(
        'Sumber film ini (Kusonime) tidak memiliki endpoint streaming — hanya link download file hosting. Gunakan tombol "Tonton Film" di halaman detail untuk memeriksa sumber lain.'
      );
      (err as any).code = 'no-stream';
      throw err;
    } else throw new ApiError('Provider tidak tersedia.');

    const r = await apiGet(W, endpoint, 20000, 'episode:' + provider + ':' + params.episodeId, TTL.episode);
    const details = r?.data?.details;
    if (!details) throw new ApiError('Data episode tidak ditemukan.', 404);

    const downloads = toDownloads(details.download?.qualityList);
    const info = details.info || {};

    if (provider === 'otakudesu') {
      const qualities: { title: string; servers: { name: string; id: string }[] }[] = (details.server?.qualityList || []).map((q: any) => ({
        title: String(q.title || '').trim(),
        servers: (q.serverList || []).map((s: any) => ({ name: s.title, id: s.serverId }))
      }));
      const allServers: { name: string; id: string; quality: string }[] = [];
      qualities.forEach(q => q.servers.forEach(s => allServers.push({ ...s, quality: q.title })));
      return {
        provider,
        title: details.title || 'Episode ' + (params.episode || ''),
        playerUrl: details.defaultStreamingUrl || '',
        qualities,
        servers: allServers,
        downloads,
        info
      };
    }

    if (provider === 'oploverz') {
      return {
        provider,
        title: details.title || 'Episode ' + (params.episode || ''),
        playerUrl: details.streamingUrl || '',
        qualities: [],
        servers: [],
        downloads,
        info
      };
    }

    const qlist: any[] = Array.isArray(details.server?.qualityList) ? details.server.qualityList : [];
    const qualities: { title: string; servers: { name: string; id: string }[] }[] = qlist.map((q: any) => ({
      title: String(q.title || '').trim(),
      servers: (q.serverList || []).map((s: any) => ({ name: s.title, id: s.serverId }))
    }));
    const allServers: { name: string; id: string; quality: string }[] = [];
    qualities.forEach(q => q.servers.forEach(s => allServers.push({ ...s, quality: q.title })));
    return {
      provider,
      title: details.episodeTitle || details.title || 'Episode ' + (params.episode || ''),
      playerUrl: '',
      qualities,
      servers: allServers,
      note: allServers.length
        ? ''
        : 'Provider ini tidak mengembalikan URL player maupun server streaming dari API.',
      downloads,
      info
    };
  },

  async resolveServer(serverId: string): Promise<string> {
    const r = await apiGet(W, '/otakudesu/server/' + j(serverId), 20000, 'server:' + serverId, TTL.episode);
    return r?.data?.details?.url || '';
  },

  async batchDownloads(batchId: string): Promise<DownloadLink[]> {
    const r = await apiGet(W, '/otakudesu/batch/' + j(batchId), 20000, 'batch:' + batchId, TTL.detail);
    return toDownloads(r?.data?.details?.download?.formatList);
  },

  async genres(): Promise<{ genreId: string; title: string }[]> {
    try {
      const r = await apiGet(W, '/otakudesu/genre', 20000, 'genres', TTL.genre);
      return r?.data?.genreList || [];
    } catch {
      return [];
    }
  },

  async ongoing(page = 1): Promise<ListResult> {
    const provider = Store.getProvider();
    try {
      if (provider === 'otakudesu') {
        const r = await apiGet(W, '/otakudesu/ongoing?page=' + page, 20000, 'ongoing:otakudesu:' + page, TTL.home);
        return {
          list: (r?.data?.animeList || []).map((i: any) => normalizeCard(i, 'otakudesu')).filter(Boolean),
          pagination: r?.pagination || null
        };
      }
      if (provider === 'oploverz') {
        const r = await apiGet(W, '/oploverz/anime?page=' + page, 20000, 'ongoing:oploverz:' + page, TTL.home);
        const sections = r?.data?.sectionList || [];
        const list: Card[] = [];
        sections.forEach((s: any) =>
          (s.animeList || []).forEach((i: any) => {
            const c = normalizeCard(i, 'oploverz');
            if (c) list.push(c);
          })
        );
        return { list, pagination: r?.pagination || null, catalog: true };
      }
      if (provider === 'kuramanime') {
        const r = await apiGet(
          W,
          '/kuramanime/anime?status=ongoing&page=' + page,
          20000,
          'ongoing:kuramanime:' + page,
          TTL.home
        );
        return {
          list: (r?.data?.episodeList || []).map((i: any) => normalizeCard(i, 'kuramanime')).filter(Boolean),
          pagination: r?.pagination || null
        };
      }
    } catch (e) {
      console.warn('ongoing failed', e);
    }
    return { list: [], pagination: null };
  },

  async completed(page = 1): Promise<ListResult> {
    const provider = Store.getProvider();
    try {
      if (provider === 'otakudesu') {
        const r = await apiGet(W, '/otakudesu/completed?page=' + page, 20000, 'completed:otakudesu:' + page, TTL.home);
        return {
          list: (r?.data?.animeList || []).map((i: any) => normalizeCard(i, 'otakudesu')).filter(Boolean),
          pagination: r?.pagination || null
        };
      }
      if (provider === 'oploverz') {
        const r = await apiGet(
          W,
          '/oploverz/anime?page=' + page + '&status=completed',
          20000,
          'completed:oploverz:' + page,
          TTL.home
        );
        return {
          list: (r?.data?.animeList || []).map((i: any) => normalizeCard(i, 'oploverz')).filter(Boolean),
          pagination: r?.pagination || null
        };
      }
      if (provider === 'kuramanime') {
        const r = await apiGet(
          W,
          '/kuramanime/anime?status=completed&page=' + page,
          20000,
          'completed:kuramanime:' + page,
          TTL.home
        );
        return {
          list: (r?.data?.animeList || []).map((i: any) => normalizeCard(i, 'kuramanime')).filter(Boolean),
          pagination: r?.pagination || null
        };
      }
    } catch (e) {
      console.warn('completed failed', e);
    }
    return { list: [], pagination: null };
  },

  async genre(genreId: string, page = 1): Promise<ListResult> {
    const r = await apiGet(
      W,
      '/otakudesu/genre/' + j(genreId) + '?page=' + page,
      20000,
      'genre:' + genreId + ':' + page,
      TTL.genre
    );
    return {
      list: (r?.data?.animeList || []).map((i: any) => normalizeCard(i, 'otakudesu')).filter(Boolean),
      pagination: r?.pagination || null
    };
  },

  /** Jadwal rilis gabungan (Otakudesu + Oploverz + Kuramanime). */
  async schedule(): Promise<ScheduleGroup[]> {
    const groups: Record<number, ScheduleItem[]> = {};
    const push = (idx: number, item: ScheduleItem) => {
      if (idx < 0) return;
      (groups[idx] = groups[idx] || []).push(item);
    };

    const provider = Store.getProvider();

    const jobs: Promise<void>[] = [];

    jobs.push(
      apiGet(W, '/otakudesu/schedule', 25000, 'sched:otakudesu', TTL.schedule)
        .then((r: any) => {
          (r?.data?.scheduleList || []).forEach((day: any) => {
            const idx = dayIndex(day?.title);
            (day?.animeList || []).forEach((a: any) =>
              push(idx, {
                time: '',
                title: cleanVal(a?.title),
                id: String(a?.animeId || ''),
                provider: 'otakudesu'
              })
            );
          });
        })
        .catch((e: any) => console.warn('schedule otakudesu', e))
    );

    jobs.push(
      apiGet(W, '/oploverz/schedule', 25000, 'sched:oploverz', TTL.schedule)
        .then((r: any) => {
          (r?.data?.scheduleList || []).forEach((day: any) => {
            const idx = dayIndex(day?.day || day?.title);
            (day?.animeList || []).forEach((a: any) =>
              push(idx, {
                time: cleanVal(a?.episode),
                title: cleanVal(a?.title),
                id: cleanVal(a?.slug) || seriesSlug(a?.title),
                provider: 'oploverz',
                poster: a?.poster || ''
              })
            );
          });
        })
        .catch((e: any) => console.warn('schedule oploverz', e))
    );

    if (provider === 'kuramanime') {
      jobs.push(
        apiGet(W, '/kuramanime/schedule?day=all', 25000, 'sched:kuramanime', TTL.schedule)
          .then((r: any) => {
            (r?.data?.animeList || []).forEach((a: any) =>
              push(dayIndex(a?.day), {
                time: cleanVal(a?.releaseTime),
                title: cleanVal(a?.title),
                id: String(a?.animeId || ''),
                slug: cleanVal(a?.animeSlug),
                provider: 'kuramanime',
                poster: a?.poster || ''
              })
            );
          })
          .catch((e: any) => console.warn('schedule kuramanime', e))
      );
    }

    await Promise.all(jobs);

    const order = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const out: ScheduleGroup[] = [];
    for (let i = 0; i < 7; i++) {
      if (groups[i] && groups[i].length) out.push({ day: order[i], items: groups[i] });
    }
    if (!out.length) throw new ApiError('Jadwal tidak tersedia untuk provider ini.', 404);
    return out;
  }
};
