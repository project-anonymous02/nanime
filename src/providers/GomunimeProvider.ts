import { httpGetText, NetError } from '../core/http';
import type { Card, Detail, EpisodeItem, EpisodeStream, ListResult } from '../core/types';
import { abs, attr, parseDoc, parseIframeEmbeds, pathSlug, txt } from './shared';
import type { AnimeProvider } from './types';

const ROOT = 'https://gomunime.top';
const get = (url: string) => httpGetText(url, { timeout: 15000, retries: 1, headers: { Referer: ROOT + '/' } });

/** Gomunime's live cards are anchor.card-netflix, independent of the WordPress `.bsx` theme. */
export function parseGomunimeCards(doc: ParentNode, base = ROOT): Card[] {
  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const anchor of Array.from(doc.querySelectorAll('a.card-netflix[href]')) as HTMLAnchorElement[]) {
    const href = abs(base, attr(anchor, 'href'));
    if (!href) continue;
    const url = new URL(href);
    if (url.origin !== ROOT) continue;
    const slug = pathSlug(url.href);
    if (!slug || seen.has(slug)) continue;
    const image = anchor.querySelector('img') as HTMLImageElement | null;
    const title = attr(image, 'alt') || txt(anchor.querySelector('.card-title, h2, h3'));
    if (!title) continue;
    seen.add(slug);
    const raw = txt(anchor);
    const score = (raw.match(/★\s*([\d.]+)/) || [])[1] || '';
    const type = (raw.match(/\b(TV|Movie|OVA|ONA|Special)\b/i) || [])[1] || '';
    const year = (raw.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/) || [])[1] || '';
    const status = /ongoing/i.test(raw) ? 'Ongoing' : /completed|tamat/i.test(raw) ? 'Completed' : '';
    cards.push({
      id: slug, slug, provider: 'gomunime', title,
      poster: abs(base, attr(image, 'data-src') || attr(image, 'src')),
      score, type, status, epLabel: '', sub: year, sourceUrl: url.href,
      classification: ''
    });
  }
  return cards;
}

export const gomunime: AnimeProvider = {
  id: 'gomunime',
  name: 'Gomunime',
  active: true,
  searchable: true,
  content: 'mixed',
  priority: 6,
  desc: 'Katalog, detail, daftar episode, dan server embed. Tidak menyediakan download langsung yang terverifikasi.',

  async home() {
    const { text, url } = await get(ROOT + '/');
    const cards = parseGomunimeCards(parseDoc(text), url);
    if (!cards.length) throw new NetError('Kartu katalog Gomunime tidak ditemukan.', 'parse');
    return {
      ongoing: cards.filter(card => card.type.toLowerCase() !== 'movie' && card.status === 'Ongoing'),
      completed: cards.filter(card => card.type.toLowerCase() !== 'movie' && card.status !== 'Ongoing'),
      movie: cards.filter(card => card.type.toLowerCase() === 'movie')
    };
  },

  async search(query: string) {
    const { text, url } = await get(ROOT + '/search?q=' + encodeURIComponent(query));
    return parseGomunimeCards(parseDoc(text), url);
  },

  async detail(id: string): Promise<Detail> {
    const url = /^https?:\/\//i.test(id) ? id : ROOT + '/' + encodeURIComponent(id.replace(/^\/+|\/+$/g, ''));
    const { text, url: finalUrl } = await get(url);
    const doc = parseDoc(text);
    const title = txt(doc.querySelector('main h1, h1'));
    if (!title) throw new NetError('Halaman detail Gomunime tidak berisi judul.', 'parse');
    const poster = attr(doc.querySelector('meta[property="og:image"]'), 'content');
    const episodeList: EpisodeItem[] = Array.from(doc.querySelectorAll('a.ept[href][data-n]'))
      .map(anchor => {
        const item = anchor as HTMLAnchorElement;
        const href = abs(finalUrl, attr(item, 'href'));
        return { num: attr(item, 'data-n'), id: href, slug: pathSlug(href), date: '', title: txt(item) };
      })
      .filter(ep => ep.num && /^https:\/\//i.test(ep.id));
    const genreNodes = Array.from(doc.querySelectorAll('a[href*="genre"], .genre-tag'));
    const genres = genreNodes.map(node => ({ t: txt(node), id: pathSlug((node as HTMLAnchorElement).href || '') })).filter(item => item.t);
    const type = txt(doc.querySelector('[data-type], .anime-type')) || (/(?:movie|film)/i.test(title) ? 'Movie' : 'TV');
    return {
      id: pathSlug(finalUrl), slug: pathSlug(finalUrl), provider: 'gomunime', title,
      alt: '', poster, score: '', type, status: '', year: '', episodes: episodeList.length ? String(episodeList.length) : '',
      duration: '', studio: '', genres, synopsis: txt(doc.querySelector('[data-synopsis], .synopsis')),
      downloads: [], episodeList, recommendations: parseGomunimeCards(doc, finalUrl)
    };
  },

  async episodes(id: string) { return (await this.detail(id)).episodeList; },

  async stream(params) {
    const target = /^https?:\/\//i.test(params.episodeId)
      ? params.episodeId
      : ROOT + '/' + String(params.episodeSlug || params.episodeId).replace(/^\/+|\/+$/g, '');
    const { text, url } = await get(target);
    const doc = parseDoc(text);
    const title = txt(doc.querySelector('h1'));
    const embeds = parseIframeEmbeds(doc, url);
    if (!embeds.length) throw new NetError('Halaman episode tidak memiliki iframe server yang terbaca.', 'unavailable');
    const servers = embeds.map((embed, index) => ({ name: embed.name || 'Server ' + (index + 1), id: embed.url, def: index === 0 }));
    return {
      provider: 'gomunime', title: title || 'Episode ' + (params.episode || ''),
      playerUrl: embeds[0].url, sourceKind: 'embed-page', qualities: [], servers, downloads: [], info: {}
    };
  }
};
