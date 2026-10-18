import { cleanVal, seriesSlug } from './utils';
import type { Card } from './types';

export function getPoster(item: any): string {
  if (!item) return '';
  return item.poster || item.image || item.cover || item.thumbnail || '';
}

/** Carry explicit source content classification so discovery policy can filter before rendering. */
function contentMetadata(item: any): Pick<Card, 'genres' | 'tags' | 'contentRating' | 'classification'> {
  const labels = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.map(entry => cleanVal(typeof entry === 'string' ? entry : entry?.title || entry?.name || entry?.label)).filter(Boolean);
  };
  return {
    genres: labels(item?.genres || item?.genreList),
    tags: labels(item?.tags || item?.tagList),
    contentRating: cleanVal(item?.contentRating || item?.ageRating || item?.ratingAge || item?.certification),
    classification: cleanVal(item?.contentClassification || item?.classification || item?.category)
  };
}

export function normalizeOtakudesuCard(item: any): Card | null {
  if (!item) return null;
  /* .epz bisa " Episode 2" (ongoing) atau "12 Episode" (complete) — ambil angkanya saja. */
  const epsRaw = cleanVal(item.episodes);
  const eps = (epsRaw.match(/\d+/) || [])[0] || '';
  const isOngoing = !!(item.latestReleaseDate || item.releaseDay);
  const date = cleanVal(item.latestReleaseDate || item.lastReleaseDate);
  return {
    id: String(item.animeId || ''),
    provider: 'otakudesu',
    title: cleanVal(item.title) || 'Unknown',
    poster: String(getPoster(item)),
    score: cleanVal(item.score),
    type: cleanVal(item.type),
    status: cleanVal(item.status),
    epLabel: eps ? (isOngoing ? 'Ep ' + eps : eps + ' Eps') : '',
    sub: date || cleanVal(item.releaseDay),
    sourceUrl: item.otakudesuUrl || '',
    ...contentMetadata(item)
  };
}

export function normalizeOploverzCard(item: any): Card | null {
  if (!item) return null;
  const href = item.href || '';
  let slug = cleanVal(item.slug);
  if (!slug && href.indexOf('/anime/') > -1) slug = href.split('/anime/').pop().split(/[?#/]/).filter(Boolean)[0] || '';
  if (!slug) slug = seriesSlug(item.seriesName || item.title || '');
  const series = item.seriesName ? String(item.seriesName).split('\t')[0].replace(/\s+/g, ' ').trim() : '';
  /* Di oploverz, .epx berisi status ("Ongoing"/"Completed"), bukan nomor episode. */
  const epx = cleanVal(item.episode);
  const isStatus = /^(ongoing|completed|ongoing\s|completed\s)/i.test(epx) || !/\d/.test(epx);
  const epLabel = cleanVal(item.episodes) || (isStatus ? '' : epx);
  return {
    id: slug || cleanVal(item.title) || 'Unknown',
    provider: 'oploverz',
    title: series || cleanVal(item.title) || 'Unknown',
    poster: String(getPoster(item)),
    score: cleanVal(item.score),
    type: cleanVal(item.type),
    status: cleanVal(item.status) || (isStatus ? epx : ''),
    epLabel,
    sub: cleanVal(item.releaseTime) || '',
    sourceUrl: href,
    ...contentMetadata(item)
  };
}

export function normalizeKuramanimeCard(item: any): Card | null {
  if (!item) return null;
  const eps = cleanVal(item.episodes);
  const total = cleanVal(item.totalEpisodes);
  return {
    id: String(item.animeId || ''),
    provider: 'kuramanime',
    title: cleanVal(item.title) || 'Unknown',
    poster: String(getPoster(item)),
    score: cleanVal(item.highlight),
    type: cleanVal(item.type),
    status: '',
    epLabel: eps ? (total ? eps + '/' + total : 'Ep ' + eps) : '',
    sub: cleanVal(item.quality),
    sourceUrl: item.kuramanimeUrl || '',
    slug: item.animeSlug || '',
    ...contentMetadata(item)
  };
}

export function normalizeKusonimeCard(item: any, forceType?: string): Card | null {
  if (!item) return null;
  let slug = cleanVal(item.endpoint).replace(/^\/+|\/+$/g, '');
  if (!slug) {
    const u = String(item.url || '');
    if (u.indexOf('://') > -1) slug = (u.split('://').pop() || '').split('/').filter(Boolean).slice(1).join('/');
    slug = slug.split(/[?#]/)[0].replace(/\/+$/, '');
  }
  const title = cleanVal(item.title) || cleanVal(item.name);
  if (!slug || !title) return null;
  return {
    id: slug,
    provider: 'kusonime',
    title,
    poster: String(item.thumbnail || item.image || ''),
    score: '',
    type: cleanVal(item.type || forceType || ''),
    status: cleanVal(item.status),
    epLabel: '',
    sub: '',
    sourceUrl: item.url || '',
    ...contentMetadata(item)
  };
}

export function normalizeCard(item: any, provider: string): Card | null {
  switch (provider) {
    case 'otakudesu':
      return normalizeOtakudesuCard(item);
    case 'oploverz':
      return normalizeOploverzCard(item);
    case 'kuramanime':
      return normalizeKuramanimeCard(item);
    case 'kusonime':
      return normalizeKusonimeCard(item);
    default:
      return null;
  }
}

/* Struktur tervalidasi: [{title, download_link:[{type:"480P", links:[{name,url}]}]}] */
export function parseKusonimeDownloads(list: any): { quality: string; name: string; url: string }[] {
  const out: { quality: string; name: string; url: string }[] = [];
  if (!Array.isArray(list)) return out;
  list.forEach(group => {
    const qlist = group && Array.isArray(group.download_link) ? group.download_link : [];
    qlist.forEach((q: any) => {
      const quality = cleanVal(q && q.type) || 'Unknown';
      const links = q && Array.isArray(q.links) ? q.links : [];
      links.forEach((l: any) => {
        const url = cleanVal(l && l.url);
        if (!/^https?:\/\//i.test(url)) return;
        out.push({ quality, name: cleanVal(l && l.name) || 'Link', url });
      });
    });
  });
  return out;
}

/* Host download file-hosting (bukan media). Dipakai untuk info jujur, bukan pemutaran. */
export const DOWNLOAD_HOSTS = ['acefile.co', 'akirabox.com', 'terabox', 'hxfile.co', 'megaup.net', 'mega.nz', 'pixeldrain.com', 'drive.google.com', 's.id', 'mir.cr'];

export function isDownloadHost(url: string): boolean {
  const u = String(url || '').toLowerCase();
  return DOWNLOAD_HOSTS.some(h => u.indexOf(h) > -1);
}
