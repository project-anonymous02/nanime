import { httpGetText, NetError } from '../core/http';
import type { Card, Detail, EpisodeItem, EpisodeStream, ListResult } from '../core/types';
import { abs, attr, clean, nodes, parseDoc, pathSlug, txt } from './shared';
import type { AnimeProvider } from './types';

const ROOT = 'https://ww2.animeku.lol';
const HEADERS = { Referer: ROOT + '/' };

const get = (path: string) => httpGetText(ROOT + path, { timeout: 20000, headers: HEADERS });

const detailPath = (slug: string): string => {
  const segments = slug
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
    .map(segment => {
      try {
        return encodeURIComponent(decodeURIComponent(segment));
      } catch {
        return encodeURIComponent(segment);
      }
    });
  return '/' + segments.join('/') + '/';
};

/**
 * Hasil pencarian saja. Halaman "tidak ditemukan" tetap menampilkan blok
 * "Anime Terbaru"; blok itu bukan hasil pencarian dan tidak boleh dikembalikan.
 */
export function parseSearchCards(doc: Document, base: string): Card[] {
  if (doc.body?.classList.contains('search-no-results') || doc.querySelector('.aku-pengantar')) return [];
  const main = doc.querySelector('main.aku-ruang') || doc;
  const directGrid = Array.from(main.children).find(el => el.classList.contains('aku-petak'));
  const grid = directGrid || main.querySelector('.aku-petak');
  return grid ? parseSeriesCards(grid, base) : [];
}

export function parseSeriesCards(doc: ParentNode, base: string): Card[] {
  const out: Card[] = [];
  const seen = new Set<string>();
  for (const article of nodes(doc, 'article.aku-sel')) {
    const anchor = (article.querySelector('a.aku-bing') || article.querySelector('h3 a') || article.querySelector('a[href]')) as HTMLAnchorElement | null;
    const href = abs(base, attr(anchor, 'href'));
    const slug = pathSlug(href);
    if (!href || !slug || seen.has(slug)) continue;
    const title = clean(txt(article.querySelector('h3 a')) || attr(article.querySelector('img'), 'alt'));
    if (!title) continue;
    seen.add(slug);
    out.push({
      id: slug,
      slug,
      provider: 'animeku',
      title,
      poster: abs(base, attr(article.querySelector('img'), 'data-src') || attr(article.querySelector('img'), 'src')),
      score: clean(txt(article.querySelector('.aku-nilai'))),
      type: /^movie$/i.test(clean(txt(article.querySelector('.aku-eps')))) ? 'Movie' : '',
      status: '',
      epLabel: clean(txt(article.querySelector('.aku-eps'))),
      sub: '',
      sourceUrl: href
    });
  }
  return out;
}

function facts(doc: Document): Record<string, string> {
  const out: Record<string, string> = {};
  nodes(doc, '.aku-fakta-b').forEach(row => {
    const key = clean(txt(row.querySelector('.aku-fakta-k'))).toLowerCase();
    const value = clean(txt(row.querySelector('.aku-fakta-v')));
    if (key && value) out[key] = value;
  });
  return out;
}

function capNumbers(doc: Document): { episodes: string; score: string; status: string; studio: string } {
  const caps = nodes(doc, '.aku-kepala .aku-cap span, .aku-kepala .aku-cap li, .aku-cap span').map(txt).filter(Boolean);
  let episodes = '';
  let score = '';
  let status = '';
  for (const cap of caps) {
    const ep = cap.match(/(\d+)\s*episode/i);
    if (ep) episodes = ep[1];
    const rating = cap.match(/[★\u2605]\s*([\d.]+)/);
    if (rating) score = rating[1];
    if (/airing|ongoing|completed|finished|tamat/i.test(cap) && !/episode/i.test(cap)) status = cap;
  }
  return { episodes, score, status, studio: '' };
}

function episodeNumber(text: string, href: string): string {
  return (href.match(/-episode-(\d+)/i) || [])[1] || (text.match(/(?:eps?|episode)\s*(\d+(?:\.\d+)?)/i) || [])[1] || '';
}

export function parseAnimekuDetail(doc: Document, pageUrl: string): Detail {
  const heading = clean(txt(doc.querySelector('h1')));
  const title = heading
    .replace(/^nonton\s+/i, '')
    .replace(/\s+sub\s*indo(\s+hd)?$/i, '')
    .replace(/\s+hd$/i, '')
    .trim();
  const info = facts(doc);
  const caps = capNumbers(doc);
  const episodeList: EpisodeItem[] = [];
  const seen = new Set<string>();
  for (const anchor of nodes(doc, '.aku-eplist a[href*="/play/"], .aku-epwl a[href*="/play/"]')) {
    const href = abs(pageUrl, attr(anchor, 'href'));
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const text = txt(anchor);
    episodeList.push({
      num: episodeNumber(text, href),
      id: href,
      slug: pathSlug(href),
      date: '',
      title: text || 'Episode'
    });
  }
  const genres = nodes(doc, '.aku-fakta a[href*="/genre/"]').map(a => ({
    t: txt(a),
    id: pathSlug(abs(pageUrl, attr(a, 'href')))
  }));
  const synopsis = clean(nodes(doc, '.aku-sinopsis p, .aku-cerita p, .aku-desc p, .aku-kepala p').map(p => txt(p)).join('\n\n'));
  const poster = abs(pageUrl, attr(doc.querySelector('.aku-kepala img, .aku-poster img, .aku-thumb img, article img'), 'data-src') || attr(doc.querySelector('.aku-kepala img, .aku-poster img, .aku-thumb img, article img'), 'src'));
  const score = caps.score || (clean(txt(doc.querySelector('.aku-nilai, .aku-skor, .rating'))).match(/[\d.]+/) || [])[0] || '';
  return {
    id: pathSlug(pageUrl),
    slug: pathSlug(pageUrl),
    provider: 'animeku',
    title: title || 'Unknown',
    alt: '',
    poster,
    score,
    type: info['tipe'] || info['type'] || '',
    status: caps.status || info['status'] || '',
    year: (info['tahun'] || info['rilis'] || info['released'] || '').match(/(?:19|20)\d{2}/)?.[0] || '',
    episodes: caps.episodes || (episodeList.length ? String(episodeList.length) : ''),
    duration: info['durasi'] || info['duration'] || '',
    studio: info['studio'] || caps.studio,
    genres,
    synopsis: synopsis || 'Sinopsis tidak tersedia.',
    downloads: [],
    episodeList,
    recommendations: []
  };
}

function parseList(doc: ParentNode, pageUrl: string, page: number): ListResult {
  return {
    list: parseSeriesCards(doc, pageUrl),
    pagination: {
      currentPage: page,
      hasNextPage: !!doc.querySelector('a.next.page-numbers, .pagination a.next, a.nextpostslink'),
      nextPage: page + 1
    }
  };
}

async function listPage(path: string, page: number): Promise<ListResult> {
  const target = page > 1 ? `${path}page/${page}/` : path;
  const { text, url } = await get(target);
  const doc = parseDoc(text);
  const result = parseList(doc, url, page);
  if (!result.list.length) throw new NetError('Daftar anime tidak ditemukan.', 'parse');
  return result;
}

export const animeku: AnimeProvider = {
  id: 'animeku',
  name: 'Animeku',
  active: true,
  searchable: true,
  content: 'anime',
  priority: 40,
  desc: 'Fallback terakhir untuk melengkapi data yang tidak tersedia di sumber utama.',

  async home() {
    const { text, url } = await get('/');
    const doc = parseDoc(text);
    const ongoing = parseSeriesCards(doc, url);
    if (!ongoing.length) throw new NetError('Halaman utama tidak berisi daftar anime.', 'parse');
    return { ongoing: ongoing.slice(0, 24), completed: [], movie: [] };
  },

  async search(query: string) {
    const { text, url } = await get('/?s=' + encodeURIComponent(query));
    return parseSearchCards(parseDoc(text), url);
  },

  async detail(id: string) {
    const slug = id.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+|\/+$/g, '');
    const { text, url } = await get(detailPath(slug));
    const doc = parseDoc(text);
    const parsed = parseAnimekuDetail(doc, url);
    if (!parsed.title || parsed.title === 'Unknown') throw new NetError('Halaman detail anime tidak ditemukan.', 'notfound', 404);
    return { ...parsed, id: slug, slug };
  },

  async episodes(id: string) {
    return (await this.detail(id)).episodeList;
  },

  async stream(params) {
    const raw = params.episodeId || params.episodeSlug || '';
    const relative = raw.replace(/^\/+/, '');
    const target = /^https?:/i.test(raw)
      ? raw
      : ROOT + '/' + (/^play\//i.test(relative) ? relative : 'play/' + relative);
    const { text, url } = await httpGetText(target, { timeout: 20000, headers: HEADERS });
    const doc = parseDoc(text);
    const title = clean(txt(doc.querySelector('h1.aku-nama-eps, h1.entry-title, h1'))) || 'Episode ' + (params.episode || '');
    const embeds = nodes(doc, '.aku-layar iframe, #pembed iframe, .player-embed iframe, iframe')
      .map((f, i) => ({
        name: attr(f, 'title') || attr(f, 'name') || 'Server ' + (i + 1),
        url: abs(url, attr(f, 'data-src') || attr(f, 'data-litespeed-src') || attr(f, 'src'))
      }))
      .filter(item => /^https?:/i.test(item.url));
    if (!embeds.length) throw new NetError('Halaman episode tidak memiliki server streaming.', 'unavailable');
    const servers = embeds.map((item, i) => ({ name: item.name, id: item.url, def: i === 0 }));
    return {
      provider: 'animeku',
      title,
      playerUrl: embeds[0].url,
      qualities: [{ title: 'Server', servers }],
      servers,
      downloads: [],
      info: {}
    } as EpisodeStream;
  },

  async ongoing(page = 1): Promise<ListResult> {
    return listPage('/baru-utnwb9y/', page);
  },

  async completed(page = 1): Promise<ListResult> {
    return listPage('/selesai-bjyzaqn/', page);
  },

  async movies(page = 1): Promise<ListResult> {
    return listPage('/film-anime-6d23pb8/', page);
  }
};
