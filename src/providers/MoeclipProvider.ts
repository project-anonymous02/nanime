import { httpGetText, NetError } from '../core/http';
import type { Card, Detail, EpisodeItem, EpisodeStream } from '../core/types';
import { abs, attr, clean, parseDoc, pathSlug, txt } from './shared';
import type { AnimeProvider } from './types';

const ROOT = 'https://moeclip.com';
const HEADERS = { Referer: ROOT + '/', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
const get = (url: string, timeout = 20000) => httpGetText(url, { timeout, retries: 1, headers: HEADERS });

function parseCards(doc: Document, base: string): Card[] {
  const out: Card[] = [];
  const seen = new Set<string>();
  for (const article of Array.from(doc.querySelectorAll('article.anime'))) {
    const anchor = article.querySelector('.entry-title a[href], h1.entry-title a[href]') as HTMLAnchorElement | null;
    const href = abs(base, attr(anchor, 'href'));
    if (!href || !/\/anime\//.test(href)) continue;
    const slug = pathSlug(href);
    if (!slug || seen.has(slug)) continue;
    const title = clean(txt(anchor));
    if (!title) continue;
    const img = article.querySelector('.featured-thumb img, img');
    const cardClass = attr(article, 'class');
    seen.add(slug);
    out.push({
      id: slug,
      slug,
      provider: 'moeclip',
      title,
      poster: abs(base, attr(img, 'data-src') || attr(img, 'src')),
      score: '',
      type: /type-movie|category-movie/i.test(cardClass) ? 'Movie' : 'TV',
      status: /type-ongoing/i.test(cardClass) ? 'Ongoing' : /type-completed/i.test(cardClass) ? 'Completed' : '',
      epLabel: '',
      sub: '',
      sourceUrl: href
    });
  }
  return out;
}

function detailInfo(doc: Document): Record<string, string> {
  const info: Record<string, string> = {};
  const text = clean(txt(doc.querySelector('.entry-content')));
  const matches = text.matchAll(/(Title|Type|Episodes|Status|Durasi|Rating|Score|Sinopsis)\s*:\s*([^:]*?)(?=\s+(?:Title|Type|Episodes|Status|Durasi|Rating|Score|Sinopsis)\s*:|$)/g);
  for (const match of matches) {
    const value = clean(match[2]);
    if (value) info[match[1].toLowerCase()] = value;
  }
  return info;
}

function episodesOf(doc: Document, base: string): EpisodeItem[] {
  const out: EpisodeItem[] = [];
  for (const anchor of Array.from(doc.querySelectorAll('li.episode-list a[href], .episode-list .tautan-eps a[href]'))) {
    const href = abs(base, attr(anchor, 'href'));
    const slug = pathSlug(href);
    if (!slug) continue;
    const label = clean(txt(anchor));
    const num = (label.match(/\d+/) || slug.match(/-(\d+)-sub-indo/) || ['', ''])[0].replace(/[^\d]/g, '');
    out.push({ num, id: slug, slug, date: '', title: label });
  }
  return out.sort((a, b) => Number(a.num) - Number(b.num));
}

export const moeclip: AnimeProvider = {
  id: 'moeclip',
  name: 'Moeclip',
  active: true,
  searchable: true,
  content: 'anime',
  priority: 7,
  desc: 'Pencarian dan pemutar Moeclip; beranda sumber belum menyediakan daftar katalog.',

  async home() {
    return { ongoing: [], completed: [], movie: [] };
  },

  async search(query: string) {
    const { text, url } = await get(ROOT + '/search/' + encodeURIComponent(query), 20000);
    return parseCards(parseDoc(text), url);
  },

  async detail(id: string): Promise<Detail> {
    const slug = id.replace(/^\/+|\/+$/g, '');
    const { text, url } = await get(ROOT + '/anime/' + encodeURIComponent(slug) + '/', 20000);
    const doc = parseDoc(text);
    const title = clean(txt(doc.querySelector('article.anime h1.entry-title, h1.entry-title')));
    if (!title) throw new NetError('Detail anime Moeclip tidak ditemukan.', 'notfound', 404);
    const info = detailInfo(doc);
    const img = doc.querySelector('.anime-imgx img, .featured-thumb img');
    return {
      id: slug,
      slug,
      provider: 'moeclip',
      title,
      alt: '',
      poster: abs(url, attr(img, 'data-src') || attr(img, 'src')),
      score: info['score'] || info['rating'] || '',
      type: info['type'] || '',
      status: /ongoing/i.test(info['type'] || '') ? 'Ongoing' : info['status'] || '',
      year: '',
      episodes: info['episodes'] || '',
      duration: info['durasi'] || '',
      studio: '',
      genres: [],
      synopsis: info['sinopsis'] || 'Sinopsis tidak tersedia.',
      downloads: [],
      episodeList: episodesOf(doc, url),
      recommendations: parseCards(doc, url)
    };
  },

  async episodes(id: string) {
    return (await this.detail(id)).episodeList;
  },

  async stream(params): Promise<EpisodeStream> {
    const target = /^https?:/i.test(params.episodeId)
      ? params.episodeId
      : ROOT + '/' + String(params.episodeSlug || params.episodeId).replace(/^\/+|\/+$/g, '') + '/';
    const { text, url } = await get(target, 7000);
    const doc = parseDoc(text);
    const embed = abs(url, attr(doc.querySelector('meta[itemprop="embedURL"]'), 'content'));
    if (!/^https?:/i.test(embed)) throw new NetError('Moeclip tidak menyediakan embed untuk episode ini.', 'unavailable');
    const quality = (embed.match(/_(\d{3,4}p)/i) || ['', ''])[1];
    const title = clean(attr(doc.querySelector('meta[itemprop="name"]'), 'content')) || 'Episode ' + (params.episode || '');
    const servers = [{ name: quality ? 'Moeclip ' + quality : 'Moeclip', id: embed, quality, def: true }];
    return {
      provider: 'moeclip',
      title,
      playerUrl: embed,
      sourceKind: 'embed-page',
      qualities: [{ title: quality || 'Server', servers }],
      servers,
      downloads: [],
      info: {}
    };
  },

  async resolveServer(serverId: string) {
    return serverId;
  }
};
