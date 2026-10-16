import type { AnimeMeta, MetaAnimeBrief } from '../core/types';
import { anilistById, anilistSearch, anilistTrending } from './anilist';
import { kitsuById, kitsuSearch, kitsuTrending } from './kitsu';
import { matchMeta, cleanQuery, type MatchResult } from './match';

export { matchMeta, matchScore, pickBest, titleTokens, cleanQuery, AUTO_LINK, SUGGEST } from './match';
export type { MatchResult } from './match';

/** Cari kandidat metadata: AniList primer, Kitsu bila AniList gagal/kosong. */
export async function searchMeta(query: string, perPage = 12): Promise<MetaAnimeBrief[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const list = await anilistSearch(q, perPage);
    if (list.length) return list;
  } catch (e) {
    console.warn('AniList search gagal, fallback Kitsu:', e);
  }
  try {
    return await kitsuSearch(q, Math.min(perPage, 10));
  } catch (e) {
    console.warn('Kitsu search gagal:', e);
    return [];
  }
}

/**
 * Cari metadata terbaik untuk judul provider + skor kecocokannya.
 * Hasil < SUGGEST tidak dikembalikan (jangan auto-link).
 */
export async function resolveMeta(title: string): Promise<MatchResult | null> {
  const q = cleanQuery(title) || title;
  const cands = await searchMeta(q, 10);
  if (!cands.length) return null;
  return matchMeta(title, cands);
}

/** Ambil metadata lengkap by ID + sumber. */
export async function fetchMeta(id: number | string, source: 'anilist' | 'kitsu' = 'anilist'): Promise<AnimeMeta> {
  return source === 'kitsu' ? kitsuById(id) : anilistById(Number(id));
}

/** Anime trending (AniList primer, Kitsu trending fallback). */
export async function trendingMeta(perPage = 14): Promise<MetaAnimeBrief[]> {
  try {
    const list = await anilistTrending(perPage);
    if (list.length) return list;
  } catch (e) {
    console.warn('AniList trending gagal:', e);
  }
  try {
    return await kitsuTrending(perPage);
  } catch (e) {
    console.warn('Kitsu trending gagal:', e);
    return [];
  }
}
