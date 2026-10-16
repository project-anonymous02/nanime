import { httpGetJson, httpGetText, NetError } from '../core/http';
import type { Card, Detail, EpisodeStream, ListResult } from '../core/types';
import {
  attr,
  nodes,
  parseAnimestreamDetail,
  parseBsxCards,
  parseDoc,
  parseIframeEmbed,
  txt
} from './shared';
import type { AnimeProvider } from './types';

const ROOT = 'https://ani-chin.id';

const toDetail = (id: string, parsed: ReturnType<typeof parseAnimestreamDetail>): Detail => {
  const info = parsed.info;
  const year = (info['released on'] || info['released'] || info['aired'] || '').split('to')[0].trim();
  return {
    id,
    slug: id,
    provider: 'anichin',
    title: parsed.title || 'Unknown',
    alt: parsed.alt,
    poster: parsed.poster,
    score: parsed.score || (info['score'] || info['rating'] || ''),
    type: info['type'] || '',
    status: info['status'] || '',
    year,
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

async function resolveAnichinServer(serverId: string): Promise<string> {
  if (/^https?:/i.test(serverId)) return serverId;
  const api = await httpGetJson<{ status?: boolean; url?: string; type?: string }>(
    `${ROOT}/api/theme/episode/source?get=${encodeURIComponent(serverId)}`,
    { timeout: 20000, headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: ROOT + '/' } }
  );
  const url = String(api.data?.url || '');
  if (!api.data?.status || !url) throw new NetError('Server streaming tidak mengembalikan URL.', 'unavailable');
  return url;
}

export const anichin: AnimeProvider = {
  id: 'anichin',
  name: 'Anichin',
  active: true,
  searchable: true,
  priority: 40,
  content: 'donghua',
  desc: 'Donghua & anime China dengan server embed terverifikasi.',

  async home() {
    const { text, url } = await httpGetText(ROOT + '/', { timeout: 20000 });
    const doc = parseDoc(text);
    let ongoing: Card[] = [];
    let completed: Card[] = [];
    let movie: Card[] = [];
    nodes(doc, '.bixbox').forEach(box => {
      const head = txt(box.querySelector('.releases h3, .releases span, h2, h3')).toLowerCase();
      const cards = parseBsxCards(box, url, 'anichin');
      if (!cards.length) return;
      if (/tamat|complete|selesai/.test(head)) completed.push(...cards);
      else if (/movie|film/.test(head)) movie.push(...cards);
      else ongoing.push(...cards);
    });
    if (!ongoing.length) ongoing = parseBsxCards(doc, url, 'anichin');
    return { ongoing, completed, movie };
  },

  async search(query: string) {
    const { text, url } = await httpGetText(`${ROOT}/search?s=${encodeURIComponent(query)}`, { timeout: 20000 });
    return parseBsxCards(parseDoc(text), url, 'anichin');
  },

  async detail(id: string) {
    const slug = id.replace(/^\/+|\/+$/g, '');
    const pageUrl = `${ROOT}/anime/${encodeURIComponent(slug)}/`;
    const { text, url } = await httpGetText(pageUrl, { timeout: 20000 });
    const doc = parseDoc(text);
    const parsed = parseAnimestreamDetail(doc, url, 'anichin');
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
    const { text, url } = await httpGetText(epUrl, { timeout: 20000 });
    const doc = parseDoc(text);

    const title = txt(doc.querySelector('h1.entry-title, h1[itemprop="name"], h1')) || 'Episode ' + (params.episode || '');
    let qualities: EpisodeStream['qualities'] = [];
    let servers: EpisodeStream['servers'] = [];
    let playerUrl = '';

    const serversEl = doc.querySelector('#as-servers[data-episode]');
    const episodeIdApi = attr(serversEl, 'data-episode');
    if (episodeIdApi) {
      const api = await httpGetJson<{ status?: boolean; html?: string; downloads?: string }>(
        `${ROOT}/api/theme/episode/servers?episodeId=${encodeURIComponent(episodeIdApi)}`,
        { timeout: 20000, headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: url } }
      );
      const html = String(api.data?.html || '');
      if (api.data?.status && html) {
        const sdoc = parseDoc(html);
        /* Kelompok server: blok `.ps_*` berjudul kualitas; server = `.server-item a[data-hash]`. */
        const used = new Set<Element>();
        const pushGroup = (label: string, listEl: Element | null) => {
          const items = nodes(listEl || sdoc, '.server-item a[data-hash]').filter(a => !used.has(a));
          if (!items.length) return;
          items.forEach(a => used.add(a));
          qualities.push({
            title: label || 'Server',
            servers: items.map(a => ({
              name: txt(a) || 'Server',
              id: attr(a, 'data-hash'),
              def: a.classList.contains('active')
            }))
          });
        };
        const lists = nodes(sdoc, '.ps__-list, .ps_-list');
        if (lists.length) {
          lists.forEach(list => {
            const block = list.closest('.ps_-block-sub, .ps_-block');
            const label = txt(block?.querySelector('.ps__-title, .ps_-title')) || 'Server';
            pushGroup(label, list);
          });
        } else {
          pushGroup('Server', null);
        }
        qualities.forEach(q =>
          q.servers.forEach(s => {
            if (!servers.some(x => x.id === s.id)) servers.push({ name: s.name, id: s.id, def: s.def, quality: q.title });
          })
        );
        if (servers.length && !servers.some(s => s.def)) servers[0].def = true;
      }
    }

    if (!servers.length) {
      /* Fallback: embed langsung di halaman (bila API tidak tersedia). */
      playerUrl = parseIframeEmbed(doc, url);
      if (playerUrl) servers = [{ name: 'Default', id: playerUrl, def: true }];
    }

    if (!servers.length && !playerUrl) {
      throw new NetError('Halaman episode tidak memiliki server streaming.', 'unavailable');
    }

    if (!playerUrl && servers.length) {
      playerUrl = await resolveAnichinServer(servers.find(s => s.def)?.id || servers[0].id);
    }

    return {
      provider: 'anichin',
      title,
      playerUrl,
      qualities,
      servers,
      downloads: [],
      info: { episodeIdApi }
    } as EpisodeStream;
  },

  resolveServer: (serverId: string) => resolveAnichinServer(serverId),

  async ongoing(page = 1): Promise<ListResult> {
    const url = page > 1 ? `${ROOT}/anime/page/${page}/` : `${ROOT}/anime/`;
    const { text, url: finalUrl } = await httpGetText(url, { timeout: 20000 });
    const doc = parseDoc(text);
    return {
      list: parseBsxCards(doc, finalUrl, 'anichin'),
      pagination: { currentPage: page, hasNextPage: !!doc.querySelector('a.next.page-numbers, .pagination a.next'), nextPage: page + 1 }
    };
  }
};
