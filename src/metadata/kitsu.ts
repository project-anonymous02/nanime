import { httpGetJson } from '../core/http';
import { cached } from '../core/client';
import type { AnimeMeta, MetaAnimeBrief } from '../core/types';

/**
 * Kitsu JSON:API (https://kitsu.io/api/edge) — fallback metadata bila AniList gagal.
 * Endpoint publik ber-CORS; tanpa kredensial.
 */

const ROOT = 'https://kitsu.io/api/edge';
const TTL = { brief: 6 * 3600_000, full: 24 * 3600_000 };

interface KitsuAttrs {
  canonicalTitle?: string;
  titles?: Record<string, string | null>;
  slug?: string;
  synopsis?: string;
  posterImage?: { original?: string; medium?: string; large?: string };
  coverImage?: { original?: string };
  averageRating?: string | null;
  episodeCount?: number | null;
  status?: string | null;
  subtype?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  showType?: string | null;
  youtubeVideoId?: string | null;
}

interface KitsuRel {
  id: string;
  type: string;
  attributes?: KitsuAttrs & { name?: string };
}

function bestTitle(a: KitsuAttrs): string {
  const t = a.titles || {};
  return a.canonicalTitle || t.en_us || t.en_jp || t.ja_jp || t.en || '';
}

function briefOf(id: string, a: KitsuAttrs): MetaAnimeBrief {
  return {
    id: Number(id) || 0,
    source: 'kitsu',
    title: bestTitle(a),
    cover: a.posterImage?.original || a.posterImage?.large || a.posterImage?.medium || '',
    score: a.averageRating ? Math.round(Number(a.averageRating)) / 10 : undefined,
    format: a.subtype || undefined,
    episodes: a.episodeCount || undefined,
    year: a.startDate ? Number(String(a.startDate).slice(0, 4)) || undefined : undefined
  };
}

/** Pencarian Kitsu (filter text). */
export async function kitsuSearch(query: string, perPage = 10): Promise<MetaAnimeBrief[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await cached('meta:kt:search:' + q.toLowerCase(), TTL.brief, async () => {
    const r = await httpGetJson<{ data?: { id: string; attributes: KitsuAttrs }[] }>(
      `${ROOT}/anime?filter[text]=${encodeURIComponent(q)}&page[limit]=${perPage}&sort=-averageRating`,
      { timeout: 20000, retries: 1 }
    );
    return r.data?.data || [];
  });
  return data.map(x => briefOf(x.id, x.attributes));
}

/** Anime trending Kitsu (fallback bila AniList trending gagal). */
export async function kitsuTrending(perPage = 10): Promise<MetaAnimeBrief[]> {
  const data = await cached('meta:kt:trending', TTL.brief, async () => {
    const r = await httpGetJson<{ data?: { id: string; attributes: KitsuAttrs }[] }>(
      `${ROOT}/trending/anime?page[limit]=${perPage}`,
      { timeout: 20000, retries: 1 }
    );
    return r.data?.data || [];
  });
  return data.map(x => briefOf(x.id, x.attributes));
}

/** Detail Kitsu by ID (termasuk genre bila tersedia). */
export async function kitsuById(id: number | string): Promise<AnimeMeta> {
  const row = await cached('meta:kt:id:' + id, TTL.full, async () => {
    const r = await httpGetJson<{ data?: { id: string; attributes: KitsuAttrs }; included?: KitsuRel[] }>(
      `${ROOT}/anime/${encodeURIComponent(String(id))}?include=genres`,
      { timeout: 20000, retries: 1 }
    );
    if (!r.data?.data) throw new Error('Anime tidak ditemukan di Kitsu.');
    return { row: r.data.data, included: r.data.included || [] };
  });

  const a = row.row.attributes;
  const genres = row.included
    .filter(x => x.type === 'genres' && x.attributes?.name)
    .map(x => String(x.attributes!.name));

  const statusMap: Record<string, string> = { current: 'RELEASING', finished: 'FINISHED', upcoming: 'NOT_YET_AIRING' };
  const score = a.averageRating ? Math.round(Number(a.averageRating)) / 10 : undefined;

  return {
    id: Number(row.row.id) || 0,
    source: 'kitsu',
    title: bestTitle(a),
    titleRomaji: a.titles?.en_jp || a.canonicalTitle || undefined,
    titleNative: a.titles?.ja_jp || undefined,
    synonyms: [a.titles?.en, a.titles?.en_us, a.titles?.ja_jp]
      .filter((x): x is string => !!x && x !== bestTitle(a)),
    cover: a.posterImage?.original || a.posterImage?.large || a.posterImage?.medium || '',
    banner: a.coverImage?.original || undefined,
    score,
    format: a.subtype || undefined,
    status: a.status ? statusMap[a.status] || a.status.toUpperCase() : undefined,
    episodes: a.episodeCount || undefined,
    seasonYear: a.startDate ? Number(String(a.startDate).slice(0, 4)) || undefined : undefined,
    studios: [],
    genres,
    synopsis: (a.synopsis || '').replace(/<[^>]+>/g, '').trim() || undefined,
    startDate: a.startDate || undefined,
    relations: [],
    recommendations: [],
    characters: []
  };
}
