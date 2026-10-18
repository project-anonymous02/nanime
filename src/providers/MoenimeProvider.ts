import { httpGetText } from '../core/http';
import type { Card, Detail, DownloadLink, EpisodeStream, ListResult } from '../core/types';
import { parseDoc, parseEpisodeList, pathSlug, txt, attr, abs } from './shared';
import { parseGenericDownloads } from './factory';
import type { AnimeProvider } from './types';

const ROOT = 'https://moenime.com';
const HEADERS = { Referer: ROOT + '/', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
const get = (url: string) => httpGetText(url, { timeout: 15000, retries: 1, headers: HEADERS });

/** Current Moenime cards use `.meownime` and root-level post slugs, not `.bsx`. */
export function parseMoenimeCards(doc: ParentNode): Card[] {
  const out: Card[] = [];
  const seen = new Set<string>();
  for (const el of Array.from(doc.querySelectorAll('article.meownime'))) {
    const link = el.querySelector('.entry-title a[href], a[rel="bookmark"][href]') as HTMLAnchorElement | null;
    const href = link?.href || '';
    const title = txt(link);
    if (!href || !title) continue;
    const url = new URL(href, ROOT);
    if (url.origin !== ROOT) continue;
    const slug = pathSlug(url.href);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const image = el.querySelector('.featured-thumb img, .out-thumb img, img') as HTMLImageElement | null;
    const poster = abs(ROOT, attr(image, 'data-src') || attr(image, 'data-lazy-src') || attr(image, 'src'));
    const classes = String(el.getAttribute('class') || '');
    const score = (classes.match(/\bscore-(\d+)-(\d+)\b/) || []).slice(1).join('.') || '';
    const movie = /\btag-movie\b/.test(classes);
    const status = txt(el.querySelector('.postedon'));
    out.push({
      id: slug,
      slug,
      provider: 'moenime',
      title,
      poster,
      score,
      type: movie ? 'Movie' : 'TV',
      status,
      epLabel: status,
      sub: '',
      sourceUrl: url.href
    });
  }
  return out;
}

function parseMoenimeDownloads(doc: ParentNode, url: string): DownloadLink[] {
  const links = parseGenericDownloads(doc, url, '.post-content, .entry-content, .download, table, .soraddlx, .soraurlx');
  return links.map(link => ({ ...link, availability: 'unverified' }));
}

export const moenime: AnimeProvider = {
  id: 'moenime',
  name: 'Moenime',
  active: true,
  searchable: true,
  downloadOnly: true,
  content: 'anime',
  priority: 999,
  desc: 'Katalog serial/film dan tautan download; tautan ekstrak belum tervalidasi sebagai file.',

  async home() {
    const { text } = await get(ROOT + '/');
    const cards = parseMoenimeCards(parseDoc(text));
    if (!cards.length) throw new Error('Struktur kartu Moenime tidak ditemukan.');
    const movie = cards.filter(card => card.type === 'Movie');
    const series = cards.filter(card => card.type !== 'Movie');
    const ongoing = series.filter(card => /episode|ongoing/i.test(card.status));
    const completed = series.filter(card => !ongoing.includes(card));
    return { ongoing, completed, movie };
  },

  async search(query: string) {
    const path = '/search/' + encodeURIComponent(query).replace(/%20/g, '+');
    const { text } = await get(ROOT + path);
    return parseMoenimeCards(parseDoc(text));
  },

  async detail(id: string): Promise<Detail> {
    const url = /^https?:\/\//i.test(id) ? id : ROOT + '/' + encodeURIComponent(id.replace(/^\/+|\/+$/g, '')) + '/';
    const { text, url: finalUrl } = await get(url);
    const doc = parseDoc(text);
    const title = txt(doc.querySelector('h1.entry-title, h1'));
    if (!title) throw new Error('Halaman detail Moenime tidak berisi judul.');
    const image = doc.querySelector('.featured-thumb img, .thumb img, .entry-content img, img') as HTMLImageElement | null;
    const poster = abs(finalUrl, attr(image, 'data-src') || attr(image, 'data-lazy-src') || attr(image, 'src'));
    const episodeList = parseEpisodeList(doc, finalUrl);
    const genres = Array.from(doc.querySelectorAll('.entry-content a[href*="genre"], .entry-content a[href*="tag"]'))
      .map(anchor => ({ t: txt(anchor), id: pathSlug((anchor as HTMLAnchorElement).href) }))
      .filter(item => item.t);
    return {
      id: pathSlug(finalUrl), slug: pathSlug(finalUrl), provider: 'moenime', title,
      alt: '', poster, score: '', type: /movie/i.test(title) ? 'Movie' : 'TV', status: '', year: '',
      episodes: episodeList.length ? String(episodeList.length) : '', duration: '', studio: '', genres,
      synopsis: txt(doc.querySelector('.entry-content')) || 'Sinopsis tidak tersedia.',
      downloads: parseMoenimeDownloads(doc, finalUrl), episodeList, recommendations: []
    };
  },

  async episodes(id: string) { return (await this.detail(id)).episodeList; },

  async stream(): Promise<EpisodeStream> {
    throw new Error('Moenime menyediakan katalog/download; tidak ada stream langsung yang terverifikasi.');
  },

  async downloads(params) {
    const target = params.episodeId && /^https?:\/\//i.test(params.episodeId)
      ? params.episodeId
      : ROOT + '/' + encodeURIComponent(params.episodeSlug || params.animeSlug || params.animeId || '') + '/';
    const { text, url } = await get(target);
    return parseMoenimeDownloads(parseDoc(text), url);
  },

  async ongoing(page = 1): Promise<ListResult> {
    const url = page > 1 ? ROOT + '/anime-ongoing/page/' + page + '/' : ROOT + '/anime-ongoing/';
    const { text } = await get(url);
    const list = parseMoenimeCards(parseDoc(text));
    return { list, pagination: { currentPage: page, hasNextPage: !!list.length, nextPage: list.length ? page + 1 : null } };
  },

  async completed(page = 1): Promise<ListResult> {
    const url = page > 1 ? ROOT + '/daftar-anime-baru/page/' + page + '/' : ROOT + '/daftar-anime-baru/';
    const { text } = await get(url);
    const list = parseMoenimeCards(parseDoc(text)).filter(card => card.type !== 'Movie');
    return { list, pagination: { currentPage: page, hasNextPage: !!list.length, nextPage: list.length ? page + 1 : null } };
  }
};
