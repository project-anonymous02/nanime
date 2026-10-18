import type { Card, DownloadLink, EpisodeItem } from '../core/types';

/** Util parsing HTML untuk keluarga tema animestream/themeresia (Anichin, Samehadaku, Lendrive, dsb). */

export const clean = (s: string | null | undefined): string => (s || '').replace(/\s+/g, ' ').trim();
export const txt = (el: Element | null | undefined): string => clean(el?.textContent);
export const attr = (el: Element | null | undefined, name: string): string => el?.getAttribute(name) || '';
export const abs = (base: string, value: string): string => {
  try {
    return value ? new URL(value, base).href : '';
  } catch {
    return '';
  }
};
export const nodes = (doc: ParentNode, selector: string): Element[] => Array.from(doc.querySelectorAll(selector));

/** Halaman challenge/block Cloudflare. */
export const CF_CHALLENGE =
  /_cf_chl_opt|cf-chl-|<title>\s*Just a moment|Enable JavaScript and cookies to continue|Attention Required!/i;

export function parseDoc(html: string): Document {
  if (CF_CHALLENGE.test(html)) {
    throw new Error('Situs sumber menampilkan pemeriksaan Cloudflare pada jaringan ini.');
  }
  return new DOMParser().parseFromString(html, 'text/html');
}

/** Segment terakhir path URL tanpa query — dipakai sebagai slug/id. */
export function pathSlug(url: string): string {
  try {
    const u = new URL(url, 'https://x.invalid');
    const seg = u.pathname.split('/').filter(Boolean).pop() || '';
    return seg;
  } catch {
    return '';
  }
}

export interface CardOpts {
  /** slug/animeId diambil dari link /anime/ bila true (default), selain itu pakai segment terakhir. */
  preferAnimePath?: boolean;
}

/** Read only explicit category/rating metadata already present in the provider document. */
export function parseContentMetadata(root: ParentNode): Pick<Card, 'genres' | 'tags' | 'contentRating' | 'classification'> {
  const labels = (selector: string) => nodes(root, selector).map(node => clean(attr(node, 'data-genre') || attr(node, 'data-tag') || txt(node))).filter(Boolean);
  const ratingNode = root.querySelector('[data-content-rating], [data-rating], .content-rating, .age-rating');
  const classificationNode = root.querySelector('[data-content-classification], [data-classification], .content-category');
  return {
    genres: [...new Set(labels('.genxed a, .mgen a, .genre a, .genres a, [data-genre]'))],
    tags: [...new Set(labels('.tag a, .tags a, [data-tag]'))],
    contentRating: clean(attr(ratingNode, 'data-content-rating') || attr(ratingNode, 'data-rating') || txt(ratingNode)),
    classification: clean(attr(classificationNode, 'data-content-classification') || attr(classificationNode, 'data-classification') || txt(classificationNode))
  };
}

/**
 * Slug halaman post episode/batch → slug seri.
 * "one-piece-episode-1180-subtitle-indonesia" → "one-piece"
 * "…-ep-02-dual-subs-…" → "…" (Lendrive), "…-batch-dual-subs-…" → "…"
 * Dipakai agar kartu "rilis terbaru" (link post) tetap bisa dibuka ke halaman detail /anime/.
 */
export function seriesSlugFromPost(slug: string): string {
  const m = slug.match(/^(.*?)-(?:episode|ep)-\d+.*$/i) || slug.match(/^(.*?)-batch.*$/i);
  return m && m[1] ? m[1] : slug;
}

/** Link detail seri /anime/ dari kartu mana pun (post episode diserder ke slug seri). */
export function detailHrefFromCard(href: string): { href: string; slug: string; rewritten: boolean } {
  const slug = pathSlug(href);
  if (!slug) return { href, slug: '', rewritten: false };
  if (/\/anime\//.test(href)) return { href, slug, rewritten: false };
  const series = seriesSlugFromPost(slug);
  try {
    const u = new URL(href);
    u.pathname = '/anime/' + encodeURIComponent(series) + '/';
    return { href: u.href, slug: series, rewritten: series !== slug };
  } catch {
    return { href, slug: series, rewritten: series !== slug };
  }
}

/**
 * Parse kartu daftar standar `.bs .bsx` (dipakai Anichin, Samehadaku, Lendrive, Oploverz).
 * sourceUrl diusahakan selalu berupa link /anime/ bila tersedia agar bisa buka detail.
 */
export function parseBsxCards(doc: ParentNode, base: string, provider: string, opts: CardOpts = {}): Card[] {
  const out: Card[] = [];
  nodes(doc, 'article.bs, article.bsx, div.bs, div.bsx').forEach(el => {
    const a = (el.querySelector('a.tip') as HTMLAnchorElement) || (el.querySelector('a[href]') as HTMLAnchorElement);
    const href = abs(base, attr(a, 'href'));
    if (!href) return;
    const title =
      clean(el.querySelector('h2[itemprop="headline"]')?.textContent) ||
      clean(el.querySelector('.tt')?.textContent) ||
      clean(el.querySelector('.entry-title')?.textContent) ||
      attr(a, 'title') ||
      clean(el.querySelector('h2')?.textContent);
    if (!title) return;
    const img = el.querySelector('.limit img') || el.querySelector('img');
    const poster = abs(base, attr(img, 'data-src') || attr(img, 'data-lazy-src') || attr(img, 'data-original') || attr(img, 'data-lazy-srcset') || attr(img, 'src'));
    const resolved = detailHrefFromCard(href);
    const slug = resolved.slug;
    out.push({
      id: slug,
      provider,
      title,
      poster,
      score: clean(el.querySelector('.rating')?.textContent),
      type: clean(el.querySelector('.typez')?.textContent),
      status: clean(el.querySelector('.epx')?.textContent) || clean(el.querySelector('.status')?.textContent),
      epLabel: clean(el.querySelector('.epx')?.textContent),
      sub: clean(el.querySelector('.sb')?.textContent),
      sourceUrl: resolved.href,
      slug,
      ...parseContentMetadata(el)
    });
  });
  return out;
}

/** Info `<div class="spe">` → peta label→nilai (Status, Studio, Type, Episodes, dst.). */
export function parseSpeInfo(doc: ParentNode): Record<string, string> {
  const info: Record<string, string> = {};
  nodes(doc, '.spe span, .info span').forEach(span => {
    const b = span.querySelector('b');
    const key = txt(b).toLowerCase().replace(/[:：]\s*$/, '').replace(/\s+/g, ' ').trim();
    if (!key) return;
    const val = txt(span).replace(txt(b), '').replace(/^[:：]\s*/, '').trim();
    if (val) info[key] = val;
  });
  return info;
}

export interface ParsedDetail {
  title: string;
  alt: string;
  poster: string;
  score: string;
  info: Record<string, string>;
  synopsis: string;
  genres: { t: string; id: string }[];
  episodeList: EpisodeItem[];
  recommendations: Card[];
}

/** Halaman detail animestream: h1.entry-title + thumbook + spe + genxed + eplister. */
export function parseAnimestreamDetail(doc: Document, pageUrl: string, provider: string): ParsedDetail {
  const base = pageUrl;
  const h1 = doc.querySelector('h1.entry-title, h1[itemprop="name"], h1');
  const title = txt(h1);
  const poster = abs(
    base,
    attr(doc.querySelector('.thumbook .thumb img, .thumbook img, .bsx img'), 'data-src') ||
      attr(doc.querySelector('.thumbook .thumb img'), 'data-lazy-src') ||
      attr(doc.querySelector('.thumbook .thumb img'), 'data-original') ||
      attr(doc.querySelector('.thumbook .thumb img'), 'src')
  );
  const info = parseSpeInfo(doc);
  const alt = txt(doc.querySelector('.alter, .alternative, span.alter'));
  const synopsis =
    clean(
      nodes(doc, '.entry-content p, .sinopc p, .synopsis p, #synopsis p')
        .map(p => txt(p))
        .join('\n\n')
    ) || '';
  const genres = nodes(doc, '.genxed a, .mgen a').map(a => {
    const href = abs(base, attr(a, 'href'));
    return { t: txt(a), id: pathSlug(href) };
  });
  const episodeList = parseEpisodeList(doc, base);
  const currentPath = pathSlug(pageUrl);
  const recommendations = parseBsxCards(doc, base, provider).filter(c => c.slug !== currentPath);
  return {
    title,
    alt,
    poster,
    score: clean(doc.querySelector('.rating strong, .rating .num, .rating')?.textContent),
    info,
    synopsis,
    genres,
    episodeList,
    recommendations
  };
}

/** Daftar episode `.eplister ul li` → EpisodeItem (link post episode, bukan /episode/). */
export function parseEpisodeList(doc: ParentNode, base: string): EpisodeItem[] {
  const out: EpisodeItem[] = [];
  nodes(doc, '.eplister ul li').forEach(li => {
    const a = li.querySelector('a[href]') as HTMLAnchorElement;
    const href = abs(base, attr(a, 'href'));
    if (!href) return;
    const num = txt(li.querySelector('.epl-num'));
    if (/^batch$/i.test(num)) return;
    out.push({
      num,
      id: href,
      slug: pathSlug(href),
      date: txt(li.querySelector('.epl-date')),
      title: txt(li.querySelector('.epl-title'))
    });
  });
  return out;
}

/**
 * URL embed di halaman episode: `.player-embed iframe`.
 * LiteSpeed lazyload menaruh URL asli di `data-litespeed-src` (src="about:blank").
 */
export function parseIframeEmbed(doc: ParentNode, base: string): string {
  const iframe = doc.querySelector('.player-embed iframe, #pembed iframe, #embed_holder iframe, .video-content iframe, iframe[data-litespeed-src], iframe');
  if (!iframe) return '';
  const src = attr(iframe, 'data-litespeed-src') || attr(iframe, 'src');
  if (!src || src === 'about:blank' || src.startsWith('javascript:')) return '';
  return abs(base, src);
}

/** Semua iframe embed (bila halaman punya lebih dari satu server). */
export function parseIframeEmbeds(doc: ParentNode, base: string): { name: string; url: string }[] {
  const seen = new Set<string>();
  const out: { name: string; url: string }[] = [];
  nodes(doc, '.player-embed iframe, #pembed iframe, #embed_holder iframe, .video-content iframe, iframe').forEach((f, i) => {
    const src = attr(f, 'data-litespeed-src') || attr(f, 'src');
    if (!src || src === 'about:blank' || src.startsWith('javascript:')) return;
    const url = abs(base, src);
    if (!url || seen.has(url)) return;
    seen.add(url);
    const title = attr(f, 'title') || attr(f, 'name') || 'Server ' + (i + 1);
    out.push({ name: title, url });
  });
  return out;
}

/**
 * Blok unduhan gaya themesia baru (`.soraddlx .sorattlx` + `.soraurlx`)
 * yang dipakai Lendrive: header kualitas + label ukuran + tautan host.
 */
export function parseSoraDownloads(doc: ParentNode, base: string): DownloadLink[] {
  const out: DownloadLink[] = [];
  nodes(doc, '.soraddlx, .soradlg').forEach(block => {
    const quality = txt(block.querySelector('.sorattlx')) || 'Unduhan';
    nodes(block, '.soraurlx').forEach(row => {
      const label = txt(row.querySelector('strong'));
      nodes(row, 'a[href]').forEach(a => {
        const url = abs(base, attr(a, 'href'));
        if (!/^https?:/i.test(url)) return;
        out.push({ quality: quality || 'Unduhan', name: label || txt(a) || 'Link', url });
      });
    });
  });
  return out;
}

/** Judul halaman → episode number bila tersedia ("... Episode 288 Sub Indo" → "288"). */
export function episodeNumFromTitle(title: string): string {
  return (String(title).match(/\bepisode\s*(\d+(?:\.\d+)?)/i) || [])[1] || '';
}
