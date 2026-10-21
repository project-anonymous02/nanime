import { httpGetText, NetError } from '../core/http';
import type { Card, Detail, DownloadLink, EpisodeStream } from '../core/types';
import { abs, attr, clean, parseDoc, pathSlug, txt } from './shared';
import type { AnimeProvider } from './types';

const ROOT = 'https://www.nekopoi.web.id';
const HEADERS = { Referer: ROOT + '/', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
const get = (url: string, timeout = 20000) => httpGetText(url, { timeout, retries: 1, headers: HEADERS });

function parsePosts(doc: Document, base: string): Card[] {
  const out: Card[] = [];
  const seen = new Set<string>();
  for (const article of Array.from(doc.querySelectorAll('article.post'))) {
    const anchor = article.querySelector('h2.post-title a, h1.post-title a, .post-title a') as HTMLAnchorElement | null;
    const href = abs(base, attr(anchor, 'href'));
    const title = clean(txt(anchor));
    if (!href || !title || seen.has(href)) continue;
    seen.add(href);
    const img = article.querySelector('img');
    const slug = pathSlug(href);
    out.push({
      id: href,
      slug,
      provider: 'nekopoi',
      title,
      poster: abs(base, attr(img, 'data-src') || attr(img, 'src')),
      score: '',
      type: 'Episode',
      status: '',
      epLabel: (title.match(/episode\s*(\d+)/i) || ['', ''])[1] ? 'Episode ' + (title.match(/episode\s*(\d+)/i) || [])[1] : '',
      sub: 'Sub Indo',
      sourceUrl: href,
      tags: ['Adult'],
      contentRating: '18+'
    });
  }
  return out;
}

function parseDownloads(doc: Document): DownloadLink[] {
  const out: DownloadLink[] = [];
  for (const liner of Array.from(doc.querySelectorAll('.boxdownload .liner'))) {
    const group = clean(txt(liner.querySelector('.name')));
    for (const anchor of Array.from(liner.querySelectorAll('.listlink a'))) {
      const url = attr(anchor, 'href');
      if (!/^https?:\/\//i.test(url)) continue;
      out.push({
        quality: group || 'Unduhan',
        name: clean(txt(anchor)) || 'Link',
        url,
        availability: 'unverified'
      });
    }
  }
  return out;
}

export const nekopoi: AnimeProvider = {
  id: 'nekopoi',
  name: 'Nekopoi',
  active: true,
  searchable: true,
  downloadOnly: true,
  content: 'hentai',
  priority: 60,
  desc: 'Arsip Nekopoi berupa postingan per episode dengan tautan unduhan.',

  async home() {
    return { ongoing: [], completed: [], movie: [] };
  },

  async search(query: string) {
    // Blogger hanya merender kartu hasil pada tampilan mobile; tanpa m=1
    // HTML statis berisi kerangka kosong dan hasil selalu nol.
    const { text, url } = await get(ROOT + '/search?q=' + encodeURIComponent(query) + '&m=1', 20000);
    return parsePosts(parseDoc(text), url);
  },

  async detail(id: string): Promise<Detail> {
    const slug = id.replace(/^\/+|\/+$/g, '');
    const target = /^https?:/i.test(slug) ? slug : /\.html$/i.test(slug) ? ROOT + '/' + slug : '';
    if (!target) throw new NetError('Slug Nekopoi harus berupa URL postingan.', 'notfound', 404);
    const { text, url } = await get(target, 20000);
    const doc = parseDoc(text);
    const title = clean(txt(doc.querySelector('h1.post-title, h1.entry-title, h1')));
    if (!title) throw new NetError('Postingan Nekopoi tidak ditemukan.', 'notfound', 404);
    const article = doc.querySelector('article.post') || doc;
    const img = article.querySelector('img');
    const date = clean(txt(doc.querySelector('.post-date, time, .date-header')));
    return {
      id: pathSlug(url),
      slug: pathSlug(url),
      provider: 'nekopoi',
      title,
      alt: '',
      poster: abs(url, attr(img, 'data-src') || attr(img, 'src')),
      score: '',
      type: 'Episode',
      status: '',
      year: (date.match(/(?:19|20)\d{2}/) || [''])[0],
      episodes: '1',
      duration: '',
      studio: '',
      genres: [],
      synopsis: clean(txt(doc.querySelector('.post-body .summary, .summary'))) || 'Sinopsis tidak tersedia.',
      downloads: parseDownloads(doc),
      episodeList: [{ num: '1', id: pathSlug(url), slug: pathSlug(url), date, title }],
      recommendations: []
    };
  },

  async episodes(id: string) {
    return (await this.detail(id)).episodeList;
  },

  async stream(): Promise<EpisodeStream> {
    throw new NetError('Nekopoi hanya menyediakan tautan unduhan, tanpa server streaming.', 'unavailable');
  },

  async downloads(params) {
    const target = params.episodeSlug || params.episodeId || params.animeSlug || params.animeId || '';
    return (await this.detail(target)).downloads;
  }
};
