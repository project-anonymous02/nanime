import { httpGetText, NetError } from '../core/http';
import type { Detail, EpisodeStream, ListResult } from '../core/types';
import {
  attr,
  nodes,
  parseAnimestreamDetail,
  parseBsxCards,
  parseDoc,
  parseIframeEmbeds,
  parseSoraDownloads,
  txt
} from './shared';
import type { AnimeProvider } from './types';

const ROOT = 'https://samehadaku.li';

/** Samehadaku ketat terhadap permintaan tanpa konteks halaman. */
const HEADERS = { Referer: ROOT + '/', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };

const get = (path: string) => httpGetText(ROOT + path, { timeout: 20000, headers: HEADERS });

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
    let ongoing: ReturnType<typeof parseBsxCards> = [];
    let completed: ReturnType<typeof parseBsxCards> = [];
    let movie: ReturnType<typeof parseBsxCards> = [];
    nodes(doc, '.bixbox').forEach(box => {
      const head = txt(box.querySelector('.releases h3, h2, h3')).toLowerCase();
      const cards = parseBsxCards(box, url, 'samehadaku');
      if (!cards.length) return;
      if (/tamat|complete|selesai/.test(head)) completed.push(...cards);
      else if (/movie|film/.test(head)) movie.push(...cards);
      else ongoing.push(...cards);
    });
    if (!ongoing.length) ongoing = parseBsxCards(doc, url, 'samehadaku');
    return { ongoing, completed, movie };
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
    const url = page > 1 ? `${ROOT}/page/${page}/` : `${ROOT}/`;
    const { text, url: finalUrl } = await httpGetText(url, { timeout: 20000, headers: HEADERS });
    const doc = parseDoc(text);
    return {
      list: parseBsxCards(doc, finalUrl, 'samehadaku'),
      pagination: {
        currentPage: page,
        hasNextPage: !!doc.querySelector('a.next.page-numbers, .pagination a.next, a.nextpostslink'),
        nextPage: page + 1
      }
    };
  }
};
