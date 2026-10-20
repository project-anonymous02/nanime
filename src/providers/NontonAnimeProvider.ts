import { httpGetText, NetError } from '../core/http';
import type { Card, Detail, DownloadLink, EpisodeItem, EpisodeStream } from '../core/types';
import { abs, attr, clean, parseDoc, pathSlug, txt } from './shared';
import type { AnimeProvider } from './types';

const ROOT = 'https://nontonanime.id';
const HEADERS = { Referer: ROOT + '/', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
const get = (url: string, timeout = 20000) => httpGetText(url, { timeout, retries: 1, headers: HEADERS });

interface NontonEpisode {
  id?: number;
  episode_number?: number;
  title?: string;
  video_url?: string | null;
  video_url2?: string | null;
  video_url3?: string | null;
  server1_name?: string | null;
  server2_name?: string | null;
  server3_name?: string | null;
  download_label_1?: string | null;
  download_url_1?: string | null;
  download_label_2?: string | null;
  download_url_2?: string | null;
  download_label_3?: string | null;
  download_url_3?: string | null;
  download_label_4?: string | null;
  download_url_4?: string | null;
  download_label_5?: string | null;
  download_url_5?: string | null;
  download_label_6?: string | null;
  download_url_6?: string | null;
}

function extractLiteral<T>(html: string, name: string): T | null {
  const marker = new RegExp('const\\s+' + name + '\\s*=\\s*');
  const match = marker.exec(html);
  if (!match) return null;
  let i = match.index + match[0].length;
  const start = i;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  try {
    return JSON.parse(html.slice(start, i)) as T;
  } catch {
    return null;
  }
}

function episodesFrom(html: string): NontonEpisode[] {
  const list = extractLiteral<NontonEpisode[]>(html, 'allEpisodes');
  return Array.isArray(list) ? list : [];
}

export function parseNontonCards(doc: ParentNode): Card[] {
  const out: Card[] = [];
  const seen = new Set<string>();
  for (const anchor of Array.from(doc.querySelectorAll('a.anime-card[href], a.anime-card-v1[href]'))) {
    const href = abs(ROOT, attr(anchor, 'href'));
    if (!/\/anime\//.test(href)) continue;
    const slug = pathSlug(href);
    if (!slug || seen.has(slug)) continue;
    const image = anchor.querySelector('img.anime-poster, img.anime-card-poster-v1, img') as HTMLImageElement | null;
    const title =
      clean(txt(anchor.querySelector('.anime-title, .anime-card-title-v1'))) ||
      clean(attr(image, 'alt'));
    if (!title) continue;
    const badgeNodes = Array.from(anchor.querySelectorAll('.anime-badges .badge, .anime-card-badgebar-v1 span'));
    const badges = badgeNodes.map(node => clean(txt(node))).filter(Boolean);
    const dot = anchor.querySelector('.status-dot');
    const dotClass = attr(dot, 'class');
    const status =
      clean(attr(dot, 'title')) ||
      (/blue|completed/i.test(dotClass) ? 'Completed' : /green|ongoing/i.test(dotClass) ? 'Ongoing' : '');
    const type = badges[0] || '';
    const year = (badges.find(value => /^(?:19|20)\d{2}$/.test(value)) || '');
    const progress = (badges.find(value => /\d+\s*\/\s*\d+/.test(value))?.match(/\d+\s*\/\s*\d+/) || [''])[0];
    const episodeOnly = badges.find(value => /^\d+$/.test(value) && !/^(?:19|20)\d{2}$/.test(value)) || '';
    const epCount = progress || episodeOnly;
    seen.add(slug);
    out.push({
      id: slug,
      slug,
      provider: 'nontonanime',
      title,
      poster: abs(ROOT, attr(image, 'src') || attr(image, 'data-src')),
      score: '',
      type,
      status,
      epLabel: epCount ? 'Episode ' + epCount : '',
      sub: year,
      sourceUrl: href,
      year
    });
  }
  return out;
}

function detailInfo(doc: Document): Record<string, string> {
  const info: Record<string, string> = {};
  for (const item of Array.from(doc.querySelectorAll('.anime-info-box .info-item'))) {
    const key = clean(txt(item.querySelector('h3'))).toLowerCase();
    const value = clean(txt(item.querySelector('p')));
    if (key && value) info[key] = value;
  }
  return info;
}

function episodeItems(slug: string, episodes: NontonEpisode[]): EpisodeItem[] {
  return episodes
    .filter(ep => Number.isFinite(Number(ep.episode_number)))
    .map(ep => {
      const num = String(ep.episode_number);
      return {
        num,
        id: ROOT + '/' + slug + '-episode-' + num,
        slug: slug + '-episode-' + num,
        date: '',
        title: clean(ep.title)
      };
    })
    .sort((a, b) => Number(a.num) - Number(b.num));
}

function episodeDownloads(ep: NontonEpisode | undefined): DownloadLink[] {
  if (!ep) return [];
  const out: DownloadLink[] = [];
  for (let i = 1; i <= 6; i++) {
    const url = clean((ep as Record<string, unknown>)['download_url_' + i] as string);
    const label = clean((ep as Record<string, unknown>)['download_label_' + i] as string);
    if (/^https?:\/\//i.test(url)) out.push({ quality: label || 'Unduhan', name: label || 'Link', url, availability: 'unverified' });
  }
  return out;
}

export const nontonanime: AnimeProvider = {
  id: 'nontonanime',
  name: 'NontonAnime',
  active: true,
  searchable: true,
  content: 'anime',
  priority: 3,
  desc: 'Katalog dan pemutar NontonAnime; data episode disertakan langsung di halaman.',

  async home() {
    const { text } = await get(ROOT + '/', 12000);
    const cards = parseNontonCards(parseDoc(text));
    if (!cards.length) throw new NetError('Kartu katalog NontonAnime tidak ditemukan.', 'parse');
    const movie = cards.filter(card => /movie/i.test(card.type));
    const series = cards.filter(card => !/movie/i.test(card.type));
    const ongoing = series.filter(card => /ongoing/i.test(card.status));
    const completed = series.filter(card => !/ongoing/i.test(card.status));
    return { ongoing, completed, movie };
  },

  async search(query: string) {
    const { text } = await get(ROOT + '/search?q=' + encodeURIComponent(query), 20000);
    return parseNontonCards(parseDoc(text));
  },

  async detail(id: string): Promise<Detail> {
    const slug = id.replace(/^\/+|\/+$/g, '');
    const { text, url } = await get(ROOT + '/anime/' + encodeURIComponent(slug), 25000);
    const doc = parseDoc(text);
    const title = clean(txt(doc.querySelector('.hero-title, h1')));
    if (!title) throw new NetError('Halaman detail NontonAnime tidak ditemukan.', 'notfound', 404);
    const info = detailInfo(doc);
    const image = doc.querySelector('.hero-poster img, img.anime-poster, meta[property="og:image"]');
    const poster = image instanceof HTMLMetaElement ? abs(url, attr(image, 'content')) : abs(url, attr(image as Element, 'src') || attr(image as Element, 'data-src'));
    const episodes = episodesFrom(text);
    const genres = (info['genres'] || '')
      .split(',')
      .map(name => clean(name))
      .filter(Boolean)
      .map(name => ({ t: name, id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') }));
    const episodeList = episodeItems(slug, episodes);
    const current = pathSlug(url);
    return {
      id: slug,
      slug,
      provider: 'nontonanime',
      title,
      alt: info['japanese title'] || '',
      poster,
      score: info['rating'] || '',
      type: info['type'] || '',
      status: (clean(txt(doc.querySelector('.badge-container .badge-red:last-child'))) || info['status'] || ''),
      year: info['aired'] && info['aired'] !== 'N/A' ? info['aired'] : '',
      episodes: info['episode'] || (episodeList.length ? String(episodeList.length) : ''),
      duration: info['duration'] || '',
      studio: info['studio'] || '',
      genres,
      synopsis: clean(txt(doc.querySelector('.hero-short-description, .hero-info p, meta[name="description"]'))) || 'Sinopsis tidak tersedia.',
      downloads: [],
      episodeList,
      recommendations: parseNontonCards(doc).filter(card => card.slug !== current).slice(0, 12)
    };
  },

  async episodes(id: string) {
    return (await this.detail(id)).episodeList;
  },

  async stream(params): Promise<EpisodeStream> {
    const target = /^https?:/i.test(params.episodeId)
      ? params.episodeId
      : ROOT + '/' + String(params.episodeSlug || params.episodeId).replace(/^\/+|\/+$/g, '');
    const { text, url } = await get(target, 7000);
    const doc = parseDoc(text);
    const title = clean(txt(doc.querySelector('h1'))) || 'Episode ' + (params.episode || '');
    const currentId = clean(txt(doc.querySelector('#yore-episode-id')));
    const episodes = episodesFrom(text);
    const current = episodes.find(ep => currentId && String(ep.id) === currentId) ||
      episodes.find(ep => String(ep.episode_number) === String(params.episode || ''));
    const iframe = doc.querySelector('#video-player-container iframe, .video-player-container iframe, iframe[src*="/stream/"]');
    const iframeUrl = abs(url, attr(iframe, 'data-src') || attr(iframe, 'src'));
    const candidates = [
      { name: clean(current?.server1_name) || 'HD-1', url: current?.video_url || '' },
      { name: clean(current?.server2_name) || 'HD-2', url: current?.video_url2 || '' },
      { name: clean(current?.server3_name) || 'HD-3', url: current?.video_url3 || '' }
    ];
    if (!candidates.some(item => /^https?:/i.test(item.url)) && /^https?:/i.test(iframeUrl)) {
      candidates[0] = { name: 'HD-1', url: iframeUrl };
    }
    const servers = candidates
      .filter(item => /^https?:/i.test(item.url))
      .map((item, index) => ({ name: item.name, id: item.url, def: index === 0 }));
    if (!servers.length) throw new NetError('Halaman episode tidak memiliki pemutar yang terbaca.', 'unavailable');
    return {
      provider: 'nontonanime',
      title,
      playerUrl: servers[0].id,
      sourceKind: 'embed-page',
      qualities: [{ title: 'Server', servers }],
      servers,
      downloads: episodeDownloads(current),
      info: {}
    };
  }
};
