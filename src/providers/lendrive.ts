import { httpGetText, NetError } from '../core/http';
import type { Card, Detail, EpisodeStream, ListResult } from '../core/types';
import {
  attr,
  nodes,
  parseAnimestreamDetail,
  parseBsxCards,
  parseDoc,
  parseSoraDownloads,
  txt
} from './shared';
import type { AnimeProvider } from './types';

const ROOT = 'https://lendrive.web.id';

const get = (path: string) => httpGetText(ROOT + path, { timeout: 20000 });

const toDetail = (id: string, parsed: ReturnType<typeof parseAnimestreamDetail>): Detail => {
  const info = parsed.info;
  return {
    id,
    slug: id,
    provider: 'lendrive',
    title: parsed.title || 'Unknown',
    alt: parsed.alt,
    poster: parsed.poster,
    score: parsed.score || info['score'] || info['rating'] || '',
    type: info['type'] || '',
    status: info['status'] || '',
    year: (info['released'] || info['released on'] || info['aired'] || '').split('to')[0].trim(),
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

export const lendrive: AnimeProvider = {
  id: 'lendrive',
  name: 'Lendrive',
  active: true,
  searchable: true,
  movieOnly: true,
  content: 'anime',
  priority: 70,
  desc: 'Sumber unduhan x265/HEVC lengkap (unduh batch per seri, tanpa server streaming).',

  async home() {
    const { text, url } = await get('/');
    const doc = parseDoc(text);
    let ongoing: Card[] = [];
    let completed: Card[] = [];
    let movie: Card[] = [];
    nodes(doc, '.bixbox').forEach(box => {
      const head = txt(box.querySelector('.releases h3, h2, h3')).toLowerCase();
      const cards = parseBsxCards(box, url, 'lendrive');
      if (!cards.length) return;
      if (/tamat|complete|selesai/.test(head)) completed.push(...cards);
      else if (/movie|film/.test(head)) movie.push(...cards);
      else ongoing.push(...cards);
    });
    if (!ongoing.length) ongoing = parseBsxCards(doc, url, 'lendrive');
    return { ongoing, completed, movie };
  },

  async search(query: string) {
    const { text, url } = await get('/?s=' + encodeURIComponent(query));
    return parseBsxCards(parseDoc(text), url, 'lendrive');
  },

  async detail(id: string) {
    const slug = id.replace(/^\/+|\/+$/g, '');
    const { text, url } = await get(`/anime/${encodeURIComponent(slug)}/`);
    const doc = parseDoc(text);
    const parsed = parseAnimestreamDetail(doc, url, 'lendrive');
    if (!parsed.title) throw new NetError('Halaman detail anime tidak ditemukan.', 'notfound', 404);
    const detail = toDetail(slug, parsed);

    /* Unduhan tersedia di post batch; ambil bila tautannya ada (di-cache lapisan API). */
    const batchHref = attr(doc.querySelector('.eplister a[href*="batch"], a[href*="-batch-"]'), 'href');
    if (batchHref) {
      try {
        const b = await httpGetText(batchHref, { timeout: 20000 });
        detail.downloads = parseSoraDownloads(parseDoc(b.text), b.url);
        detail.batchId = batchHref;
      } catch {
        /* Unduhan bersifat pelengkap — kegagalan memuatnya tidak menggagalkan detail. */
      }
    }
    return detail;
  },

  async episodes(id: string) {
    const d = await this.detail(id);
    return d.episodeList;
  },

  async stream(): Promise<EpisodeStream> {
    throw new NetError(
      'Lendrive adalah sumber unduhan — gunakan bagian Unduhan di halaman detail untuk mengunduh episode.',
      'unavailable'
    );
  },

  async ongoing(page = 1): Promise<ListResult> {
    const path = page > 1 ? `/anime/page/${page}/` : '/anime/';
    const { text, url: finalUrl } = await get(path);
    const doc = parseDoc(text);
    return {
      list: parseBsxCards(doc, finalUrl, 'lendrive'),
      pagination: { currentPage: page, hasNextPage: !!doc.querySelector('a.next.page-numbers, .pagination a.next'), nextPage: page + 1 }
    };
  }
};
