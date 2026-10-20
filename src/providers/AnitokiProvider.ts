import { httpGetJson, NetError } from '../core/http';
import type { Card, Detail, DownloadLink, EpisodeItem, EpisodeStream } from '../core/types';
import type { AnimeProvider } from './types';

const ROOT = 'https://anitoki.id';
const HEADERS = { Referer: ROOT + '/', Accept: 'application/json' };
const getJson = async <T>(path: string, timeout = 20000): Promise<T> => (await httpGetJson<T>(ROOT + path, { timeout, retries: 1, headers: HEADERS })).data;

interface AnitokiAnime {
  _id?: string;
  title?: string;
  slug?: string;
  coverImage?: string;
  bannerImage?: string;
  nativeTitle?: string;
  type?: string;
  status?: string;
  rating?: number | string;
  views?: number;
  episode_count?: number;
  totalEpisode?: number;
  duration?: string;
  studio?: string;
  synopsis?: string;
  genres?: string[];
  year?: number | string;
  lastUpdated?: string;
  last_episode?: string;
  episodes?: { title?: string; slug?: string; airDate?: string }[];
}

interface AnitokiEpisode {
  title?: string;
  servers?: { name?: string; url?: string }[];
  downloads?: { quality?: string; size?: string; links?: { name?: string; url?: string }[] }[];
}

const card = (anime: AnitokiAnime): Card => ({
  id: anime.slug || '',
  slug: anime.slug || '',
  provider: 'anitoki',
  title: anime.title || '',
  poster: anime.coverImage || '',
  score: anime.rating !== undefined ? String(anime.rating) : '',
  type: anime.type || '',
  status: anime.status || '',
  epLabel: anime.last_episode || (anime.episode_count ? String(anime.episode_count) + ' Episode' : ''),
  sub: anime.type || '',
  sourceUrl: ROOT + '/anime/' + (anime.slug || ''),
  year: anime.year ? String(anime.year) : '',
  genres: anime.genres || []
});

const episodesOf = (anime: AnitokiAnime): EpisodeItem[] =>
  (anime.episodes || [])
    .filter(ep => ep.slug)
    .map(ep => ({
      num: (ep.title || '').replace(/[^\d]/g, '') || '',
      id: ep.slug || '',
      slug: ep.slug || '',
      date: ep.airDate || '',
      title: ep.title || ''
    }))
    .sort((a, b) => Number(a.num) - Number(b.num));

export const anitoki: AnimeProvider = {
  id: 'anitoki',
  name: 'Anitoki',
  active: true,
  searchable: true,
  content: 'anime',
  priority: 4,
  desc: 'API katalog Anitoki: detail seri, daftar episode, server, dan tautan unduhan.',

  async home() {
    const res = await getJson<{ success?: boolean; data?: AnitokiAnime[] }>('/api/anime-list?q=&page=1&limit=40', 12000);
    const items = (res.data || []).filter(item => item.slug).map(card);
    if (!items.length) throw new NetError('Daftar anime Anitoki kosong.', 'parse');
    const movie = items.filter(item => /movie/i.test(item.type));
    const ongoing = items.filter(item => !/movie/i.test(item.type) && /ongoing/i.test(item.status));
    const completed = items.filter(item => !/movie/i.test(item.type) && !/ongoing/i.test(item.status));
    return { ongoing, completed, movie };
  },

  async search(query: string) {
    const res = await getJson<{ success?: boolean; data?: AnitokiAnime[] }>('/api/anime-list?q=' + encodeURIComponent(query) + '&page=1&limit=24');
    return (res.data || []).filter(item => item.slug && item.title).map(card);
  },

  async detail(id: string): Promise<Detail> {
    const slug = id.replace(/^\/+|\/+$/g, '');
    const res = await getJson<{ success?: boolean; data?: { info?: AnitokiAnime; recommendations?: AnitokiAnime[] } }>('/api/anime/' + encodeURIComponent(slug), 25000);
    const info = res.data?.info;
    if (!info || !info.title) throw new NetError('Detail anime Anitoki tidak ditemukan.', 'notfound', 404);
    return {
      id: slug,
      slug,
      provider: 'anitoki',
      title: info.title,
      alt: info.nativeTitle || '',
      poster: info.coverImage || '',
      score: info.rating !== undefined ? String(info.rating) : '',
      type: info.type || '',
      status: info.status || '',
      year: info.year ? String(info.year) : '',
      episodes: info.totalEpisode ? String(info.totalEpisode) : String((info.episodes || []).length),
      duration: info.duration || '',
      studio: info.studio || '',
      genres: (info.genres || []).map(name => ({ t: name, id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') })),
      synopsis: info.synopsis || 'Sinopsis tidak tersedia.',
      downloads: [],
      episodeList: episodesOf(info),
      recommendations: (res.data?.recommendations || []).filter(item => item.slug).map(card)
    };
  },

  async episodes(id: string) {
    return (await this.detail(id)).episodeList;
  },

  async stream(params): Promise<EpisodeStream> {
    const animeSlug = params.animeSlug || '';
    const episodeSlug = params.episodeSlug || params.episodeId || '';
    if (!animeSlug || !episodeSlug) throw new NetError('Parameter episode Anitoki tidak lengkap.', 'parse');
    const res = await getJson<{ success?: boolean; data?: { episode?: AnitokiEpisode } }>(
      '/api/episode/' + encodeURIComponent(animeSlug) + '/' + encodeURIComponent(episodeSlug),
      7000
    );
    const episode = res.data?.episode;
    if (!episode) throw new NetError('Data episode Anitoki tidak tersedia.', 'unavailable');
    const servers = (episode.servers || [])
      .filter(server => /^https?:\/\//i.test(server.url || ''))
      .map((server, index) => {
        const label = server.name || 'Server ' + (index + 1);
        const quality = (label.match(/\d{3,4}p/i) || [''])[0];
        return { name: label, id: server.url || '', quality, def: index === 0 };
      });
    if (!servers.length) throw new NetError('Episode Anitoki tidak memiliki server yang bisa diputar.', 'unavailable');
    const downloads: DownloadLink[] = [];
    for (const group of episode.downloads || []) {
      for (const link of group.links || []) {
        if (!/^https?:\/\//i.test(link.url || '')) continue;
        downloads.push({
          quality: [group.quality, group.size].filter(Boolean).join(' · ') || 'Unduhan',
          name: link.name || 'Link',
          url: link.url || '',
          availability: 'unverified'
        });
      }
    }
    const seen = new Set<string>();
    const qualities: { title: string; servers: typeof servers }[] = [];
    for (const server of servers) {
      const key = server.quality || 'Server';
      let group = qualities.find(entry => entry.title === key);
      if (!seen.has(key)) {
        seen.add(key);
        group = { title: key, servers: [] };
        qualities.push(group);
      }
      group!.servers.push(server);
    }
    return {
      provider: 'anitoki',
      title: episode.title || 'Episode ' + (params.episode || ''),
      playerUrl: servers[0].id,
      sourceKind: 'embed-page',
      qualities,
      servers,
      downloads,
      info: {}
    };
  },

  async resolveServer(serverId: string) {
    return serverId;
  },

  async genres() {
    const res = await getJson<{ data?: { genres?: { name?: string; count?: number }[] } }>('/api/genres', 20000);
    return (res.data?.genres || [])
      .filter(item => item.name)
      .map(item => ({ genreId: (item.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: item.name || '' }));
  }
};
