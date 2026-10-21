import { httpGetText, NetError } from '../core/http';
import type { Card, Detail, DownloadLink, EpisodeStream, ListResult } from '../core/types';
import {
  attr,
  nodes,
  parseAnimestreamDetail,
  parseBsxCards,
  parseDoc,
  parseIframeEmbeds,
  parseSoraDownloads,
  pathSlug,
  txt
} from './shared';
import type { AnimeProvider } from './types';

const ROOT = 'https://samehadaku.li';

/** Samehadaku ketat terhadap permintaan tanpa konteks halaman. */
const HEADERS = { Referer: ROOT + '/', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };

const get = (path: string) => httpGetText(ROOT + path, { timeout: 20000, headers: HEADERS });

const dedupeCards = (cards: Card[]): Card[] => {
  const seen = new Set<string>();
  return cards.filter(card => {
    const key = card.slug || card.sourceUrl;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const listResult = (cards: Card[], doc: Document, page: number): ListResult => ({
  list: cards,
  pagination: {
    currentPage: page,
    hasNextPage: !!doc.querySelector('a.next.page-numbers, .pagination a.next, a.nextpostslink'),
    nextPage: page + 1
  }
});

const toDetail = (id: string, parsed: ReturnType<typeof parseAnimestreamDetail>): Detail => {
  const info = parsed.info;
  return {
    id,
    slug: id,
    provider: 'samehadaku',
    title: parsed.title || 'Unknown',
    alt: parsed.alt,
    poster: parsed.poster,
    score: parsed.score || info['score'] || info['rating'] || '',
    type: info['type'] || '',
    status: info['status'] || '',
    year: (info['released on'] || info['released'] || '').split('to')[0].trim(),
    episodes: info['episodes'] || (parsed.episodeList.length ? String(parsed.episodeList.length) : ''),
    duration: info['duration'] || '',
    studio: info['studio'] || '',
    genres: parsed.genres,
    synopsis: parsed.synopsis || 'Sinopsis tidak tersedia.',
    downloads: [],
    episodeList: parsed.episodeList,
    recommendations: parsed.recommendations
  };
};

export const samehadaku: AnimeProvider = {
  id: 'samehadaku',
  name: 'Samehadaku',
  active: true,
  searchable: true,
  content: 'anime',
  priority: 30,
  desc: 'Katalog anime lengkap dengan embed langsung di halaman episode.',

  async home() {
    const { text, url } = await get('/');
    const doc = parseDoc(text);
    let explicitOngoing: Card[] = [];
    let latest: Card[] = [];
    let completed: Card[] = [];
    let movie: Card[] = [];
    const boxes = nodes(doc, '.bixbox');
    const roots = boxes.length ? boxes : [doc.documentElement];
    roots.forEach(box => {
      const head = txt(box.querySelector('.releases h2, .releases h3, h2, h3')).toLowerCase();
      const cards = parseBsxCards(box, url, 'samehadaku');
      if (!cards.length) return;
      if (/tamat|complete|selesai/.test(head)) completed.push(...cards);
      else if (/movie|film/.test(head)) movie.push(...cards);
      else if (/ongoing|airing|berjalan/.test(head)) explicitOngoing.push(...cards);
      else latest.push(...cards);
    });
    const ongoing = dedupeCards(explicitOngoing.length ? explicitOngoing : latest);
    if (!ongoing.length) ongoing.push(...parseBsxCards(doc, url, 'samehadaku'));
    return {
      ongoing: dedupeCards(ongoing),
      completed: dedupeCards(completed),
      movie: dedupeCards(movie)
    };
  },

  async search(query: string) {
    const { text, url } = await get('/?s=' + encodeURIComponent(query));
    return parseBsxCards(parseDoc(text), url, 'samehadaku');
  },

  async detail(id: string) {
    const slug = id.replace(/^\/+|\/+$/g, '');
    const { text, url } = await get(`/anime/${encodeURIComponent(slug)}/`);
    const doc = parseDoc(text);
    const parsed = parseAnimestreamDetail(doc, url, 'samehadaku');
    if (!parsed.title) throw new NetError('Halaman detail anime tidak ditemukan.', 'notfound', 404);
    return toDetail(slug, parsed);
  },

  async episodes(id: string) {
    const d = await this.detail(id);
    return d.episodeList;
  },

  async stream(params: { animeId: string; episodeId: string; episode?: string }) {
    const epUrl = /^https?:/i.test(params.episodeId)
      ? params.episodeId
      : `${ROOT}/${params.episodeId.replace(/^\/+/, '')}`;
    const { text, url } = await httpGetText(epUrl, { timeout: 20000, headers: HEADERS });
    const doc = parseDoc(text);
    const title = txt(doc.querySelector('h1.entry-title, h1[itemprop="name"], h1')) || 'Episode ' + (params.episode || '');

    const embeds = parseIframeEmbeds(doc, url);
    if (!embeds.length) throw new NetError('Halaman episode tidak memiliki server streaming.', 'unavailable');

    const servers = embeds.map((e, i) => {
      let name = e.name;
      if (!name || /^Server \d+$/.test(name)) {
        try {
          name = new URL(e.url).hostname.replace(/^www\./, '');
        } catch {
          name = 'Server ' + (i + 1);
        }
      }
      return { name, id: e.url, def: i === 0 };
    });
    const downloads = parseSoraDownloads(doc, url);

    return {
      provider: 'samehadaku',
      title,
      playerUrl: embeds[0].url,
      qualities: [{ title: 'Server', servers }],
      servers,
      downloads,
      info: {}
    } as EpisodeStream;
  },

  async ongoing(page = 1): Promise<ListResult> {
    const url = page > 1 ? `${ROOT}/anime/page/${page}/?status=ongoing` : `${ROOT}/anime/?status=ongoing`;
    const { text, url: finalUrl } = await httpGetText(url, { timeout: 20000, headers: HEADERS });
    const doc = parseDoc(text);
    return listResult(parseBsxCards(doc, finalUrl, 'samehadaku'), doc, page);
  },

  async completed(page = 1): Promise<ListResult> {
    const url = page > 1 ? `${ROOT}/anime/page/${page}/?status=completed` : `${ROOT}/anime/?status=completed`;
    const { text, url: finalUrl } = await httpGetText(url, { timeout: 20000, headers: HEADERS });
    const doc = parseDoc(text);
    return listResult(parseBsxCards(doc, finalUrl, 'samehadaku'), doc, page);
  },

  async movies(page = 1): Promise<ListResult> {
    const url = page > 1 ? `${ROOT}/anime/page/${page}/?type=movie` : `${ROOT}/anime/?type=movie`;
    const { text, url: finalUrl } = await httpGetText(url, { timeout: 20000, headers: HEADERS });
    const doc = parseDoc(text);
    return listResult(parseBsxCards(doc, finalUrl, 'samehadaku'), doc, page);
  },

  async genre(genreId: string, page = 1): Promise<ListResult> {
    const slug = pathSlug(genreId) || genreId.replace(/^\/+|\/+$/g, '');
    const url = page > 1 ? `${ROOT}/genres/${slug}/page/${page}/` : `${ROOT}/genres/${slug}/`;
    const { text, url: finalUrl } = await httpGetText(url, { timeout: 20000, headers: HEADERS });
    const doc = parseDoc(text);
    return listResult(parseBsxCards(doc, finalUrl, 'samehadaku'), doc, page);
  },

  async downloads(params): Promise<DownloadLink[]> {
    const raw = params.episodeId || params.episodeSlug || '';
    if (!raw) return [];
    const target = /^https?:/i.test(raw) ? raw : `${ROOT}/${raw.replace(/^\/+/, '')}`;
    const { text, url } = await httpGetText(target, { timeout: 20000, headers: HEADERS });
    return parseSoraDownloads(parseDoc(text), url);
  }
};
