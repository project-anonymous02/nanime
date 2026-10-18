import { httpGetText, NetError } from '../core/http';
import type { Card, Detail, DownloadLink, EpisodeItem, EpisodeStream, ListResult } from '../core/types';
import {
  abs,
  attr,
  clean,
  detailHrefFromCard,
  nodes,
  parseAnimestreamDetail,
  parseBsxCards,
  parseContentMetadata,
  parseDoc,
  parseEpisodeList,
  parseIframeEmbeds,
  parseSoraDownloads,
  pathSlug,
  seriesSlugFromPost,
  txt
} from './shared';
import type { AnimeProvider } from './types';

/**
 * Pabrik adapter HTML generik untuk keluarga tema ala "animestream"/"themeresia"
 * (Anoboy, Animekuindo, Samehadaku, Animekulol, Animebatch, dsb.).
 * Semua penanganan galat dinaikkan sebagai NetError agar aggregator bisa fallback.
 */
export interface HtmlProviderConfig {
  id: string;
  name: string;
  root: string;
  priority: number;
  desc: string;
  /** Hanya menyediakan tautan unduh, tanpa server streaming. */
  downloadOnly?: boolean;
  content?: 'anime' | 'donghua' | 'hentai' | 'mixed';
  /** Path pencarian; default `/?s=`. */
  searchPath?: (q: string) => string;
  /** Path detail; default `/anime/<slug>/`. */
  detailPath?: (id: string) => string;
  /** URL halaman episode dari id yang disimpan di EpisodeItem.id (href absolut atau slug). */
  episodeUrl?: (id: string, episode?: string) => string;
  headers?: Record<string, string>;
  /** Selektor iframe khusus bila tema tidak memakai `.player-embed`. */
  embedSelector?: string;
  /** Blok unduhan khusus (.soraddlx bawaan). */
  downloadSelector?: string;
  /** Ekstrak jumlah episode halaman ./daftar bila eplister tidak ada. */
  listPath?: string;
  /** Nama server/quality default. */
  serverLabel?: string;
}

function makeGet(cfg: HtmlProviderConfig) {
  return (url: string, headers?: Record<string, string>) =>
    httpGetText(url, { timeout: 20000, headers: { ...(cfg.headers || {}), ...(headers || {}) } });
}

/** Deteksi halaman blokir ISP/Cloudflare agar pesan jujur. */
function guardBlocked(html: string): void {
  if (/Internet Positif|Internet Sehat|trustpositif|kominfo\.go\.id/i.test(html)) {
    throw new NetError('Situs sumber diblokir oleh jaringan (Internet Positif).', 'blocked');
  }
}

/** Kartu hasil untuk tema selain bsx (fallback generik via tautan poster). */
function parseGenericCards(doc: ParentNode, base: string, provider: string): Card[] {
  const out: Card[] = [];
  const seen = new Set<string>();
  const anchors = Array.from(doc.querySelectorAll('a[href]')) as HTMLAnchorElement[];
  for (const a of anchors) {
    const href = abs(base, attr(a, 'href'));
    if (!href || !/\/(anime|tv|movie|series|donghua)\//i.test(href)) continue;
    const img = (a.querySelector('img') || a.parentElement?.querySelector('img')) as HTMLImageElement | null;
    const title =
      clean(a.getAttribute('title')) ||
      clean(img?.getAttribute('alt')) ||
      clean(a.querySelector('h2,h3,.title,.tt,.entry-title,.card-title')?.textContent);
    if (!title || title.length < 2) continue;
    const poster = abs(base, attr(img, 'data-src') || attr(img, 'src') || attr(img, 'data-lazy-src'));
    const resolved = detailHrefFromCard(href);
    const key = resolved.slug + ':' + title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: resolved.slug,
      provider,
      title,
      poster,
      score: '',
      type: '',
      status: clean(a.querySelector('.epx,.status')?.textContent),
      epLabel: clean(a.querySelector('.epx,.ep,.episode')?.textContent),
      sub: '',
      sourceUrl: resolved.href,
      slug: resolved.slug,
      ...parseContentMetadata(a.parentElement || a)
    });
  }
  return out;
}

function parseCardList(doc: ParentNode, base: string, provider: string): Card[] {
  const bsx = parseBsxCards(doc, base, provider);
  return bsx.length ? bsx : parseGenericCards(doc, base, provider);
}

export function makeHtmlProvider(cfg: HtmlProviderConfig): AnimeProvider {
  const get = makeGet(cfg);
  const root = cfg.root.replace(/\/+$/, '');
  const searchPath = cfg.searchPath || ((q: string) => '/?s=' + encodeURIComponent(q));
  const detailPath = cfg.detailPath || ((id: string) => '/anime/' + encodeURIComponent(id.replace(/^\/+|\/+$/g, '')) + '/');
  const episodeUrl =
    cfg.episodeUrl ||
    ((id: string, episode?: string) => {
      if (/^https?:/i.test(id)) return id;
      void episode;
      return root + '/' + String(id).replace(/^\/+/, '');
    });

  const toDetail = (id: string, parsed: ReturnType<typeof parseAnimestreamDetail>): Detail => {
    const info = parsed.info;
    return {
      id,
      slug: id,
      provider: cfg.id,
      title: parsed.title || 'Unknown',
      alt: parsed.alt,
      poster: parsed.poster,
      score: parsed.score || info['score'] || info['rating'] || '',
      type: info['type'] || '',
      status: info['status'] || '',
      year: (info['released on'] || info['released'] || info['aired'] || info['tanggal rilis'] || '').split('to')[0].trim(),
      episodes: info['episodes'] || info['total episode'] || (parsed.episodeList.length ? String(parsed.episodeList.length) : ''),
      duration: info['duration'] || '',
      studio: info['studio'] || info['studios'] || '',
      genres: parsed.genres,
      synopsis: parsed.synopsis || 'Sinopsis tidak tersedia.',
      downloads: [],
      episodeList: parsed.episodeList,
      recommendations: parsed.recommendations
    };
  };

  const self: AnimeProvider = {
    id: cfg.id,
    name: cfg.name,
    active: true,
    searchable: true,
    downloadOnly: !!cfg.downloadOnly,
    priority: cfg.priority,
    desc: cfg.desc,
    content: cfg.content || 'anime',

    async home() {
      const { text, url } = await get(root + '/');
      guardBlocked(text);
      const doc = parseDoc(text);
      const ongoing = parseCardList(doc, url, cfg.id);
      if (!ongoing.length) throw new NetError('Halaman utama tidak berisi daftar anime.', 'parse');
      const half = Math.max(1, Math.floor(ongoing.length / 2));
      return { ongoing: ongoing.slice(0, half), completed: ongoing.slice(half), movie: [] };
    },

    async search(query: string) {
      const { text, url } = await get(root + searchPath(query));
      guardBlocked(text);
      return parseCardList(parseDoc(text), url, cfg.id);
    },

    async detail(id: string) {
      const slug = id.replace(/^\/+|\/+$/g, '');
      const { text, url } = await get(root + detailPath(slug));
      guardBlocked(text);
      const doc = parseDoc(text);
      const parsed = parseAnimestreamDetail(doc, url, cfg.id);
      if (!parsed.title) throw new NetError('Halaman detail anime tidak ditemukan.', 'notfound', 404);
      return toDetail(slug, parsed);
    },

    async episodes(id: string) {
      return (await self.detail(id)).episodeList;
    },

    async stream(params) {
      if (cfg.downloadOnly) {
        throw new NetError(
          cfg.name + ' adalah sumber unduhan — buka tab Download di halaman episode.',
          'unavailable'
        );
      }
      const target = episodeUrl(params.episodeId || params.episodeSlug || '', params.episode);
      const { text, url } = await get(target);
      guardBlocked(text);
      const doc = parseDoc(text);
      const title = txt(doc.querySelector('h1.entry-title, h1[itemprop="name"], h1')) || 'Episode ' + (params.episode || '');

      let embeds = parseIframeEmbeds(doc, url);
      if (!embeds.length && cfg.embedSelector) {
        embeds = nodes(doc, cfg.embedSelector)
          .map((f, i) => ({
            name: attr(f, 'title') || attr(f, 'name') || (cfg.serverLabel || 'Server') + ' ' + (i + 1),
            url: abs(url, attr(f, 'data-src') || attr(f, 'data-litespeed-src') || attr(f, 'src'))
          }))
          .filter(e => /^https?:/i.test(e.url));
      }
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

      let downloads = parseSoraDownloads(doc, url);
      if (!downloads.length && cfg.downloadSelector) downloads = parseGenericDownloads(doc, url, cfg.downloadSelector);

      return {
        provider: cfg.id,
        title,
        playerUrl: embeds[0].url,
        qualities: [{ title: 'Server', servers }],
        servers,
        downloads,
        info: {}
      } as EpisodeStream;
    },

    async ongoing(page = 1): Promise<ListResult> {
      const path = page > 1 ? `/page/${page}/` : '/';
      const { text, url: finalUrl } = await get(root + path);
      guardBlocked(text);
      const doc = parseDoc(text);
      return {
        list: parseCardList(doc, finalUrl, cfg.id),
        pagination: {
          currentPage: page,
          hasNextPage: !!doc.querySelector('a.next.page-numbers, .pagination a.next, a.nextpostslink'),
          nextPage: page + 1
        }
      };
    },

    /** Unduhan dari halaman detail/batch (dipakai FallbackEngine untuk provider unduhan). */
    async downloads(params): Promise<DownloadLink[]> {
      const target = episodeUrl(params.episodeId || params.animeSlug || params.animeId || '', params.episode);
      try {
        const { text, url } = await get(target);
        const doc = parseDoc(text);
        const sora = parseSoraDownloads(doc, url);
        if (sora.length) return sora;
        return parseGenericDownloads(doc, url, cfg.downloadSelector || '.soraddlx, .soraurlx, table');
      } catch {
        return [];
      }
    }
  };

  return self;
}

/** Unduhan dari tabel/host generik (Gofile, Pixeldrain, Mediafire, Acefile, dll.). */
export function parseGenericDownloads(doc: ParentNode, base: string, selector: string): DownloadLink[] {
  const out: DownloadLink[] = [];
  const scope = nodes(doc, selector);
  const roots = scope.length ? scope : nodes(doc, 'body');
  roots.forEach(block => {
    const headerEl = block.querySelector('.sorattlx, b, strong, h3, h4, .title, td');
    const quality = clean(headerEl?.textContent) || '';
    nodes(block, 'a[href]').forEach(a => {
      const url = abs(base, attr(a, 'href'));
      if (!/^https?:\/\//i.test(url)) return;
      if (!/gofile|pixeldrain|mediafire|acefile|mega|maou|megaup|hxfile|terabox|drive\.google|mir\.cr|sfile|zippy|1fichier|krakenfiles|soracity|desustream|douploads|uptobox|racaty|files\.im|disk|dl\.|download/i.test(url)) return;
      const name = clean(a.textContent) || clean(a.getAttribute('title')) || 'Link';
      out.push({ quality: quality || 'Unduhan', name, url });
    });
  });
  /* Dedupe by url. */
  const seen = new Set<string>();
  return out.filter(l => (seen.has(l.url) ? false : (seen.add(l.url), true)));
}

export { pathSlug, seriesSlugFromPost };
export type { EpisodeItem };
