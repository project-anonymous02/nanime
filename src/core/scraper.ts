import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';

export type Source = 'otakudesu' | 'oploverz' | 'kuramanime' | 'kusonime';
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
  otakudesu: 'https://otakudesu.blog',
  oploverz: 'https://oploverz.am',
  kuramanime: 'https://kuramanime.ing',
  kusonime: 'https://kusonime.com'
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
  const { provider, action } = task;
  const id = encodeURIComponent(task.id || '');
  const page = Math.max(1, Number(task.page || 1));
  if (provider === 'otakudesu') {
    if (action === 'home') return '/';
    if (action === 'schedule') return '/jadwal-rilis/';
    if (action === 'genres') return '/genre-list/';
    if (action === 'ongoing') return page > 1 ? `/ongoing-anime/page/${page}/` : '/ongoing-anime/';
    if (action === 'completed') return page > 1 ? `/complete-anime/page/${page}/` : '/complete-anime/';
    if (action === 'search') return `/?s=${encodeURIComponent(task.query || '')}&post_type=anime`;
    if (action === 'genre') return page > 1 ? `/genres/${id}/page/${page}/` : `/genres/${id}/`;
    if (action === 'detail') return `/anime/${id}/`;
    if (action === 'episode') return `/episode/${id}/`;
    if (action === 'batch') return `/batch/${id}/`;
  }
  if (provider === 'oploverz') {
    if (action === 'home') return '/';
    if (action === 'schedule') return '/jadwal-rilis/';
    if (action === 'search') return `/?s=${encodeURIComponent(task.query || '')}`;
    if (action === 'ongoing') return '/anime/list-mode/';
    if (action === 'completed') return '/anime?status=completed';
    if (action === 'detail') return `/anime/${id}/`;
    if (action === 'episode') {
      /* episodeId bisa berupa URL lengkap (…/naruto-episode-220/?page=2) atau slug polos. */
      const raw = String(task.slug || task.episodeId || '').split(/[?#]/)[0];
      const slug = /^https?:/i.test(raw) ? raw.split('/').filter(Boolean).pop() || '' : raw;
      return `/${encodeURIComponent(slug)}/`;
    }
  }
  if (provider === 'kuramanime') {
    if (action === 'home') return '/';
    if (action === 'schedule') return '/schedule?day=all';
    if (action === 'ongoing' || action === 'completed') return `/anime?status=${action}&page=${page}`;
    if (action === 'detail') return `/anime/${encodeURIComponent(task.animeId || id)}/${encodeURIComponent(task.animeSlug || task.slug || id)}`;
    if (action === 'episode') return `/episode/${encodeURIComponent(task.animeId || '')}/${encodeURIComponent(task.animeSlug || '')}/${encodeURIComponent(task.episodeId || '')}`;
  }
  if (provider === 'kusonime') {
    if (action === 'search') return `/?s=${encodeURIComponent(task.query || '')}&post_type=post`;
    if (action === 'movies') return page > 1 ? `/anime-movie-list/page/${page}/` : '/anime-movie-list/';
    if (action === 'detail') return `/${(task.slug || task.id || '').replace(/^\/+|\/+$/g, '')}/`;
  }
  throw new Error(`Operasi ${action} tidak tersedia untuk sumber ${provider}.`);
}

function parseCards(provider: Source, doc: Document, base: string): any[] {
  if (provider === 'otakudesu') return nodes(doc, '.venz ul li').map(el => {
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
  if (provider === 'oploverz') return nodes(doc, '.listupd article.bs').map(el => {
    const a = el.querySelector('a.tip') || el.querySelector('a');
    const href = abs(base, attr(a, 'href'));
    return card(txt(el.querySelector('h2[itemprop="headline"]')) || txt(el.querySelector('.tt')),
      abs(base, attr(el.querySelector('.limit img'), 'src')), href, {
        poster: abs(base, attr(el.querySelector('.limit img'), 'src')),
        type: txt(el.querySelector('.typez')), status: txt(el.querySelector('.limit .status')) || txt(el.querySelector('.epx')),
        episode: txt(el.querySelector('.epx')), rating: txt(el.querySelector('.rating')),
        slug: idFrom(href, '/anime/'), href
      });
  }).filter(x => x.title && x.href);
  if (provider === 'kuramanime') return nodes(doc, '#animeList .product__item, .trending__product .product__item').map(el => {
    const a = el.querySelector('.product__item__text h5 a');
    const href = abs(base, attr(a, 'href'));
    const pic = el.querySelector('.product__item__pic');
    return card(txt(el.querySelector('.product__item__text h5')), abs(base, attr(pic, 'data-setbg')), href, {
      quality: txt(el.querySelector('.product__item__text ul a:nth-child(2)')),
      type: txt(el.querySelector('.product__item__text ul a:nth-child(1)')),
      highlight: txt(pic?.querySelector('.ep')), episodes: (txt(pic?.querySelector('.ep')).match(/Ep\s*([^\s/]+)/i) || [])[1] || '',
      totalEpisodes: (txt(pic?.querySelector('.ep')).match(/\/\s*([^\s]+)/) || [])[1] || '', kuramanimeUrl: href
    });
  }).filter(x => x.title && x.href);
  return nodes(doc, '.vezone .venz .kover').map(el => {
    const a = el.querySelector('.thumb a');
    const href = abs(base, attr(a, 'href'));
    return { title: attr(a, 'title') || txt(a), thumbnail: abs(base, attr(el.querySelector('img'), 'src')), url: href, endpoint: href };
  }).filter(x => x.title && x.url);
}

/** Halaman challenge/block Cloudflare. Beacon `/cdn-cgi/challenge-platform/scripts/jsd` ada di halaman normal. */
const CF_CHALLENGE = /_cf_chl_opt|cf-chl-|<title>\s*Just a moment|Enable JavaScript and cookies to continue|Attention Required!/i;

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

function oploverzServerList(doc: Document): any[] {
  const options = nodes(doc, 'select.mirror option[value]').filter(o => attr(o, 'value'));
  if (!options.length) return [];
  return [{
    title: 'Server',
    serverList: options.map((o, i) => ({
      title: (txt(o).split('|').slice(1).join('|').trim() || txt(o) || 'Server ' + (i + 1)),
      serverId: 'oplz:' + attr(o, 'value'),
      default: attr(o, 'data-index') === '1' || i === 0
    }))
  }];
}

export function parseHtml(task: ScrapeTask, html: string, pageUrl: string): any {
  const { provider, action } = task;
  if (CF_CHALLENGE.test(html)) {
    throw new Error('Situs sumber menampilkan pemeriksaan Cloudflare pada jaringan ini.');
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const cards = parseCards(provider, doc, pageUrl);
  if (provider === 'otakudesu' && action === 'genres') return { data: { genreList: nodes(doc, 'ul.genres li a').map(a => ({ title: txt(a), genreId: idFrom(abs(pageUrl, attr(a, 'href')), '/genres/') })) } };
  if (provider === 'otakudesu' && action === 'genre') {
    const animeList = nodes(doc, '.page .col-anime').map(el => { const a = el.querySelector('.col-anime-title a'); const href = abs(pageUrl, attr(a, 'href')); return { title: txt(a), animeId: idFrom(href, '/anime/'), otakudesuUrl: href, poster: abs(pageUrl, attr(el.querySelector('img'), 'src')) }; });
    return { data: { animeList }, pagination: { currentPage: 1, hasNextPage: !!doc.querySelector('.pagination .page-numbers.next') } };
  }
  if (action === 'home') {
    if (provider === 'otakudesu') {
      const groups = nodes(doc, '.venz');
      return { data: { ongoing: { animeList: parseCards(provider, groups[0] ? wrap(groups[0]) : doc, pageUrl) }, completed: { animeList: parseCards(provider, groups[1] ? wrap(groups[1]) : doc, pageUrl) } } };
    }
    if (provider === 'oploverz') {
      const popular = nodes(doc, '.listupd.popularslider .popconslide article.bs');
      const latest = nodes(doc, '.listupd.normal .excstf article.stylesix');
      const cv = (el: Element) => {
        const a = el.querySelector('a.tip') || el.querySelector('a');
        const href = abs(pageUrl, attr(a, 'href'));
        return { title: txt(el.querySelector('h2[itemprop="headline"]')) || txt(el.querySelector('.tt')),
          seriesName: txt(el.querySelector('.tt')), poster: abs(pageUrl, attr(el.querySelector('img'), 'src')),
          href, slug: idFrom(href, '/anime/'), episode: txt(el.querySelector('.epx')), type: txt(el.querySelector('.typez')) };
      };
      return { data: { popularToday: { animeList: popular.map(cv) }, latestRelease: { animeList: latest.map(cv) } } };
    }
    if (provider === 'kuramanime') {
      const sections = nodes(doc, '.product.spad .trending__product');
      const listAt = (i: number) => sections[i] ? parseCards(provider, wrap(sections[i]), pageUrl) : [];
      return { data: { ongoing: { episodeList: listAt(0) }, completed: { animeList: listAt(1) }, movie: { animeList: listAt(2) } } };
    }
    return { data: { update_terbaru: cards, seasons_anime: [], genres: [], rekomendasi: [] } };
  }
  if (action === 'schedule') {
    if (provider === 'otakudesu') return { data: { scheduleList: nodes(doc, '.kglist321').map(day => ({
      title: txt(day.querySelector('h2')), animeList: nodes(day, 'ul li a').map(a => ({ title: txt(a), animeId: idFrom(abs(pageUrl, attr(a, 'href')), '/anime/'), otakudesuUrl: abs(pageUrl, attr(a, 'href')) }))
    })) } };
    if (provider === 'oploverz') return { data: { scheduleList: nodes(doc, '.schedulepage').map(day => ({
      day: txt(day.querySelector('.releases h3 span')), animeList: nodes(day, '.listupd .bs').map(el => {
        const a = el.querySelector('a'); const href = abs(pageUrl, attr(a, 'href'));
        return { title: txt(el.querySelector('.tt')), poster: abs(pageUrl, attr(el.querySelector('.limit img'), 'src')),
          slug: idFrom(href, '/anime/'), href, day: txt(day.querySelector('.releases h3 span')), episode: txt(el.querySelector('.sb.Sub')) };
      })
    })) } };
    if (provider === 'kuramanime') return { data: { animeList: cards.map(c => ({ ...c, day: '', releaseTime: '' })) } };
  }
  if (action === 'search') {
    if (provider === 'otakudesu') {
      const searchCards = nodes(doc, '.page .chivsrc li').map(el => {
        const a = el.querySelector('h2 a');
        const href = abs(pageUrl, attr(a, 'href'));
        const img = el.querySelector('img');
        const sets = nodes(el, '.set');
        let genre = '', status = '', score = '';
        sets.forEach((s, i) => {
          const txt = clean(s?.textContent);
          if (i === 0) genre = txt.replace('Genres', '').replace(':', '').trim();
          else if (i === 1) status = txt.replace('Status', '').replace(':', '').trim();
          else if (i === 2) score = txt.replace('Rating', '').replace(':', '').trim();
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
    if (provider === 'oploverz') {
      const searchCards = nodes(doc, '.listupd article.bs, .bixbox .anime-list li').map(el => {
        const a = el.querySelector('a.tip, a[href*="/anime/"]');
        const href = abs(pageUrl, attr(a, 'href'));
        return card(
          txt(el.querySelector('h2[itemprop="headline"], .tt, .animpos-title')),
          abs(pageUrl, attr(el.querySelector('.limit img, img'), 'src')),
          href,
          { poster: abs(pageUrl, attr(el.querySelector('.limit img, img'), 'src')), type: txt(el.querySelector('.typez')), status: txt(el.querySelector('.epx')), episode: txt(el.querySelector('.epx')), rating: txt(el.querySelector('.rating')), slug: idFrom(href, '/anime/') }
        );
      }).filter(x => x.title && x.href);
      return { data: { animeList: searchCards, listAnime: searchCards.map(c => ({ title: c.title, thumbnail: c.poster, url: c.href, endpoint: c.href })) } };
    }
    if (provider === 'kuramanime') {
      const searchCards = nodes(doc, '.product__item, .trending__product .product__item, .animpos li').map(el => {
        const a = el.querySelector('.product__item__text h5 a, a[href*="/anime/"]');
        const href = abs(pageUrl, attr(a, 'href'));
        const pic = el.querySelector('.product__item__pic, .animpos-img');
        return card(
          txt(el.querySelector('.product__item__text h5, .animpos-title')),
          abs(pageUrl, attr(pic, 'data-setbg')),
          href,
          { quality: txt(el.querySelector('.product__item__text ul a:nth-child(2)')), type: txt(el.querySelector('.product__item__text ul a:nth-child(1)')), highlight: txt(pic?.querySelector('.ep')), episodes: (txt(pic?.querySelector('.ep')).match(/Ep\s*([^\s/]+)/i) || [])[1] || '', totalEpisodes: (txt(pic?.querySelector('.ep')).match(/\/\s*([^\s]+)/) || [])[1] || '', kuramanimeUrl: href }
        );
      }).filter(x => x.title && x.href);
      return { data: { animeList: searchCards, listAnime: searchCards.map(c => ({ title: c.title, thumbnail: c.poster, url: c.href, endpoint: c.href })) } };
    }
    if (provider === 'kusonime') {
      const searchCards = nodes(doc, '.vezone .venz .kover').map(el => {
        const a = el.querySelector('.content h2 a') || el.querySelector('.thumb a') || el.querySelector('a');
        const href = abs(pageUrl, attr(a, 'href'));
        const img = el.querySelector('.thumbz img, img');
        return { title: txt(el.querySelector('.content h2 a')) || attr(a, 'title') || txt(a), thumbnail: abs(pageUrl, attr(img, 'src')), url: href, endpoint: href.replace(ROOT.kusonime + '/', '').replace(/\/+$/, '') };
      }).filter(x => x.title && x.url);
      return { data: { animeList: searchCards, listAnime: searchCards } };
    }
    return { data: { animeList: cards, listAnime: cards.map(c => ({ title: c.title, thumbnail: c.poster, url: c.href, endpoint: c.href })) } };
  }
  if (['ongoing', 'completed', 'genre'].includes(action)) {
    if (provider === 'oploverz') {
      const sections = nodes(doc, '.bixboxarc .blix').map(section => ({
        letter: txt(section.querySelector('span')),
        animeList: nodes(section, 'ul li a').map(a => { const href = abs(pageUrl, attr(a, 'href')); return { title: txt(a), slug: idFrom(href, '/anime/'), href }; })
      }));
      if (sections.length) return { data: { sectionList: sections, animeList: cards }, pagination: { currentPage: 1, hasNextPage: false } };
    }
    if (provider === 'otakudesu' && action === 'genre') {
      const genreCards = nodes(doc, '.page .col-anime').map(el => {
        const a = el.querySelector('.col-anime-title a'); const href = abs(pageUrl, attr(a, 'href'));
        return { title: txt(a), animeId: idFrom(href, '/anime/'), otakudesuUrl: href, poster: abs(pageUrl, attr(el.querySelector('img'), 'src')) };
      });
      return { data: { animeList: genreCards }, pagination: { currentPage: 1, hasNextPage: !!doc.querySelector('.pagination .next') } };
    }
    return { data: { animeList: cards, episodeList: cards, sectionList: [{ animeList: cards }] }, pagination: { currentPage: 1, hasNextPage: !!doc.querySelector('.pagination a.next, a.next.page-numbers'), nextPage: 2 } };
  }
  if (action === 'detail') {
    if (provider === 'oploverz') {
      const info = nodes(doc, '.spe span');
      const get = (label: string) => { const s = info.find(x => txt(x.querySelector('b')).includes(label)); return txt(s).replace(txt(s?.querySelector('b')), '').replace(':', '').trim(); };
      const href = (a: Element) => abs(pageUrl, attr(a, 'href'));
      const d = { title: txt(doc.querySelector('h1.entry-title')), poster: abs(pageUrl, attr(doc.querySelector('.thumbook .thumb img'), 'src')),
        status: get('Status'), studio: get('Studio'), duration: get('Duration'), type: get('Type'), rating: txt(doc.querySelector('.rating strong')),
        releasedOn: get('Released on'), synopsis: { paragraphList: nodes(doc, '.entry-content p').map(txt) },
        genres: nodes(doc, '.genxed a').map(txt), episodeList: nodes(doc, '.eplister ul li').map(el => ({ episode: txt(el.querySelector('.epl-num')), title: txt(el.querySelector('.epl-title')), date: txt(el.querySelector('.epl-date')), href: href(el.querySelector('a')!) })) };
      return { data: { details: d } };
    }
    if (provider === 'otakudesu') {
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
    if (provider === 'kuramanime') {
      const title = txt(doc.querySelector('.anime__details__title h3'));
      const info = nodes(doc, '.anime__details__widget ul li .col-9').map(txt);
      const episodeAnchors = nodes(doc.querySelector('#episodeLists') ? new DOMParser().parseFromString(attr(doc.querySelector('#episodeLists'), 'data-content'), 'text/html') : doc, 'a');
      const nums = episodeAnchors.map(a => Number((txt(a).match(/\b(\d+)\b/) || [])[1])).filter(Number.isFinite);
      const d = { title, alternativeTitle: txt(doc.querySelector('.anime__details__title h3')?.nextElementSibling), animeId: idFrom(pageUrl, '/anime/'), animeSlug: pageUrl.split('/').filter(Boolean).pop(),
        poster: abs(pageUrl, attr(doc.querySelector('.anime__details__pic'), 'data-setbg')), synopsis: { paragraphList: [txt(doc.querySelector('#synopsisField'))].filter(Boolean) },
        episode: { first: Math.min(...nums) || 1, last: Math.max(...nums) || 0 }, episodes: info[1] || '', aired: info[3] || '', duration: info[5] || '', score: info[14] || '',
        type: { title: txt(doc.querySelector('.anime__details__widget ul li:nth-child(1) a')) }, status: { title: txt(doc.querySelector('.anime__details__widget ul li:nth-child(3) a')) },
        studioList: [], genreList: nodes(doc, '.anime__details__widget ul li a').map(a => ({ title: txt(a) })), similarAnimeList: [] };
      return { data: { details: d } };
    }
  }
  if (action === 'episode') {
    const iframe = doc.querySelector('#embed_holder iframe, iframe');
    if (provider === 'kuramanime') {
      const qualityList = nodes(doc, '#player source').map(source => ({ title: attr(source, 'size'), serverList: [{ title: 'kuramadrive', serverId: attr(source, 'src') }] }));
      return { data: { details: { episodeTitle: txt(doc.querySelector('#episodeTitle')), server: { qualityList }, download: { qualityList: [] }, info: {} } } };
    }
    const d = provider === 'oploverz' ? { title: txt(doc.querySelector('h1.entry-title')), streamingUrl: abs(pageUrl, attr(iframe, 'src')), server: { qualityList: oploverzServerList(doc) }, download: { qualityList: [] }, info: {} }
      : { title: txt(doc.querySelector('.venutama h1.posttl')), defaultStreamingUrl: abs(pageUrl, attr(doc.querySelector('.player-embed iframe') || iframe, 'src')), server: { qualityList: otakudesuServerList(doc) }, download: { qualityList: [] }, info: {} };
    return { data: { details: d } };
  }
  if (provider === 'otakudesu' && action === 'batch') {
    const formatList = nodes(doc, '.download h4, .download h3').map(head => {
      const section = head.nextElementSibling;
      return { title: txt(head), qualityList: nodes(section || doc, 'li').map(li => ({ title: txt(li.querySelector('strong')), size: txt(li.querySelector('i')), urlList: nodes(li, 'a').map(a => ({ title: txt(a), url: abs(pageUrl, attr(a, 'href')) })) })) };
    });
    return { data: { details: { download: { formatList } } } };
  }
  if (provider === 'kusonime') {
    if (action === 'movies') {
      const list = nodes(doc, '.penzbar .jdlbar ul li a.kmz, #abtext .jdlbar a').map(a => { const href = abs(pageUrl, attr(a, 'href')); return { title: txt(a), thumbnail: '', url: href, endpoint: href.replace(ROOT.kusonime + '/', '').replace(/\/+$/, '') }; });
      return { data: list };
    }
    const meta: Record<string, string> = {};
    nodes(doc, '.info p').forEach(el => { const key = txt(el.querySelector('b')).trim().toLowerCase().replace(/\s+/g, '_'); const value = txt(el).replace(txt(el.querySelector('b')), '').replace(/^\s*:/, '').trim(); if (key) meta[key] = value; });
    const list_download = nodes(doc, '#dl .smokeddlrh').map(group => ({ title: txt(group.querySelector('.smokettlrh')), download_link: nodes(group, '.smokeurlrh').map(q => ({ type: txt(q.querySelector('strong')), links: nodes(q, 'a').map(a => ({ name: txt(a), url: abs(pageUrl, attr(a, 'href')) })) })) }));
    const d = { title: txt(doc.querySelector('.jdlz')), japanese: meta.japanese || '', type: meta.type || 'Movie', status: meta.status || '', thumbnail: abs(pageUrl, attr(doc.querySelector('.post-thumb img'), 'src')),
      released_on: meta.released_on || meta.released || meta.tanggal_rilis || '', total_episode: meta.total_episode || '', duration: meta.duration || '', producers: meta.producers || meta.producer || '', score: meta.score || '', genre: nodes(doc, '.info a, .kateg a').map(txt).join(','),
      sinopsis: txt(doc.querySelector('.lexot > p')), list_download };
    return { data: d };
  }
  if (cards.length) return { data: { animeList: cards } };
  throw new Error('Struktur halaman sumber tidak dikenali. Situs mungkin berubah atau mengirim halaman challenge.');
}

function wrap(el: Element): Document {
  const d = document.implementation.createHTMLDocument(''); d.body.appendChild(el.cloneNode(true)); return d;
}

export async function scrapeRequest(task: ScrapeTask, timeout = 20000): Promise<any> {
  if (!Capacitor.isNativePlatform()) throw new Error('Pengambilan data scraper hanya tersedia di APK Android. Browser web membatasi akses lintas situs (CORS).');
  const provider = task.provider;
  if (provider === 'otakudesu' && task.action === 'server') {
    const token = task.id || '';
    try {
      const [src, payload] = token.startsWith('oplz:') ? ['oploverz', token.slice(5)] : ['otakudesu', token];
      if (src === 'oploverz') {
        const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
        const doc = new DOMParser().parseFromString(decoded, 'text/html');
        const url = attr(doc.querySelector('iframe'), 'src');
        return { data: { details: { url } } };
      }
      const data = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, string>;
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
  const url = ROOT[provider] + sourcePath(task);
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
