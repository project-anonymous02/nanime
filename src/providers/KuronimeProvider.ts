import { httpGetText, httpPostJson, NetError } from '../core/http';
import type { Card, Detail, EpisodeItem, EpisodeStream } from '../core/types';
import { abs, attr, clean, parseBsxCards, parseDoc, pathSlug, txt } from './shared';
import type { AnimeProvider } from './types';

const ROOT = 'https://kuronime.sbs';
const API = 'https://animeku.org/api/v9/sources';
const HEADERS = { Referer: ROOT + '/', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
const get = (url: string, timeout = 20000) => httpGetText(url, { timeout, retries: 1, headers: HEADERS });

function decorateCards(doc: Document, base: string): Card[] {
  return parseBsxCards(doc, base, 'kuronime').map(card => {
    const article = Array.from(doc.querySelectorAll('.bsx, .bs')).find(node => node.querySelector(`a[href*="/anime/${card.slug}/"]`));
    const type = clean(txt(article?.querySelector('.bt .type')));
    const score = clean(txt(article?.querySelector('.rating i')));
    return { ...card, type: type || card.type, score: score || card.score, sub: type || card.sub, status: '' };
  });
}

function detailInfo(doc: Document): Record<string, string> {
  const info: Record<string, string> = {};
  for (const item of Array.from(doc.querySelectorAll('.infodetail li'))) {
    const label = clean(txt(item.querySelector('b'))).toLowerCase();
    const value = clean(txt(item)).replace(/^[^:]+:\s*/, '');
    if (label && value) info[label] = value;
  }
  return info;
}

function episodesOf(doc: Document, base: string): EpisodeItem[] {
  const out: EpisodeItem[] = [];
  const seen = new Set<string>();
  for (const anchor of Array.from(doc.querySelectorAll('.bixbox.bxcl a[href*="/nonton-"], .bixbox .lchx a[href*="/nonton-"]'))) {
    const href = abs(base, attr(anchor, 'href'));
    const slug = pathSlug(href);
    if (!slug || seen.has(slug)) continue;
    const label = clean(txt(anchor)) || slug;
    const num = (label.match(/\d+/) || slug.match(/episode-(\d+)/) || ['', ''])[0].replace(/[^\d]/g, '');
    seen.add(slug);
    out.push({ num, id: href, slug, date: '', title: label });
  }
  return out.sort((a, b) => Number(a.num) - Number(b.num));
}

export const kuronime: AnimeProvider = {
  id: 'kuronime',
  name: 'Kuronime',
  active: true,
  searchable: true,
  content: 'anime',
  priority: 8,
  desc: 'Katalog Kuronime dengan daftar episode lengkap; pemutar diteruskan ke server sumber.',

  async home() {
    const [ongoingPage, moviePage] = await Promise.all([
      get(ROOT + '/ongoing-anime/', 12000),
      get(ROOT + '/movies/', 12000)
    ]);
    const ongoing = decorateCards(parseDoc(ongoingPage.text), ongoingPage.url).map(card => ({ ...card, status: 'Ongoing' }));
    const movie = decorateCards(parseDoc(moviePage.text), moviePage.url).map(card => ({ ...card, type: 'Movie' }));
    if (!ongoing.length && !movie.length) throw new NetError('Katalog Kuronime kosong.', 'parse');
    return { ongoing, completed: [], movie };
  },

  async search(query: string) {
    const { text, url } = await get(ROOT + '/?s=' + encodeURIComponent(query), 20000);
    return decorateCards(parseDoc(text), url);
  },

  async detail(id: string): Promise<Detail> {
    const slug = id.replace(/^\/+|\/+$/g, '');
    const { text, url } = await get(ROOT + '/anime/' + encodeURIComponent(slug) + '/', 25000);
    const doc = parseDoc(text);
    const title = clean(txt(doc.querySelector('.info-header h1.entry-title, h1.entry-title')));
    if (!title) throw new NetError('Detail anime Kuronime tidak ditemukan.', 'notfound', 404);
    const info = detailInfo(doc);
    const img = doc.querySelector('.main-info .l img, .main-info img');
    const synopsis = clean(txt(doc.querySelector('.main-info .conx'))) || 'Sinopsis tidak tersedia.';
    const genreNodes = Array.from(doc.querySelectorAll('.infodetail li a[rel="tag"]'));
    return {
      id: slug,
      slug,
      provider: 'kuronime',
      title,
      alt: info['judul'] || '',
      poster: abs(url, attr(img, 'data-src') || attr(img, 'src')),
      score: clean(txt(doc.querySelector('.rating i'))) || '',
      type: info['tipe'] || '',
      status: info['status'] || '',
      year: (info['tayang'] || '').match(/(?:19|20)\d{2}/)?.[0] || '',
      episodes: String(episodesOf(doc, url).length || ''),
      duration: info['durasi'] || '',
      studio: info['studio'] || '',
      genres: genreNodes.map(node => ({ t: clean(txt(node)), id: pathSlug(abs(url, attr(node, 'href'))) })),
      synopsis,
      downloads: [],
      episodeList: episodesOf(doc, url),
      recommendations: []
    };
  },

  async episodes(id: string) {
    return (await this.detail(id)).episodeList;
  },

  async stream(params): Promise<EpisodeStream> {
    const target = /^https?:/i.test(params.episodeId)
      ? params.episodeId
      : ROOT + '/nonton-' + String(params.episodeSlug || params.episodeId).replace(/^\/+|\/+$/g, '') + '/';
    const { text, url } = await get(target, 7000);
    const doc = parseDoc(text);
    const token = (text.match(/var\s+_0xa100d42aa\s*=\s*["']([^"']+)["']/) || ['', ''])[1];
    const xenHash = (text.match(/var\s+xenHash\s*=\s*["']([^"']+)["']/) || ['', ''])[1];
    if (!token) throw new NetError('Token pemutar Kuronime tidak ditemukan.', 'parse');
    const response = await httpPostJson<{ status?: number; src?: string }>(API, { id: token }, {
      timeout: 5000,
      retries: 0,
      headers: { ...HEADERS, 'Content-Type': 'application/json', Origin: ROOT }
    });
    const src = clean((response.data || {}).src);
    if (!src) throw new NetError('Server Kuronime tidak mengembalikan sumber pemutaran.', 'unavailable');
    const embed = xenHash === 'awar'
      ? 'https://blog.animeku.org/player2.php?id=' + encodeURIComponent(src)
      : 'https://player.animeku.org/?data=' + encodeURIComponent(src);
    const episodeTitle = clean(txt(doc.querySelector('h1.entry-title, h1')));
    const servers = [{ name: 'Kuronime', id: embed, def: true }];
    return {
      provider: 'kuronime',
      title: episodeTitle || 'Episode ' + (params.episode || ''),
      playerUrl: embed,
      sourceKind: 'embed-page',
      qualities: [{ title: 'Server', servers }],
      servers,
      downloads: [],
      info: {}
    };
  },

  async resolveServer(serverId: string) {
    return serverId;
  }
};
