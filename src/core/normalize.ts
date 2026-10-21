import { cleanVal } from './utils';
import type { Card } from './types';

export function getPoster(item: any): string {
  if (!item) return '';
  return item.poster || item.image || item.cover || item.thumbnail || '';
}

/** Carry explicit source content classification so discovery policy can filter before rendering. */
function contentMetadata(item: any): Pick<Card, 'genres' | 'tags' | 'contentRating' | 'classification' | 'altTitles' | 'year' | 'externalIds'> {
  const labels = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.map(entry => cleanVal(typeof entry === 'string' ? entry : entry?.title || entry?.name || entry?.label)).filter(Boolean);
  };
  const altRaw = item?.altTitles || item?.alternativeTitles || item?.titles || [];
  const altTitles = (Array.isArray(altRaw) ? altRaw : [altRaw])
    .map(value => cleanVal(typeof value === 'string' ? value : value?.title || value?.name || value?.english || value?.romaji || value?.japanese))
    .filter(Boolean);
  const rawIds = item?.externalIds || item?.external_ids || {};
  const externalIds: Record<string, string> = {};
  for (const key of ['anilist', 'anilistId', 'mal', 'malId', 'anidb', 'anidbId', 'kitsu', 'kitsuId']) {
    if (rawIds[key] != null || item?.[key] != null) {
      const value = cleanVal(rawIds[key] ?? item[key]);
      if (value) externalIds[key.replace(/Id$/, '').toLowerCase()] = value;
    }
  }
  const rawYear = cleanVal(item?.year || item?.releaseYear || item?.releasedOn || item?.aired);
  const year = (rawYear.match(/(?:19|20)\d{2}/) || [])[0] || '';
  return {
    genres: labels(item?.genres || item?.genreList),
    tags: labels(item?.tags || item?.tagList),
    contentRating: cleanVal(item?.contentRating || item?.ageRating || item?.ratingAge || item?.certification),
    classification: cleanVal(item?.contentClassification || item?.classification || item?.category),
    altTitles: [...new Set(altTitles)],
    year,
    externalIds
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

export function normalizeCard(item: any, provider: string): Card | null {
  return provider === 'otakudesu' ? normalizeOtakudesuCard(item) : null;
}

/* Host download file-hosting (bukan media). Dipakai untuk info jujur, bukan pemutaran. */
export const DOWNLOAD_HOSTS = ['acefile.co', 'akirabox.com', 'terabox', 'hxfile.co', 'megaup.net', 'mega.nz', 'pixeldrain.com', 'drive.google.com', 's.id', 'mir.cr'];

export function isDownloadHost(url: string): boolean {
  const u = String(url || '').toLowerCase();
  return DOWNLOAD_HOSTS.some(h => u.indexOf(h) > -1);
}
