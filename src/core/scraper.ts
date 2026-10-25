import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';

export type Source = 'otakudesu';
export interface ScrapeTask {
  provider: Source;
  action: 'home' | 'search' | 'movies' | 'detail' | 'episode' | 'server' | 'batch' | 'genres' | 'ongoing' | 'completed' | 'genre' | 'schedule';
  query?: string;
  page?: number;
  id?: string;
  slug?: string;
  animeId?: string;
  animeSlug?: string;
  episodeId?: string;
  day?: string;
}
const ROOT: Record<Source, string> = {
  otakudesu: 'https://otakudesu.blog'
};

const clean = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();
const txt = (el: Element | null | undefined) => clean(el?.textContent);
const attr = (el: Element | null | undefined, name: string) => el?.getAttribute(name) || '';
const abs = (base: string, value: string) => {
  try { return value ? new URL(value, base).href : ''; } catch { return ''; }
};
const idFrom = (href: string, marker: string) => href.split(marker)[1]?.split(/[/?#]/)[0] || '';
const card = (title: string, poster: string, href: string, extra: Record<string, string> = {}) => ({
  title, poster, animeId: idFrom(href, '/anime/'), animeSlug: idFrom(href, '/anime/'),
  slug: idFrom(href, '/anime/'), href, ...extra
});
const nodes = (doc: ParentNode, selector: string) => Array.from(doc.querySelectorAll(selector));

export function sourcePath(task: ScrapeTask): string {
  if (task.provider !== 'otakudesu') throw new Error(`Sumber ${task.provider} tidak lagi didukung.`);
  const id = encodeURIComponent(task.id || '');
  const page = Math.max(1, Number(task.page || 1));
  switch (task.action) {
    case 'home': return '/';
    case 'schedule': return '/jadwal-rilis/';
    case 'genres': return '/genre-list/';
    case 'ongoing': return page > 1 ? `/ongoing-anime/page/${page}/` : '/ongoing-anime/';
    case 'completed': return page > 1 ? `/complete-anime/page/${page}/` : '/complete-anime/';
    case 'search': return `/?s=${encodeURIComponent(task.query || '')}&post_type=anime`;
    case 'genre': return page > 1 ? `/genres/${id}/page/${page}/` : `/genres/${id}/`;
    case 'detail': return `/anime/${id}/`;
    case 'episode': return `/episode/${id}/`;
    case 'batch': return `/batch/${id}/`;
    default:
      throw new Error(`Operasi ${task.action} tidak tersedia untuk sumber ${task.provider}.`);
  }
}

function parseCards(doc: Document, base: string): any[] {
  return nodes(doc, '.venz ul li').map(el => {
    const a = el.querySelector('.thumb a') || el.querySelector('a');
    const href = abs(base, attr(a, 'href'));
    /* Di list ongoing .epztipe berisi hari rilis ("Senin"); di list complete berisi rating ("7.65"). */
    const tip = txt(el.querySelector('.epztipe'));
    const isRating = /^\d+(\.\d+)?$/.test(tip);
    return card(txt(el.querySelector('h2.jdlflm')), abs(base, attr(el.querySelector('.thumbz img'), 'src')), href, {
      episodes: txt(el.querySelector('.epz')), latestReleaseDate: txt(el.querySelector('.newnime')),
      score: isRating ? tip : '', releaseDay: isRating ? '' : tip,
      otakudesuUrl: href
    });
  }).filter(x => x.title && x.href);
}

/** Halaman challenge/block Cloudflare. Beacon `/cdn-cgi/challenge-platform/scripts/jsd` ada di halaman normal. */
const CF_CHALLENGE = /_cf_chl_opt|cf-chl-|<title>\s*Just a moment|Enable JavaScript and cookies to continue|Attention Required!/i;

function downloadFormatList(doc: Document, pageUrl: string): any[] {
  const out: any[] = [];
  const visited = new Set<Element>();
  nodes(doc, '.download h4, .download h3, .download2 h4, .download2 h3').forEach(head => {
    if (visited.has(head)) return;
    visited.add(head);
    const next = head.nextElementSibling;
    const section = next && next.tagName.toLowerCase() === 'ul' ? next : head.parentElement?.querySelector('ul') || null;
    if (!section) return;
    const qualityList = nodes(section, 'li')
      .map(li => ({
        title: txt(li.querySelector('strong')),
        size: txt(li.querySelector('i')),
        urlList: nodes(li, 'a').map(a => ({ title: txt(a), url: abs(pageUrl, attr(a, 'href')) })).filter(u => /^https?:/i.test(u.url))
      }))
      .filter(q => q.urlList.length);
    if (qualityList.length) out.push({ title: txt(head), qualityList });
  });
  return out;
}

function otakudesuServerList(doc: Document): any[] {
  return nodes(doc, '.mirrorstream ul').map(ul => {
    const quality = (attr(ul, 'class').match(/m(\d+p)/i) || [])[1] || txt(ul.querySelector('span')).replace(/^Mirror\s*/i, '') || 'default';
    return {
      title: quality,
      serverList: nodes(ul, 'li a[data-content]').map(a => ({
        title: txt(a) || 'Mirror ' + quality,
        serverId: attr(a, 'data-content'),
        default: attr(a, 'data-default') === 'true'
      }))
    };
  }).filter(q => q.serverList.length);
}

export function parseHtml(task: ScrapeTask, html: string, pageUrl: string): any {
  const { action } = task;
  if (CF_CHALLENGE.test(html)) {
    throw new Error('Situs sumber menampilkan pemeriksaan Cloudflare pada jaringan ini.');
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const cards = parseCards(doc, pageUrl);
  if (action === 'genres') return { data: { genreList: nodes(doc, 'ul.genres li a').map(a => ({ title: txt(a), genreId: idFrom(abs(pageUrl, attr(a, 'href')), '/genres/') })) } };
  if (action === 'genre') {
    const animeList = nodes(doc, '.page .col-anime').map(el => { const a = el.querySelector('.col-anime-title a'); const href = abs(pageUrl, attr(a, 'href')); return { title: txt(a), animeId: idFrom(href, '/anime/'), otakudesuUrl: href, poster: abs(pageUrl, attr(el.querySelector('img'), 'src')) }; });
    return { data: { animeList }, pagination: { currentPage: 1, hasNextPage: !!doc.querySelector('.pagination .page-numbers.next') } };
  }
  if (action === 'home') {
    const groups = nodes(doc, '.venz');
    return { data: { ongoing: { animeList: parseCards(groups[0] ? wrap(groups[0]) : doc, pageUrl) }, completed: { animeList: parseCards(groups[1] ? wrap(groups[1]) : doc, pageUrl) } } };
  }
  if (action === 'schedule') return { data: { scheduleList: nodes(doc, '.kglist321').map(day => ({
    title: txt(day.querySelector('h2')), animeList: nodes(day, 'ul li a').map(a => ({ title: txt(a), animeId: idFrom(abs(pageUrl, attr(a, 'href')), '/anime/'), otakudesuUrl: abs(pageUrl, attr(a, 'href')) }))
  })) } };
  if (action === 'search') {
    const searchCards = nodes(doc, '.page .chivsrc li').map(el => {
      const a = el.querySelector('h2 a');
      const href = abs(pageUrl, attr(a, 'href'));
      const img = el.querySelector('img');
      const sets = nodes(el, '.set');
      let genre = '', status = '', score = '';
      sets.forEach((s, i) => {
        const text = clean(s?.textContent);
        if (i === 0) genre = text.replace('Genres', '').replace(':', '').trim();
        else if (i === 1) status = text.replace('Status', '').replace(':', '').trim();
        else if (i === 2) score = text.replace('Rating', '').replace(':', '').trim();
      });
      return card(
        txt(a),
        abs(pageUrl, attr(img, 'src')),
        href,
        { episodes: '', latestReleaseDate: '', otakudesuUrl: href, score, status, type: genre }
      );
    }).filter(x => x.title && x.href);
    return { data: { animeList: searchCards, listAnime: searchCards.map(c => ({ title: c.title, thumbnail: c.poster, url: c.href, endpoint: c.href })) } };
  }
  if (['ongoing', 'completed'].includes(action)) {
    return { data: { animeList: cards, episodeList: cards, sectionList: [{ animeList: cards }] }, pagination: { currentPage: 1, hasNextPage: !!doc.querySelector('.pagination a.next, a.next.page-numbers'), nextPage: 2 } };
  }
  if (action === 'detail') {
    const info = nodes(doc, '.infozingle b');
    const get = (i: number) => txt(info[i]?.nextSibling as Element).replace(/^\s*:\s*/, '');
    const d = { title: get(0), japanese: get(1), score: get(2), producers: get(3), type: get(4), status: get(5), episodes: get(6), duration: get(7), aired: get(8), studios: get(9),
      poster: abs(pageUrl, attr(doc.querySelector('.fotoanime img'), 'src')), synopsis: { paragraphList: nodes(doc, '.sinopc p').map(txt) },
      genreList: nodes(doc, '.infozingle a').map(a => ({ title: txt(a), genreId: idFrom(abs(pageUrl, attr(a, 'href')), '/genres/') })),
      episodeList: nodes(doc, '.episodelist ul li').map(li => {
        const a = li.querySelector('a[href*="/episode/"]');
        if (!a) return null;
        const url = abs(pageUrl, attr(a, 'href'));
        const label = txt(a);
        /* "… Episode 293 Subtitle Indonesia" / slug "…-episode-293-sub-indo" → 293 */
        const num = (label.match(/\bEpisode\s+(\d+)/i) || url.match(/-episode-(\d+)/i) || [])[1] || '';
        return { title: label, episodeId: idFrom(url, '/episode/'), otakudesuUrl: url, num, date: txt(li.querySelector('.zeebr')) };
      }).filter(Boolean),
      /* Blok episodelist pertama (tanpa /episode/) berisi tautan batch. */
      batch: { batchId: idFrom(abs(pageUrl, attr(doc.querySelector('.episodelist a[href*="/batch/"]'), 'href')), '/batch/') },
      recommendedAnimeList: [] };
    return { data: { details: d } };
  }
  if (action === 'episode') {
    const d = { title: txt(doc.querySelector('.venutama h1.posttl')), defaultStreamingUrl: '', server: { qualityList: otakudesuServerList(doc) }, download: { qualityList: downloadFormatList(doc, pageUrl) }, info: {} };
    return { data: { details: d } };
  }
  if (action === 'batch') {
    return { data: { details: { download: { formatList: downloadFormatList(doc, pageUrl) } } } };
  }
  if (cards.length) return { data: { animeList: cards } };
  throw new Error('Struktur halaman sumber tidak dikenali. Situs mungkin berubah atau mengirim halaman challenge.');
}

function wrap(el: Element): Document {
  const d = document.implementation.createHTMLDocument(''); d.body.appendChild(el.cloneNode(true)); return d;
}

export async function scrapeRequest(task: ScrapeTask, timeout = 20000): Promise<any> {
  if (!Capacitor.isNativePlatform()) throw new Error('Pengambilan data scraper hanya tersedia di APK Android. Browser web membatasi akses lintas situs (CORS).');
  if (task.provider !== 'otakudesu') throw new Error(`Sumber ${task.provider} tidak lagi didukung.`);
  if (task.action === 'server') {
    const token = task.id || '';
    try {
      const data = JSON.parse(atob(token.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, string>;
      const referer = String(data.referer || ROOT.otakudesu + '/');
      delete data.referer;
      const ajax = (body: Record<string, string>) => CapacitorHttp.request({
        url: ROOT.otakudesu + '/wp-admin/admin-ajax.php',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Origin: ROOT.otakudesu, Referer: referer },
        data: new URLSearchParams(body).toString(),
        connectTimeout: timeout,
        readTimeout: timeout
      });
      const nonceResp = await ajax({ action: 'aa1208d27f29ca340c92c66d1926f13f' });
      if (!nonceResp.status || nonceResp.status < 200 || nonceResp.status >= 300) throw new Error(`Server streaming menolak permintaan (HTTP ${nonceResp.status}).`);
      const nonce = String((nonceResp.data as { data?: string })?.data || '').trim();
      if (!nonce) throw new Error('Gagal memuat token server streaming Otakudesu.');
      const response = await ajax({ ...data, nonce, action: '2a3505c93b0035d3f455df82bf976b84' });
      if (!response.status || response.status < 200 || response.status >= 300) throw new Error(`Server streaming menolak permintaan (HTTP ${response.status}).`);
      const result = response.data as { data?: string };
      const decoded = atob(String(result.data || '').replace(/-/g, '+').replace(/_/g, '/'));
      const doc = new DOMParser().parseFromString(decoded, 'text/html');
      const url = attr(doc.querySelector('iframe'), 'src');
      return { data: { details: { url: abs(referer, url) } } };
    } catch (e: any) {
      throw new Error(e?.message || 'Gagal membuka server streaming Otakudesu.');
    }
  }
  const url = ROOT[task.provider] + sourcePath(task);
  try {
    const response = await CapacitorHttp.request({
      url,
      method: 'GET',
      headers: { Accept: 'text/html,application/xhtml+xml' },
      connectTimeout: timeout,
      readTimeout: timeout
    });
    const html = response.data as string;
    if (!response.status || response.status < 200 || response.status >= 300) throw new Error(`Situs sumber menolak permintaan (HTTP ${response.status}).`);
    return parseHtml(task, html, url);
  } catch (e: any) {
    if (e?.message?.includes('timeout') || e?.code === 'ETIMEDOUT') throw new Error('Koneksi ke situs sumber timeout.');
    throw e;
  }
}
